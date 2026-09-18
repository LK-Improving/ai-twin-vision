/**
 * 能力桥（宿主侧）：沙箱脚本对页面产生影响的唯一通道。
 *
 * 约束：
 * - 只接受 CAPABILITY_ALLOWLIST 内的调用名，未授权一律抛错；
 * - 入参与返回值都必须是 JSON 安全值，绝不把 viewer / node 等宿主对象交给脚本
 *   （一旦交出，脚本可顺 `obj.constructor.constructor('return this')()` 摸回宿主 realm）；
 * - 网络能力限定同源路径，禁止脚本借宿主 http 实例（带鉴权头）访问外部地址。
 */
import type { TwinViewer } from '@dt/rendering-engine';
import type { WidgetNode } from '@dt/shared-types';
import { CAPABILITY_ALLOWLIST } from './protocol';

/** 宿主需提供的运行时能力载体（由 EventRuntime 组装，保持状态单源） */
export interface CapabilityHost {
  viewer: TwinViewer | null;
  getVar: (key: string) => unknown;
  setVar: (key: string, value: unknown) => void;
  /** 节点表：id → 响应式节点 */
  nodes: Map<string, WidgetNode>;
  /** 运行时根容器，供 DOM 类能力定位 */
  container: HTMLElement | null;
  /** 已解包 ApiResponse 的请求封装 */
  request: <T = unknown>(url: string, method?: string, body?: unknown) => Promise<T>;
  /** 三维实体可见性（状态表由 EventRuntime 持有，避免两处各存一份） */
  setEntityVisible: (id: string, visible: boolean) => void;
  isEntityVisible: (id: string) => boolean;
}

const ALLOWED = new Set<string>(CAPABILITY_ALLOWLIST);

/** 传给脚本的节点视图：仅保留必要字段，切断宿主对象引用 */
function nodeView(node: WidgetNode): Record<string, unknown> {
  return {
    id: node.id,
    name: (node as { name?: string }).name,
    type: node.type,
    visible: node.visible !== false,
    rect: jsonSafe(node.rect),
  };
}

/**
 * 深拷贝为纯 JSON 数据：切断宿主引用。
 * - 函数 / symbol 一律降级为 undefined（绝不把可执行对象交给脚本）；
 * - 循环引用会由 JSON.stringify 抛错，交由上层作为能力调用失败上报。
 */
export function jsonSafe<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (typeof value === 'function' || typeof value === 'symbol') return undefined as unknown as T;
  const serialized = JSON.stringify(value);
  return serialized === undefined ? (undefined as unknown as T) : (JSON.parse(serialized) as T);
}

/** 同源 API 路径校验：允许 /api、/static 前缀，拒绝协议相对与绝对地址 */
export function isSameOriginPath(url: unknown): url is string {
  if (typeof url !== 'string' || !url.startsWith('/')) return false;
  if (url.startsWith('//')) return false;
  return /^\/(api|static)\//.test(url);
}

/** http/https 外链校验（供 openUrl 使用） */
export function isHttpUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  return /^https?:\/\/\S+$/i.test(url);
}

const METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);

/**
 * 执行一次能力调用。未知调用名、非法参数均抛错，错误文本回传沙箱由脚本自行感知。
 */
export async function dispatchCapability(
  host: CapabilityHost,
  call: string,
  args: unknown[],
): Promise<unknown> {
  if (!ALLOWED.has(call)) {
    throw new Error(`未授权的能力调用：${call}`);
  }
  const [a0, a1, a2] = args ?? [];

  switch (call) {
    case 'log':
      // 日志仅转发到控制台，不参与结果
      console.info('[sandbox-script]', ...((args ?? []) as unknown[]));
      return null;

    case 'getVar':
      return jsonSafe(host.getVar(String(a0)));

    case 'setVar':
      host.setVar(String(a0), jsonSafe(a1));
      return null;

    case 'request': {
      if (!isSameOriginPath(a0)) throw new Error('request 仅允许同源 /api 或 /static 路径');
      const method = (a1 as string | undefined) ?? 'GET';
      if (!METHODS.has(String(method).toUpperCase()))
        throw new Error(`request 不支持的方法：${String(method)}`);
      return jsonSafe(await host.request(a0, String(method).toUpperCase(), jsonSafe(a2)));
    }

    case 'openUrl': {
      if (!isHttpUrl(a0)) throw new Error('openUrl 仅允许 http/https 绝对地址');
      window.open(a0, '_blank', 'noopener,noreferrer');
      return null;
    }

    case 'viewer.flyTo': {
      if (!host.viewer) throw new Error('当前场景无三维视图');
      // 兼容两种写法：flyTo(targetId) 与 flyTo({ longitude, latitude, ... })
      if (typeof a0 === 'string') {
        host.viewer.flyToEntity(a0);
      } else if (a0 && typeof a0 === 'object') {
        host.viewer.flyTo(jsonSafe(a0) as Parameters<TwinViewer['flyTo']>[0]);
      } else {
        throw new Error('flyTo 需要目标实体 id 或视角对象');
      }
      return null;
    }

    case 'viewer.flyToEntity': {
      if (!host.viewer) throw new Error('当前场景无三维视图');
      host.viewer.flyToEntity(String(a0));
      return null;
    }

    case 'viewer.getCameraView':
      if (!host.viewer) throw new Error('当前场景无三维视图');
      return jsonSafe(host.viewer.getCameraView());

    case 'viewer.highlight': {
      if (!host.viewer) throw new Error('当前场景无三维视图');
      host.viewer.highlight(String(a0), typeof a1 === 'string' ? a1 : '#ffcc00');
      return null;
    }

    case 'viewer.clearHighlight':
      host.viewer?.clearHighlight();
      return null;

    case 'viewer.setEntityVisible': {
      const id = String(a0);
      const visible = typeof a1 === 'boolean' ? a1 : !host.isEntityVisible(id);
      host.setEntityVisible(id, visible);
      return visible;
    }

    case 'viewer.stats':
      if (!host.viewer) throw new Error('当前场景无三维视图');
      return jsonSafe(host.viewer.getStats());

    case 'nodes.get': {
      const node = host.nodes.get(String(a0));
      return node ? nodeView(node) : null;
    }

    case 'nodes.list':
      return [...host.nodes.values()].map(nodeView);

    case 'nodes.setVisible': {
      const id = String(a0);
      const node = host.nodes.get(id);
      if (!node) throw new Error(`节点不存在：${id}`);
      const visible = typeof a1 === 'boolean' ? a1 : node.visible === false;
      node.visible = visible;
      const el = host.container?.querySelector(
        `[data-node-id="${cssEscape(id)}"]`,
      ) as HTMLElement | null;
      if (el) el.style.display = visible ? '' : 'none';
      return visible;
    }

    case 'nodes.toggle': {
      const id = String(a0);
      const node = host.nodes.get(id);
      if (node) {
        const next = node.visible === false;
        node.visible = next;
        const el = host.container?.querySelector(
          `[data-node-id="${cssEscape(id)}"]`,
        ) as HTMLElement | null;
        if (el) el.style.display = next ? '' : 'none';
        return next;
      }
      const visible = !host.isEntityVisible(id);
      host.setEntityVisible(id, visible);
      return visible;
    }

    case 'component.call': {
      const id = String(a0);
      const el = host.container?.querySelector(`[data-node-id="${cssEscape(id)}"]`);
      if (!el) throw new Error(`未找到组件节点：${id}`);
      el.dispatchEvent(
        new CustomEvent('dt-action', {
          detail: typeof a1 === 'string' ? a1 : 'refresh',
          bubbles: true,
        }),
      );
      return null;
    }

    case 'panel.open': {
      const id = String(a0);
      const el = host.container?.querySelector(`[data-node-id="${cssEscape(id)}"]`);
      if (!el) throw new Error(`未找到面板节点：${id}`);
      el.classList.toggle('dt-panel-open');
      return null;
    }

    default:
      throw new Error(`未实现的能力调用：${call}`);
  }
}

/** id 为 UUID，理论上无特殊字符，但仍走标准转义以防手工构造的节点 id 破坏选择器 */
function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(value)
    : value.replace(/[^\w-]/g, '');
}
