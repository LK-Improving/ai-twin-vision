import { expect, type Page } from '@playwright/test';

/**
 * e2e 共享辅助：编辑器入口、左栏 tab 切换、图层计数与「双击加组件」。
 *
 * 为什么抽出来：publish-screen 需要「先放一个组件再发布」，才能不依赖种子场景
 * 恰好有节点（CI 用的是刚 seed 完的干净库，节点数量属于夹具细节，不该被断言依赖）。
 *
 * ⚠ 切 tab 只能做一次性动作，绝不能放进 expect.poll：点击会触发 tab 的
 *   `transition-colors` 过渡，过渡期间元素被 Playwright 判为 not stable，
 *   下一轮 poll 又点一次就会永远稳定不下来（CI 上真实踩过，本地侥幸通过）。
 */

export const EDITOR_URL = /\/scenes\/[^/]+\/edit$/;
export const LIB_TAB = '组件库';
export const OUTLINE_TAB = '图层';

/** 顶部工具栏里的撤销/重做按钮（前两个 ghost 按钮，中间分隔符是 span） */
export const undoBtn = (page: Page) => page.locator('.header-center button').first();
export const redoBtn = (page: Page) => page.locator('.header-center button').nth(1);

const tabButton = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).first();

/** 一次性切 tab：先确认可见可点，再等 active 样式落定 */
export async function switchTab(page: Page, name: string): Promise<void> {
  const tab = tabButton(page, name);
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click({ timeout: 20_000 });
  await expect(tab)
    .toHaveClass(/text-ink(?!-soft)/, { timeout: 10_000 })
    .catch(() => {
      /* 样式断言只作缓冲，真正的成败交给后续 expect */
    });
}

/** 进入第一个种子场景的编辑器；返回未捕获异常收集数组 */
export async function openFirstSceneEditor(page: Page): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/scenes');
  const firstCard = page.locator('.scene-card').first();
  await expect(firstCard).toBeVisible({ timeout: 30_000 });
  await firstCard.getByRole('button', { name: '编辑' }).click();
  await page.waitForURL(EDITOR_URL, { timeout: 30_000 });

  // 默认停在组件库 tab，条目出现即说明编辑器主体与组件数据都已就绪
  await expect(page.locator('.lib-item').first()).toBeVisible({ timeout: 30_000 });
  return pageErrors;
}

/** 图层节点数：纯读取，不产生任何交互，可安全用于 expect.poll */
export const outlineCount = (page: Page): Promise<number> => page.locator('.tree-row').count();

/** 切到图层 tab 后读一次基线数 */
export async function baselineCount(page: Page): Promise<number> {
  await switchTab(page, OUTLINE_TAB);
  return outlineCount(page);
}

/** 在组件库 tab 双击第一个条目添加节点（条目支持「双击添加」） */
export async function addFirstWidget(page: Page): Promise<void> {
  await switchTab(page, LIB_TAB);
  await page.locator('.lib-item').first().dblclick();
}

/** 加一个组件并确认它进了图层树（返回添加前的节点数，便于后续断言） */
export async function addWidgetAndVerify(page: Page): Promise<number> {
  const before = await baselineCount(page);
  await addFirstWidget(page);
  await switchTab(page, OUTLINE_TAB);
  await expect.poll(() => outlineCount(page), { timeout: 30_000 }).toBeGreaterThan(before);
  return before;
}
