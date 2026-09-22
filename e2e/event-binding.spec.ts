import { expect, test, type APIRequestContext } from '@playwright/test';
import './diagnostics';

/**
 * 事件绑定从场景 DSL 到运行时执行（迭代 5.5 的回归测试）。
 *
 * 背景：`PreviewView` 里原先写死 `setBindings([])`，编辑器维护的 `page.events` 根本没人读，
 * 所以「用户配了事件但预览/大屏里不生效」。本用例刻意**不注入绑定** ——
 * 而是把绑定真正写进场景 DSL（PATCH layout），再靠预览页自己去加载与执行，
 * 这样才覆盖得住那条数据路径；否则只能证明运行时能力，证不了接线。
 *
 * 夹具隔离（重要教训）：早先的版本借用「列表里第一个有节点的场景」并 PATCH 它，
 * 结果 PATCH 把该场景的 updated_at 顶到最新 → 场景列表顺序变了 → 后续 publish/sandbox
 * 用例打开的是另一个场景，`.lib-item` 为 0 而整批失败（CI run 35623879076）。
 * **测试不得改动别人依赖的共享状态**，所以改成：自己建场景、自己用、finally 删掉。
 */

const API = '/api/v1';

interface Envelope<T> {
  data: T;
}

interface PageSchemaLike {
  version?: string;
  nodes: unknown[];
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

/** 自造两个 TEXT 叶子节点：不依赖种子数据恰好有几个节点 */
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

/** 建一个专用夹具场景（HYBRID，用平台默认引擎配置），返回 id */
async function createFixtureScene(request: APIRequestContext, name: string): Promise<string> {
  const resp = await request.post(`${API}/scenes`, {
    headers: auth(),
    data: { name, sceneType: 'HYBRID', description: 'e2e 事件绑定夹具，用完即删' },
  });
  expect(resp.ok(), `创建夹具场景失败：${resp.status()} ${await resp.text()}`).toBe(true);
  const body = (await resp.json()) as Envelope<{ id: string }>;
  expect(body.data?.id, '创建响应应带回场景 id').toBeTruthy();
  return body.data.id;
}

test.describe('事件绑定：DSL → 预览执行', () => {
  test('写进场景 DSL 的点击事件能在预览里生效', async ({ page, request }) => {
    test.setTimeout(180_000);
    token = await login(request);

    const tag = `${Date.now()}`.slice(-6);
    const sceneId = await createFixtureScene(request, `e2e-事件夹具-${tag}`);
    const nodes = e2eNodes(tag);
    const sourceId = nodes[0].id;
    const targetId = nodes[1].id;

    const layout: PageSchemaLike = {
      version: '1.0.0',
      nodes,
      events: [
        {
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
        },
      ],
      variables: [],
    };

    try {
      const patched = await request.patch(`${API}/scenes/${sceneId}`, {
        headers: auth(),
        data: { layout },
      });
      expect(patched.ok(), `写入夹具 layout 失败：${patched.status()}`).toBe(true);

      await page.goto(`/preview/${sceneId}`);
      const source = page.locator(`[data-node-id="${sourceId}"]`).first();
      const target = page.locator(`[data-node-id="${targetId}"]`).first();
      await expect(source).toBeVisible({ timeout: 60_000 });
      await expect(target).toBeVisible({ timeout: 30_000 });

      // 直接在节点元素上派发 click：组件内部 canvas 可能占满整个 node，
      // Playwright 的命中检查会一直重试到超时（事件根本没发出去）。
      // 本用例要验的是「DSL 里的绑定会被加载并执行」，不是图层叠放顺序。
      await source.dispatchEvent('click');

      // 关键断言：绑定来自持久化 DSL，而不是测试注入
      await expect(target).toBeHidden({ timeout: 20_000 });
    } finally {
      const removed = await request.delete(`${API}/scenes/${sceneId}`, { headers: auth() });
      expect(removed.ok(), `清理夹具场景失败：${removed.status()}`).toBe(true);
    }
  });
});
