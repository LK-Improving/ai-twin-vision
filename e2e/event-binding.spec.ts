import { expect, test, type APIRequestContext } from '@playwright/test';
import './diagnostics';

/**
 * 事件绑定从场景 DSL 到运行时执行（迭代 5.5 的回归测试）。
 *
 * 背景：`PreviewView` 里原先写死 `setBindings([])`，编辑器维护的 `page.events` 根本没人读，
 * 所以「用户配了事件但预览/大屏里不生效」。本用例刻意**不注入绑定**——
 * 而是把绑定真正写进场景 DSL（PATCH layout），再靠预览页自己去加载与执行，
 * 这样才覆盖得住那条数据路径；否则用例只证明了运行时能力，证不了接线。
 *
 * 夹具策略：只借一个现有场景当载体，**自造两个 TEXT 节点 + 一条绑定**写进它的 layout，
 * 断言完在 finally 里把整份原 layout 还原。
 * 不依赖种子数据恰好有几个节点（CI 上首次跑红就是因为挑中的场景只渲染出 1 个节点），
 * 也不新建场景（避免留下测试垃圾）。
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

/** 随便找一个场景当载体（只需要它的 id 与原始 layout，用于最后还原） */
async function pickAnyScene(request: APIRequestContext) {
  const listResp = await request.get(`${API}/scenes?page=1&limit=20`, { headers: auth() });
  expect(listResp.ok(), `场景列表请求失败：${listResp.status()}`).toBe(true);
  const list = (await listResp.json()) as Envelope<{ dataList: SceneListItem[] }>;
  const rows = list.data?.dataList ?? [];
  expect(rows.length, '种子里没有任何场景').toBeGreaterThan(0);

  for (const row of rows) {
    const detailResp = await request.get(`${API}/scenes/${row.id}`, { headers: auth() });
    if (!detailResp.ok()) continue;
    const detail = (await detailResp.json()) as Envelope<{ layout?: PageSchemaLike }>;
    if (detail.data.layout) return { id: row.id, layout: detail.data.layout };
  }
  throw new Error('拿不到任何场景的 layout');
}

/** 自造两个叶子节点：不依赖种子数据恰好有几个节点
 * （CI 上第一次跑红就是因为挑中的场景只渲染出 1 个节点）。 */
function e2eNodes(tag: string) {
  const mk = (role: 'source' | 'target', x: number) => ({
    id: `e2e-${role}-${tag}`,
    type: 'TEXT',
    name: `e2e ${role}`,
    rect: { x, y: 40, width: 220, height: 60, zIndex: 50 },
    props: { content: `e2e ${role} ${tag}`, fontSize: 20, color: '#0f2c5c' },
  });
  return [mk('source', 40), mk('target', 320)];
}

test.describe('事件绑定：DSL → 预览执行', () => {
  test('写进场景 DSL 的点击事件能在预览里生效', async ({ page, request }) => {
    test.setTimeout(180_000);
    token = await login(request);

    const { id: sceneId, layout: original } = await pickAnyScene(request);
    const tag = `${Date.now()}`.slice(-6);
    const nodes = e2eNodes(tag);
    const sourceId = nodes[0].id;
    const targetId = nodes[1].id;

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

    // 一次 PATCH 同时写入自造节点与绑定；finally 里把整份原 layout 还原
    const patched = await request.patch(`${API}/scenes/${sceneId}`, {
      headers: auth(),
      data: { layout: { ...original, nodes, events: [binding] } },
    });
    expect(patched.ok(), `写入夹具失败：${patched.status()}`).toBe(true);

    try {
      // 直接打开预览：绑定与节点都必须从持久化 DSL 读出来，而不是测试注入
      await page.goto(`/preview/${sceneId}`);
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
        data: { layout: original },
      });
      expect(restored.ok(), `还原 layout 失败：${restored.status()}`).toBe(true);
    }
  });
});
