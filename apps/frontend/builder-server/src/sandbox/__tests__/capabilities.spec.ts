import { describe, expect, it } from 'vitest';
import type { TwinViewer } from '@dt/rendering-engine';
import type { WidgetNode } from '@dt/shared-types';
import { CAPABILITY_ALLOWLIST } from '../protocol';
import {
  dispatchCapability,
  isHttpUrl,
  isSameOriginPath,
  type CapabilityHost,
} from '../capabilities';

/** 记录型 viewer 桩件：只关心「能力调用是否转成引擎动作」 */
function createHost() {
  const vars: Record<string, unknown> = { alertLevel: 3 };
  const calls: string[] = [];
  const node: WidgetNode = {
    id: 'n1',
    type: 'CHART_BAR',
    visible: true,
    rect: { x: 0, y: 0, width: 100, height: 80 },
    props: { internalToken: 'must-not-leak' },
  } as unknown as WidgetNode;
  const nodes = new Map<string, WidgetNode>([['n1', node]]);
  const entityVisible = new Map<string, boolean>();
  const viewer = {
    flyTo: (view: unknown) => calls.push(`flyTo:${JSON.stringify(view)}`),
    flyToEntity: (id: string) => calls.push(`flyToEntity:${id}`),
    getCameraView: () => ({ longitude: 116, latitude: 39, height: 500 }),
    highlight: (id: string, color: string) => calls.push(`highlight:${id}:${color}`),
    clearHighlight: () => calls.push('clearHighlight'),
    setEntityVisible: (id: string, visible: boolean) => {
      entityVisible.set(id, visible);
      calls.push(`setEntityVisible:${id}:${visible}`);
    },
    getStats: () => ({ fps: 60 }),
  } as unknown as TwinViewer;

  const host: CapabilityHost = {
    viewer,
    getVar: (k) => vars[k],
    setVar: (k, v) => {
      vars[k] = v;
    },
    nodes,
    container: null,
    // 桩件固定返回回显对象，断言以适配 CapabilityHost 的泛型签名
    request: (async (url: string, method?: string, body?: unknown) => ({
      url,
      method,
      body,
    })) as unknown as CapabilityHost['request'],
    setEntityVisible: (id, visible) => {
      entityVisible.set(id, visible);
      calls.push(`setEntityVisible:${id}:${visible}`);
    },
    isEntityVisible: (id) => entityVisible.get(id) ?? true,
  };
  return { host, calls, vars, node, entityVisible };
}

describe('sandbox/capabilities 能力白名单', () => {
  it('未登记的调用名一律拒绝', async () => {
    const { host } = createHost();
    await expect(dispatchCapability(host, 'viewer.destroy', [])).rejects.toThrow(
      /未授权的能力调用/,
    );
    await expect(dispatchCapability(host, 'eval', ['alert(1)'])).rejects.toThrow(
      /未授权的能力调用/,
    );
  });

  it('白名单中的每一项都有实现（防止只登记不实现）', async () => {
    const { host } = createHost();
    for (const name of CAPABILITY_ALLOWLIST) {
      const message = await dispatchCapability(host, name, ['n1', true, {}]).then(
        () => '',
        (err: unknown) => (err instanceof Error ? err.message : String(err)),
      );
      expect(message).not.toMatch(/未授权的能力调用|未实现的能力调用/);
    }
  });

  it('变量读写生效，且函数等宿主引用不会被带入', async () => {
    const { host, vars } = createHost();
    await dispatchCapability(host, 'setVar', ['alertLevel', () => 'escape']);
    // 函数被降级为 undefined：不允许任何可执行对象进入宿主状态
    expect(vars.alertLevel).toBeUndefined();
    await dispatchCapability(host, 'setVar', ['flag', { ok: true }]);
    expect(vars.flag).toEqual({ ok: true });
    expect(await dispatchCapability(host, 'getVar', ['flag'])).toEqual({ ok: true });
  });

  it('request 仅放行同源 /api 与 /static 路径', async () => {
    const { host } = createHost();
    await expect(
      dispatchCapability(host, 'request', ['https://evil.example/x', 'GET']),
    ).rejects.toThrow(/仅允许同源/);
    await expect(dispatchCapability(host, 'request', ['//evil.example/x', 'GET'])).rejects.toThrow(
      /仅允许同源/,
    );
    await expect(dispatchCapability(host, 'request', ['/api/v1/scenes', 'TRACE'])).rejects.toThrow(
      /不支持的方法/,
    );
    expect(await dispatchCapability(host, 'request', ['/api/v1/scenes', 'GET', { a: 1 }])).toEqual({
      url: '/api/v1/scenes',
      method: 'GET',
      body: { a: 1 },
    });
  });

  it('节点能力只交出纯数据视图，不泄漏 props 等宿主字段', async () => {
    const { host, node } = createHost();
    const view = (await dispatchCapability(host, 'nodes.get', ['n1'])) as Record<string, unknown>;
    expect(view.id).toBe('n1');
    expect('props' in view).toBe(false);
    expect(await dispatchCapability(host, 'nodes.setVisible', ['n1', false])).toBe(false);
    expect(node.visible).toBe(false);
    expect(await dispatchCapability(host, 'nodes.toggle', ['n1'])).toBe(true);
  });

  it('实体可见性省略参数时取反，并回传最终状态', async () => {
    const { host, calls, entityVisible } = createHost();
    expect(await dispatchCapability(host, 'viewer.setEntityVisible', ['e1'])).toBe(false);
    expect(entityVisible.get('e1')).toBe(false);
    expect(await dispatchCapability(host, 'viewer.setEntityVisible', ['e1'])).toBe(true);
    expect(calls).toContain('setEntityVisible:e1:true');
  });

  it('flyTo 同时支持实体 id 与视角对象', async () => {
    const { host, calls } = createHost();
    await dispatchCapability(host, 'viewer.flyTo', ['e1']);
    await dispatchCapability(host, 'viewer.flyTo', [{ longitude: 1, latitude: 2, height: 3 }]);
    await expect(dispatchCapability(host, 'viewer.flyTo', [42])).rejects.toThrow(/需要目标实体/);
    expect(calls.some((c) => c.startsWith('flyToEntity:e1'))).toBe(true);
    expect(calls.some((c) => c.startsWith('flyTo:{"longitude":1'))).toBe(true);
  });

  it('同源与外链判定不误放', () => {
    expect(isSameOriginPath('/api/v1/x')).toBe(true);
    expect(isSameOriginPath('/static/a.glb')).toBe(true);
    expect(isSameOriginPath('/etc/passwd')).toBe(false);
    expect(isSameOriginPath('//evil')).toBe(false);
    expect(isHttpUrl('https://example.com')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
  });
});
