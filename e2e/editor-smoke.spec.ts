import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import './diagnostics';
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
});

/**
 * 撤销与重做共用一个编辑器会话。
 *
 * 为什么这么组织：上一轮 CI 上超时失败的正是一条「把整条链走两遍」的用例
 * （加→撤→加→断言），而「打开编辑器」本身在共享 runner 上就要 10~20 秒。
 * 两条用例各开一次会话等于把最长的那段重复两遍，纯粹在赌运气。
 *
 * 因此：会话在 beforeAll 里开一次；第一条用例把状态推到「已撤销、可重做」，
 * 第二条只需再走一步「新分支」就能断言重做被截断（迭代 5.2 的核心语义）。
 *
 * ⚠ 第二条**依赖第一条留下的状态**（已撤销且 redo 可用）—— 这是刻意用一次完整编辑器启动
 *   换掉重复链路。但依赖必须有护栏：第二条开头先断言 `redo 可用`，
 *   否则单独用 `-g` 重跑它时，历史里根本没产生过 redo 分支，按钮本来就是灰的 ——
 *   用例会「假通过」。有这句前置断言，缺状态时会直接失败而不是误报绿色。
 */
test.describe('撤销与重做（共享编辑器会话）', () => {
  let context: BrowserContext;
  let session: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    session = await context.newPage();
    await openFirstSceneEditor(session);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('加组件后撤销：节点数回落，重做按钮变为可用', async () => {
    const baseline = await baselineCount(session);

    await addFirstWidget(session);
    await switchTab(session, OUTLINE_TAB);
    await expect.poll(() => outlineCount(session), { timeout: 30_000 }).toBeGreaterThan(baseline);

    await expect(undoBtn(session)).toBeEnabled();
    await undoBtn(session).click();
    await expect.poll(() => outlineCount(session), { timeout: 30_000 }).toBe(baseline);
    await expect(redoBtn(session)).toBeEnabled();
  });

  /**
   * 迭代 5.2 的浏览器侧复验：撤销到中途后再次添加属于「另起新分支」，必须截断 redo。
   * 修复前这里会走合并分支改写历史槽位，重做按钮仍然可用。
   */
  test('在已撤销状态下再添加：属于新分支，重做按钮必须变灰', async () => {
    // 前置护栏：没有「可重做」的状态，后面的断言就没有意义（防单独重跑时假通过）
    await expect(redoBtn(session)).toBeEnabled({ timeout: 10_000 });

    const before = await baselineCount(session);

    await addFirstWidget(session);
    await switchTab(session, OUTLINE_TAB);
    await expect.poll(() => outlineCount(session), { timeout: 30_000 }).toBeGreaterThan(before);

    // 新分支：上一步还可用 redo 的分支必须被吞掉
    await expect(redoBtn(session)).toBeDisabled();
  });
});
