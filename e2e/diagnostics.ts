import { test, type TestInfo } from '@playwright/test';

/**
 * 失败现场诊断：把关键状态直接打进测试输出，让 CI 日志本身就能定位问题。
 *
 * 动机：上一轮 CI 上有一条用例超时失败，但要看清现场必须下载 artifact 里的
 * trace/截图，而 `gh run download` 又在解压重名文件时中断 —— 等于"有证据但拿不到"。
 * 有了这里打印的行，不下载任何东西也能回答「当时页面是什么状态」。
 *
 * 用法：在每个 spec 文件顶部 `import './diagnostics';`（注册全局 beforeEach/afterEach）。
 */

/** 用 WeakMap 关联 testInfo → 控制台错误，避免把可变状态挂到 Playwright 的对象上 */
const consoleErrors = new WeakMap<TestInfo, string[]>();

test.beforeEach(async ({ page }, testInfo) => {
  const errors: string[] = [];
  consoleErrors.set(testInfo, errors);

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => {
    // 只记资源名，避免把带 token 的完整 URL 打进日志
    errors.push(`requestfailed: ${new URL(req.url()).pathname}`);
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;

  const errors = consoleErrors.get(testInfo) ?? [];
  const count = async (selector: string) => {
    try {
      return await page.locator(selector).count();
    } catch {
      return 'n/a';
    }
  };
  const disabledState = async (nth: number) => {
    try {
      const btn = page.locator('.header-center button').nth(nth);
      return (await btn.count()) === 0 ? 'no-button' : await btn.isDisabled();
    } catch {
      return 'n/a';
    }
  };

  console.log(`\n[diag] 用例失败现场 · ${testInfo.title}`);
  console.log(`[diag]   url            = ${page.url()}`);
  console.log(`[diag]   lib-item 数量  = ${await count('.lib-item')}`);
  console.log(`[diag]   tree-row 数量  = ${await count('.tree-row')}`);
  console.log(`[diag]   节点 DOM 数量  = ${await count('[data-node-id]')}`);
  console.log(`[diag]   撤销按钮禁用   = ${await disabledState(0)}`);
  console.log(`[diag]   重做按钮禁用   = ${await disabledState(1)}`);
  console.log(`[diag]   最近 8 条控制台错误 = ${JSON.stringify(errors.slice(-8), null, 0)}`);
  console.log(`[diag] 完整 trace/截图在 artifact 中（若下载失败，以上信息通常已足够定位）\n`);
});
