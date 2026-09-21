import { expect, test, type Page } from '@playwright/test';
import { addWidgetAndVerify, openFirstSceneEditor } from './helpers';

/**
 * 发布 → 公开访问链路端到端（迭代 5.1c）。
 *
 * 这条链路的安全语义是「凭证就是 URL 里的发布令牌」：`/screen/:token` 标了 public，
 * 后端 `GET /api/v1/public/screens/:token` 标了 @Public()。所以最有价值的断言不是
 * 「页面能打开」，而是**在没有登录态的新 context 里能打开**，以及**乱令牌必须被拒**。
 *
 * 两点刻意的设计：
 * - 先自己放一个组件再发布：不依赖种子场景恰好有节点（CI 是刚 seed 的干净库，
 *   节点数量属于夹具细节，不该被断言依赖）；
 * - 从对话框读真实链接而不是自己拼令牌：令牌由后端首次发布时生成，
 *   拼出来就测不到「生成 + 持久化 + 再发布不变」那一段。
 */

/** 走一遍 UI 发布流程，返回对话框展示的公开访问地址 */
async function publishAndGetScreenUrl(page: Page): Promise<string> {
  await page.getByRole('button', { name: '发布' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('发布前校验')).toBeVisible({ timeout: 15_000 });

  await dialog.getByPlaceholder('描述本次发布的主要变更…').fill('e2e：发布链路冒烟');
  await dialog.getByRole('button', { name: '确认发布' }).click();

  // 成功态：标题换成「发布成功」，并给出可复制的公开链接
  await expect(dialog.getByText('发布成功')).toBeVisible({ timeout: 30_000 });
  const link = dialog.locator('.pd-link input');
  await expect(link).toBeVisible();

  const url = await link.inputValue();
  expect(url, '发布后应给出 /screen/<token> 形式的公开地址').toMatch(/\/screen\/[0-9a-zA-Z-]{8,}$/);

  await dialog.getByRole('button', { name: '完成' }).click();
  return url;
}

test.describe('发布与公开访问', () => {
  test('发布后无需登录即可打开大屏，且没有未捕获异常', async ({ page, browser, request }) => {
    await openFirstSceneEditor(page);
    // 先放一个组件（publish 内部会先 save，脏数据一定落库）
    await addWidgetAndVerify(page);

    const screenUrl = await publishAndGetScreenUrl(page);
    const token = screenUrl.split('/screen/')[1];

    // 正向对照：同一个令牌直接打公开接口必须拿得到快照。
    // 没这一条，下面的页面断言可能因为降级/缓存之类原因「佯装成功」。
    const api = await request.get(`/api/v1/public/screens/${token}`);
    expect(api.status(), '已发布场景的公开快照应返回 200').toBe(200);
    const snapshot = await api.json();
    expect(snapshot?.data?.sceneId, '快照应带回 sceneId').toBeTruthy();

    // 全新 context：不带 storageState，等价于「拿到链接的匿名观众」
    const anon = await browser.newContext();
    const anonErrors: string[] = [];
    try {
      const viewer = await anon.newPage();
      viewer.on('pageerror', (err) => anonErrors.push(err.message));

      await viewer.goto(screenUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

      // 关键：不能被路由守卫踢回登录页
      await expect(viewer).toHaveURL(/\/screen\//, { timeout: 30_000 });
      await expect(viewer.locator('.preview-root')).toBeVisible({ timeout: 60_000 });
      // 不能只验外壳：至少真渲染出一个组件
      await expect(viewer.locator('.dt-widget').first()).toBeVisible({ timeout: 30_000 });
      // 失败态遮罩不应出现（.mask + EmptyState「场景加载失败」）
      await expect(viewer.getByText('场景加载失败')).toHaveCount(0);
      expect(anonErrors, `未捕获异常：${anonErrors.join(' | ')}`).toEqual([]);
    } finally {
      await anon.close();
    }
  });

  test('重新发布保持同一个发布令牌', async ({ page }) => {
    // 两次完整发布链路比较耗时间，单独给这条放宽到 180s（上一版跑满 120s 被强制关页）
    test.setTimeout(180_000);

    // PublishDialog 的提示文字向用户承诺了「令牌在首次发布时生成，重新发布不会改变，
    // 已发出的链接持续有效」。这是已分发链接会不会集体失效的契约，目前无人看守。
    await openFirstSceneEditor(page);
    await addWidgetAndVerify(page);
    const first = await publishAndGetScreenUrl(page);

    // 第二次不再改内容：契约只关于令牌稳定性，与画布是否变脏无关
    const second = await publishAndGetScreenUrl(page);

    expect(second, '重新发布不应产生新令牌（否则旧链接全断）').toBe(first);
  });

  test('无效令牌的大屏地址必须给出可读的失败态', async ({ browser }) => {
    const anon = await browser.newContext();
    try {
      const viewer = await anon.newPage();
      await viewer.goto('/screen/e2e-invalid-token-000000', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });

      // 后端应拒绝该令牌，前端落到明确的错误遮罩而不是白屏
      await expect(viewer.getByText('场景加载失败')).toBeVisible({ timeout: 60_000 });
    } finally {
      await anon.close();
    }
  });

  test('公开快照接口对未知令牌返回非 2xx（不依赖 UI 的服务端断言）', async ({ request }) => {
    const resp = await request.get('/api/v1/public/screens/e2e-invalid-token-000000');
    expect(resp.status(), '未知发布令牌不应被当作有效大屏返回').toBeGreaterThanOrEqual(400);
  });
});
