import { expect, test, type Page } from '@playwright/test';

/**
 * 编辑器端到端冒烟（迭代 5.1）。
 *
 * 这些用例只覆盖「单测看不到」的部分：路由守卫放行、场景数据加载、组件库/图层与 Pinia store
 * 的事件接线，以及撤销重做按钮的可用性状态。数据依赖 `pnpm db:seed` 的种子场景。
 *
 * 左栏是「组件库 / 图层」两个 tab（同一时刻只挂载一个），因此加组件要在组件库 tab 操作、
 * 数节点要切到图层 tab —— 这一点是首次实跑用失败截图确认的，不是推测。
 */

const EDITOR_URL = /\/scenes\/[^/]+\/edit$/;
const LIB_TAB = '组件库';
const OUTLINE_TAB = '图层';

/** 顶部工具栏里的撤销/重做按钮（前两个 ghost 按钮，中间的分隔符是 span） */
const undoBtn = (page: Page) => page.locator('.header-center button').first();
const redoBtn = (page: Page) => page.locator('.header-center button').nth(1);

const switchTab = async (page: Page, name: string): Promise<void> => {
  await page.getByText(name, { exact: true }).first().click();
};

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

/** 双击组件库第一个条目添加节点（组件库条目支持「双击添加」） */
async function addFirstWidget(page: Page): Promise<void> {
  await switchTab(page, LIB_TAB);
  await page.locator('.lib-item').first().dblclick();
}

/** 切到图层 tab 读取节点数（可重复调用，轮询时点击已激活的 tab 是无害的） */
async function outlineCount(page: Page): Promise<number> {
  await switchTab(page, OUTLINE_TAB);
  return page.locator('.tree-row').count();
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

    const baseline = await outlineCount(page);
    await addFirstWidget(page);
    await expect.poll(() => outlineCount(page), { timeout: 15_000 }).toBeGreaterThan(baseline);

    await expect(undoBtn(page)).toBeEnabled();
    await undoBtn(page).click();
    await expect.poll(() => outlineCount(page), { timeout: 15_000 }).toBe(baseline);

    await redoBtn(page).click();
    await expect.poll(() => outlineCount(page), { timeout: 15_000 }).toBeGreaterThan(baseline);
  });

  /**
   * 迭代 5.2 的浏览器侧复验：撤销到中途后再次添加属于「另起新分支」，
   * 必须把 redo 分支截断 —— 用户可见的表现就是重做按钮重新变灰。
   * （修复前这里会走合并分支改写历史槽位，重做仍可用。）
   */
  test('撤销后再添加新组件时重做分支被截断', async ({ page }) => {
    await openFirstSceneEditor(page);

    const baseline = await outlineCount(page);
    await addFirstWidget(page);
    await expect.poll(() => outlineCount(page), { timeout: 15_000 }).toBeGreaterThan(baseline);

    await undoBtn(page).click();
    await expect.poll(() => outlineCount(page), { timeout: 15_000 }).toBe(baseline);
    await expect(redoBtn(page)).toBeEnabled();

    // 新分支：重做必须失效
    await addFirstWidget(page);
    await expect.poll(() => outlineCount(page), { timeout: 15_000 }).toBeGreaterThan(baseline);
    await expect(redoBtn(page)).toBeDisabled();
  });
});
