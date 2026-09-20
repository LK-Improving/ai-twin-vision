import { expect, test, type Page } from '@playwright/test';

/**
 * 编辑器端到端冒烟（迭代 5.1）。
 *
 * 这些用例只覆盖「单测看不到」的部分：路由守卫放行、场景数据加载、组件库/图层与 Pinia store
 * 的事件接线，以及撤销重做按钮的可用性状态。数据依赖 `pnpm db:seed` 的种子场景。
 *
 * 左栏是「组件库 / 图层」两个 tab（同一时刻只挂载一个），所以加组件要在组件库 tab 操作、
 * 数节点要切到图层 tab。
 *
 * ⚠ 切 tab 只能做一次性动作，绝不能放进 expect.poll 里：点击会触发 tab 的
 *   `transition-colors` 过渡，元素在过渡期间被判定为「not stable」，而下一轮 poll 又点一次，
 *   于是永远稳定不下来 —— CI 上就是这么死锁的（本地机器快，侥幸通过）。
 *   正确姿势：显式切一次 tab，之后 poll 只读数量。
 */

const EDITOR_URL = /\/scenes\/[^/]+\/edit$/;
const LIB_TAB = '组件库';
const OUTLINE_TAB = '图层';

/** 顶部工具栏里的撤销/重做按钮（前两个 ghost 按钮，中间的分隔符是 span） */
const undoBtn = (page: Page) => page.locator('.header-center button').first();
const redoBtn = (page: Page) => page.locator('.header-center button').nth(1);

const tabButton = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).first();

/** 一次性切 tab：先确认可见可点，再等待过渡结束 */
async function switchTab(page: Page, name: string): Promise<void> {
  const tab = tabButton(page, name);
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click({ timeout: 20_000 });
  // 等过渡真正结束（active 样式换过来），避免后续动作打在动画中的元素上
  await expect(tab)
    .toHaveClass(/text-ink(?!-soft)/, { timeout: 10_000 })
    .catch(() => {
      /* 样式断言只作缓冲，失败交给后续 expect 兜底 */
    });
}

/** 进入第一个种子场景的编辑器；同时收集未捕获异常 */
async function openFirstSceneEditor(page: Page): Promise<string[]> {
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

/** 节点数：只读，不产生任何交互 */
const outlineCount = (page: Page): Promise<number> => page.locator('.tree-row').count();

/** 在组件库 tab 双击第一个条目添加节点（条目支持「双击添加」） */
async function addFirstWidget(page: Page): Promise<void> {
  await switchTab(page, LIB_TAB);
  await page.locator('.lib-item').first().dblclick();
}

/** 切到图层 tab 后读一次基线数 */
async function baselineCount(page: Page): Promise<number> {
  await switchTab(page, OUTLINE_TAB);
  return outlineCount(page);
}

test.describe('编辑器冒烟', () => {
  test('进入编辑器后主体就绪且没有未捕获异常', async ({ page }) => {
    const pageErrors = await openFirstSceneEditor(page);

    // 历史栈初始为空：撤销与重做都应不可用
    await expect(undoBtn(page)).toBeDisabled();
    await expect(redoBtn(page)).toBeDisabled();

    expect(pageErrors, `未捕获异常：${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('双击加组件 → 撤销 → 重做，图层节点数随之变化', async ({ page }) => {
    await openFirstSceneEditor(page);

    const baseline = await baselineCount(page);
    await addFirstWidget(page);

    await switchTab(page, OUTLINE_TAB);
    await expect.poll(outlineCount.bind(null, page), { timeout: 30_000 }).toBeGreaterThan(baseline);

    await expect(undoBtn(page)).toBeEnabled();
    await undoBtn(page).click();
    await expect.poll(outlineCount.bind(null, page), { timeout: 30_000 }).toBe(baseline);

    await redoBtn(page).click();
    await expect.poll(outlineCount.bind(null, page), { timeout: 30_000 }).toBeGreaterThan(baseline);
  });

  /**
   * 迭代 5.2 的浏览器侧复验：撤销到中途后再次添加属于「另起新分支」，
   * 必须把 redo 分支截断 —— 用户可见的表现就是重做按钮重新变灰。
   * （修复前这里会走合并分支改写历史槽位，重做仍可用。）
   */
  test('撤销后再添加新组件时重做分支被截断', async ({ page }) => {
    await openFirstSceneEditor(page);

    const baseline = await baselineCount(page);
    await addFirstWidget(page);
    await switchTab(page, OUTLINE_TAB);
    await expect.poll(outlineCount.bind(null, page), { timeout: 30_000 }).toBeGreaterThan(baseline);

    await undoBtn(page).click();
    await expect.poll(outlineCount.bind(null, page), { timeout: 30_000 }).toBe(baseline);
    await expect(redoBtn(page)).toBeEnabled();

    // 新分支：重做必须失效
    await addFirstWidget(page);
    await switchTab(page, OUTLINE_TAB);
    await expect.poll(outlineCount.bind(null, page), { timeout: 30_000 }).toBeGreaterThan(baseline);
    await expect(redoBtn(page)).toBeDisabled();
  });
});
