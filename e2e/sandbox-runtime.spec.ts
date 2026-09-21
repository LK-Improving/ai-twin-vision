import { expect, test, type Page } from '@playwright/test';

/**
 * 脚本沙箱的浏览器内回归（迭代 5.1b）—— 把迭代 0 当时靠手工点验的三件事固化下来。
 *
 * 为什么需要单独一层：`packages/data-processor` 的 19 个单测跑在 node 里、用的是注入的
 * workerFactory，因此**看不到**两件真机上才会坏的事：
 *   1) Vite 的 `?worker` 导入在应用里能否真的产出可运行的 Worker（打包配置一改就可能静默失效）；
 *   2) `with(proxy)` 全局遮蔽在浏览器 Worker realm 内是否真的把 window/document/fetch 挡住。
 *
 * 做法：在应用页面里通过 dev server 动态 import 应用**自己的**沙箱模块，用真 Worker 执行脚本。
 * 不碰事件编排面板 —— 那套自定义下拉的 UI 流程 flake 成本高，且与这里要证明的边界无关。
 *
 * 注意：这里只把「待测脚本字符串」传进页面，绝不在测试宿主里用 new Function 重建回调 ——
 * 那个 API 正是本套沙箱要禁止的东西，用它会让这个用例自相矛盾。
 */

/** 应用自身的沙箱出口（等价于代码里的 '@/sandbox'） */
const SANDBOX_MODULE = '/src/sandbox/index.ts';

interface Outcome {
  ok: boolean;
  value?: unknown;
  error?: string;
}

/** 在页面里用真实 Worker 跑一段转换脚本 */
function runTransform(page: Page, script: string, timeoutMs?: number): Promise<Outcome> {
  return page.evaluate(
    async ([path, code, ms]) => {
      const mod = (await import(/* @vite-ignore */ path)) as {
        getScriptSandbox: () => {
          runTransform: (s: string, d: unknown, t?: number) => Promise<Outcome>;
        };
      };
      return mod.getScriptSandbox().runTransform(code, null, ms);
    },
    [SANDBOX_MODULE, script, timeoutMs] as const,
  );
}

/** 在页面里跑静态守卫（与编辑器保存前用的是同一个函数） */
function scanScripts(page: Page, codes: Record<string, string>): Promise<Record<string, number>> {
  return page.evaluate(
    async ([path, map]) => {
      const mod = (await import(/* @vite-ignore */ path)) as {
        scanScript: (code: string) => Array<{ reason: string }>;
      };
      const out: Record<string, number> = {};
      for (const [key, code] of Object.entries(map)) out[key] = mod.scanScript(code).length;
      return out;
    },
    [SANDBOX_MODULE, codes] as const,
  );
}

test.describe('脚本沙箱（真实浏览器 + 真实 Worker）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('Worker 真的起来了：白名单内置对象可用', async ({ page }) => {
    const out = await runTransform(
      page,
      'return [typeof JSON, typeof Math, typeof Date, JSON.parse(\'{"a":10}\').a + Math.max(1, 2)].join("|");',
    );

    expect(out.ok, `沙箱执行应成功，实际错误：${out.error}`).toBe(true);
    // JSON/Math 是对象、Date 是构造器（typeof 'function'），10 + max(1,2) = 12
    expect(out.value).toBe('object|object|function|12');
  });

  test('第一层：越权脚本在守卫阶段就被拒（根本进不了 Worker）', async ({ page }) => {
    const direct = await runTransform(page, 'return typeof window;');
    expect(direct.ok, '直写 window 应被静态守卫拦下').toBe(false);
    expect(direct.error ?? '').toMatch(/守卫|guard/i);

    // 守卫是正则级的，对「拼出来的标识符」无能为力 —— 交给下一层
  });

  test('第二层：守卫拦不住的拼接绕过，由 Worker realm 遮蔽兜住', async ({ page }) => {
    // 把 `window` 拆成两段字符串拼出来，正则守卫看不到完整标识符；
    // 这正是守卫注释里自认的局限，所以运行期遮蔽必须接住它。
    const concat = await runTransform(
      page,
      "const name = 'win' + 'dow'; const v = this[name]; return v === undefined ? 'blocked' : 'leaked';",
    );
    expect(concat.ok, `拼接探测应可执行：${concat.error}`).toBe(true);
    expect(concat.value, '沙箱的 this 不应携带宿主全局').toBe('blocked');

    // 接收者是 null 原型：连原型链上的间接引用也没有
    const proto = await runTransform(page, 'return Object.getPrototypeOf(this) === null;');
    expect(proto.ok, `原型探测应可执行：${proto.error}`).toBe(true);
    expect(proto.value, '沙箱接收者应为 null 原型对象').toBe(true);
  });

  test('死循环脚本被超时终止，且不拖垮页面、不影响后续脚本', async ({ page }) => {
    const started = Date.now();
    const hung = await runTransform(page, 'while (true) { /* 死循环 */ }', 800);

    expect(hung.ok, '死循环必须以失败收场，而不是永远挂着').toBe(false);
    expect(hung.error ?? '').toMatch(/超时|timeout/i);
    // 由宿主计时器兜住，不该等满脚本默认的 3s 上限
    expect(Date.now() - started).toBeLessThan(10_000);

    // 关键：宿主页面仍然响应（沙箱卡死把 UI 一起拖死是迭代 0 修掉的老问题）
    await expect(page.locator('body')).toBeVisible({ timeout: 5_000 });
    expect(await page.evaluate(() => 1 + 1)).toBe(2);

    // 超时后线程被正确重建，沙箱还能继续接受新脚本
    const after = await runTransform(page, 'return 7;');
    expect(after.ok, `超时后沙箱应可继续使用，实际：${after.error}`).toBe(true);
    expect(after.value).toBe(7);
  });

  test('静态守卫拦越权但不误伤合法脚本', async ({ page }) => {
    const blocked = await scanScripts(page, {
      window: 'window.alert(1)',
      fetch: 'await fetch("/api/x")',
      proto: 'this.constructor.prototype',
      worker: 'new Worker("/x")',
      storage: 'localStorage.getItem("token")',
      clean: 'return data.value > 0 ? 1 : 0;',
      // 注释与字符串里出现危险词不该被误判（stripLiterals 的职责）
      inComment: '// 这里提到 window 只是注释\nreturn 1;',
    });

    expect(blocked.window).toBeGreaterThan(0);
    expect(blocked.fetch).toBeGreaterThan(0);
    expect(blocked.proto).toBeGreaterThan(0);
    expect(blocked.worker).toBeGreaterThan(0);
    expect(blocked.storage).toBeGreaterThan(0);
    // 合法脚本不能被误伤，否则守卫等于摆设
    expect(blocked.clean).toBe(0);
    expect(blocked.inComment).toBe(0);
  });
});
