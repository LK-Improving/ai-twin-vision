import { defineConfig, devices } from '@playwright/test';

/**
 * e2e 配置（迭代 5.1）。
 *
 * 与单测的分工：单测能证明纯逻辑正确，但看不到「Vite 产物里 Worker 能否真正启动」
 * 「Pinia store 与 DOM 事件是否接得上」这类集成问题 —— 这里只补这一层。
 *
 * 约定：
 * - 不启动 webServer。后端要连数据库/Redis/MinIO，由 `pnpm infra:up` + `pnpm dev` 或 CI 作业显式编排，
 *   避免 Playwright 去猜一整套依赖；本地跑法见 README「端到端测试」。
 * - 只有一个 worker 且禁并发：用例共享同一套种子数据与登录账号，并行会互相踩（撤销栈、场景列表）。
 * - baseURL 用独立端口（默认 5199），不与开发者正在跑的 5173/5174 抢。
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5199';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  // 共享 runner 上首屏要拉地形/影像，60s 偏紧
  timeout: 120_000,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'e2e-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // 三维场景首帧加载较慢，给元素等待留足余量
    actionTimeout: 20_000,
  },
  projects: [
    { name: 'auth', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['auth'],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/admin.json' },
    },
  ],
});
