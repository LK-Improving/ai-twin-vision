import { expect, test as setup } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * 全局登录夹具：走真实登录表单（而不是直接塞 localStorage），
 * 这样同时验证了「前端凭据 → /api/v1/auth/login → 会话可用」这条链路。
 * 产物 storageState 供后续用例复用，避免每条用例都重新登录一次。
 */
const AUTH_FILE = 'e2e/.auth/admin.json';
const USERNAME = process.env.E2E_USERNAME ?? 'admin';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123';

setup('以种子管理员登录并保存会话', async ({ page }) => {
  mkdirSync('e2e/.auth', { recursive: true });

  await page.goto('/login');
  await page.getByPlaceholder('请输入用户名').fill(USERNAME);
  await page.getByPlaceholder('请输入密码').fill(PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();

  // 用「跳离 /login」判定成功，不与 utils/storage 的键名耦合
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
  await expect(page.locator('body')).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
