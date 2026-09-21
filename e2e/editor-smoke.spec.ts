import { expect, test } from '@playwright/test';
import {
  addFirstWidget,
  baselineCount,
  openFirstSceneEditor,
  outlineCount,
  redoBtn,
  switchTab,
  undoBtn,
  OUTLINE_TAB,
} from './helpers';

/**
 * 编辑器端到端冒烟（迭代 5.1）。
 *
 * 只覆盖「单测看不到」的部分：路由守卫放行、场景数据加载、组件库/图层与 Pinia store
 * 的事件接线，以及撤销重做按钮的可用性状态。数据依赖 `pnpm db:seed` 的种子场景。
 * 交互辅助统一放在 `helpers.ts`（含「切 tab 不能进 poll」的原因说明）。
 */

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
    await expect.poll(() => outlineCount(page), { timeout: 30_000 }).toBeGreaterThan(baseline);

    await expect(undoBtn(page)).toBeEnabled();
    await undoBtn(page).click();
    await expect.poll(() => outlineCount(page), { timeout: 30_000 }).toBe(baseline);

    await redoBtn(page).click();
    await expect.poll(() => outlineCount(page), { timeout: 30_000 }).toBeGreaterThan(baseline);
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
    await expect.poll(() => outlineCount(page), { timeout: 30_000 }).toBeGreaterThan(baseline);

    await undoBtn(page).click();
    await expect.poll(() => outlineCount(page), { timeout: 30_000 }).toBe(baseline);
    await expect(redoBtn(page)).toBeEnabled();

    // 新分支：重做必须失效
    await addFirstWidget(page);
    await switchTab(page, OUTLINE_TAB);
    await expect.poll(() => outlineCount(page), { timeout: 30_000 }).toBeGreaterThan(baseline);
    await expect(redoBtn(page)).toBeDisabled();
  });
});
