import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * 事件绑定从场景 DSL 到运行时执行（迭代 5.5 的回归测试）。
 *
 * 背景：`PreviewView` 里原先写死 `setBindings([])`，编辑器维护的 `page.events` 根本没人读，
 * 所以「用户配了事件但预览/大屏里不生效」。本用例刻意**不注入绑定**——
 * 而是把绑定真正写进场景 DSL（PATCH layout），再靠预览页自己去加载与执行，
 * 这样才覆盖得住那条数据路径；否则用例只证明了运行时能力，证不了接线。
 *
 * 夹具策略：从现有场景里挑一个有节点的，备份其 layout → 加一条绑定 → 断言 → 还原。
 * 不新建场景（避免留下测试垃圾），也不改动节点内容（只增删 events）。
 */

const API = '/api/v1';

interface Envelope<T> {
  data: T;
}

interface SceneListItem {
  id: string;
  name: string;
}

interface PageSchemaLike {
  version?: string;
  nodes: Array<{ id: string; type: string }>;
  events?: unknown[];
  variables?: unknown[];
}

let token = '';

async function login(request: APIRequestContext): Promise<string> {
  const resp = await request.post(`${API}/auth/login`, {
    data: {
      username: process.env.E2E_USERNAME ?? 'admin',
      password: process.env.E2E_PASSWORD ?? 'Admin@123',
    },
  });
  expect(resp.ok(), `登录失败：${resp.status()}`).toBe(true);
  const body = (await resp.json()) as Envelope<{ accessToken: string }>;
  return body.data.accessToken;
}

const auth = () => ({ Authorization: `Bearer ${token}` });

/** 找一个 layout.nodes 非空的场景（不假设种子数据长什么样） */
async function pickSceneWithNodes(request: APIRequestContext) {
  const listResp = await request.get(`${API}/scenes?page=1&limit=20`, { headers: auth() });
  expect(listResp.ok(), `场景列表请求失败：${listResp.status()}`).toBe(true);
  const list = (await listResp.json()) as Envelope<{ dataList: SceneListItem[] }>;
  const rows = list.data?.dataList ?? [];
  expect(Array.isArray(rows), '场景列表结构异常（应为 data.dataList）').toBe(true);
  expect(rows.length, '种子里没有任何场景').toBeGreaterThan(0);

  for (const row of rows) {
    const detailResp = await request.get(`${API}/scenes/${row.id}`, { headers: auth() });
    if (!detailResp.ok()) continue;
    const detail = (await detailResp.json()) as Envelope<{ layout?: PageSchemaLike }>;
    const layout = detail.data.layout;
    if (layout && Array.isArray(layout.nodes) && layout.nodes.length > 0) {
      return { id: row.id, layout };
    }
  }
  throw new Error('未找到含节点的种子场景；请确认 pnpm db:seed 已执行');
}

test.describe('事件绑定：DSL → 预览执行', () => {
  /** 从预览 DOM 里取「叶子节点」id：它们中心不会被子节点覆盖，
   * 事件监听里的 closest('[data-node-id]') 才能解析到自己。 */
  async function leafNodeIds(page: Page): Promise<string[]> {
    return page.evaluate(() =>
      [...document.querySelectorAll('[data-node-id]')]
        .filter((el) => !el.querySelector('[data-node-id]'))
        .map((el) => el.getAttribute('data-node-id') as string)
        .filter(Boolean),
    );
  }

  test('写进场景 DSL 的点击事件能在预览里生效', async ({ page, request }) => {
    test.setTimeout(180_000);
    token = await login(request);

    const { id: sceneId, layout } = await pickSceneWithNodes(request);

    // 先打开一次拿到真实 DOM，挑两个叶子节点作为「事件源」与「被隐藏目标」
    await page.goto(`/preview/${sceneId}`);
    await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 60_000 });
    const leaves = await leafNodeIds(page);
    expect(leaves.length, '预览里找不到两个叶子节点，无法验证点击事件').toBeGreaterThan(1);
    const [sourceId, targetId] = [leaves[0], leaves[1]];

    const binding = {
      id: 'e2e-5-5',
      sourceId,
      event: 'click',
      enabled: true,
      actions: [
        {
          id: 'act-hide',
          type: 'RUN_SCRIPT',
          params: { script: `await ctx.nodes.setVisible('${targetId}', false); return 1;` },
        },
      ],
    };

    // 写入绑定（保留原 nodes，只改 events），并在用例结束后还原
    const patched = await request.patch(`${API}/scenes/${sceneId}`, {
      headers: auth(),
      data: { layout: { ...layout, events: [binding] } },
    });
    expect(patched.ok(), `写入事件绑定失败：${patched.status()}`).toBe(true);

    try {
      // 重新加载：绑定必须从 DSL 读出来，而不是测试注入
      await page.reload({ waitUntil: 'domcontentloaded' });
      const source = page.locator(`[data-node-id="${sourceId}"]`).first();
      const target = page.locator(`[data-node-id="${targetId}"]`).first();
      await expect(source).toBeVisible({ timeout: 60_000 });
      await expect(target).toBeVisible({ timeout: 30_000 });

      // 直接在节点元素上派发 click：组件内部 canvas 占满整个 node，
      // Playwright 的命中检查会一直重试到超时（实际事件根本没发出去）。
      // 本用例要验的是「DSL 里的绑定会被加载并执行」，不是图层叠放顺序。
      await source.dispatchEvent('click');

      // 关键断言：绑定来自持久化 DSL，而不是测试注入
      await expect(target).toBeHidden({ timeout: 20_000 });
    } finally {
      const restored = await request.patch(`${API}/scenes/${sceneId}`, {
        headers: auth(),
        data: { layout: { ...layout, events: [] } },
      });
      expect(restored.ok(), `还原 layout 失败：${restored.status()}`).toBe(true);
    }
  });
});
