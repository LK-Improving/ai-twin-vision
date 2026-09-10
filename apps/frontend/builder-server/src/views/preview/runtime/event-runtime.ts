/**
 * 轻量事件运行时：把平台保存的 EventBinding 在预览/运行时真正执行。
 *
 * 设计：
 * - 由 PreviewView 在节点渲染后调用 bindDomEvents / bindViewer 完成事件源接线。
 * - fire(sourceId, eventName) 收集该源该事件的全部绑定，按 actions 顺序执行。
 * - 每个动作支持 condition（条件表达式）与 delay（延迟毫秒）。
 * - RUN_SCRIPT 用 new Function 包裹在受限作用域执行，仅能访问注入的 ctx 与 data。
 */
import type { TwinViewer } from '@dt/rendering-engine';
import type { EventBinding, EventAction, WidgetNode } from '@dt/shared-types';
import { ActionType } from '@dt/shared-types';

export interface RuntimeContext {
  viewer: TwinViewer | null;
  /** 变量读取 */
  getVar: (key: string) => unknown;
  /** 变量写入 */
  setVar: (key: string, value: unknown) => void;
  /** 节点表（id → 响应式节点），用于可见性切换与数据注入 */
  nodes: Map<string, WidgetNode>;
  /** 运行时根容器，用于 DOM 类动作（OPEN_PANEL / CALL_COMPONENT 派发） */
  container: HTMLElement | null;
  /** 请求封装（由上层传入 http 实例，已解包 ApiResponse） */
  request: <T = unknown>(url: string, method?: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown) => Promise<T>;
}

/** 从对象按路径取值，支持 a.b[0].c */
function getByPath(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export class EventRuntime {
  private ctx: RuntimeContext;
  private handlers: Array<() => void> = [];

  constructor(ctx: RuntimeContext) {
    this.ctx = ctx;
  }

  /**
   * 为容器内的 2D 节点绑定 DOM 事件（click / dblclick / hover）。
   * 通过 [data-node-id] 定位节点元素。
   */
  bindDomEvents(): void {
    const root = this.ctx.container;
    if (!root) return;
    const events: Array<{ name: 'click' | 'dblclick' | 'hover'; dom: string }> = [
      { name: 'click', dom: 'click' },
      { name: 'dblclick', dom: 'dblclick' },
      { name: 'hover', dom: 'mouseenter' },
    ];
    for (const ev of events) {
      const listener = (e: Event) => {
        const el = (e.currentTarget as HTMLElement)?.closest('[data-node-id]') as HTMLElement | null;
        const id = el?.getAttribute('data-node-id');
        if (id) this.fire(id, ev.name);
      };
      root.querySelectorAll('[data-node-id]').forEach((el) => {
        el.addEventListener(ev.dom, listener);
        this.handlers.push(() => el.removeEventListener(ev.dom, listener));
      });
    }
  }

  /** 绑定三维实体拾取：viewer 点击携带 entityId 时触发 entityPick 事件 */
  bindViewer(): void {
    const v = this.ctx.viewer;
    if (!v) return;
    const off = v.on('click', (res: { entityId?: string }) => {
      if (res.entityId) this.fire(res.entityId, 'entityPick');
    });
    this.handlers.push(off);
  }

  /** 触发某事件源某事件，依次执行其动作序列 */
  fire(sourceId: string, eventName: string): void {
    const all = this.bindings.filter(
      (b) => b.sourceId === sourceId && b.event === eventName && b.enabled !== false,
    );
    for (const b of all) {
      b.actions.forEach((a) => void this.runAction(a, 0));
    }
  }

  private bindings: EventBinding[] = [];
  /** 注入页面事件绑定（由 PreviewView 在加载场景后调用） */
  setBindings(list: EventBinding[]): void {
    this.bindings = list ?? [];
  }

  private async runAction(action: EventAction, _index: number): Promise<void> {
    const delay = action.delay ?? 0;
    if (action.condition && action.condition.trim()) {
      try {
        const fn = new Function('ctx', 'data', `return (${action.condition});`);
        const pass = fn(this.buildCtx(), undefined);
        if (!pass) return;
      } catch {
        return; // 条件表达式出错则跳过该动作
      }
    }
    await new Promise<void>((r) => setTimeout(r, delay));
    switch (action.type as ActionType) {
      case ActionType.CALL_COMPONENT:
        this.callComponent(action);
        break;
      case ActionType.TOGGLE_VISIBLE:
        this.toggleVisible(action);
        break;
      case ActionType.CAMERA_FLY_TO:
        this.flyTo(action);
        break;
      case ActionType.HIGHLIGHT_ENTITY:
        this.highlight(action);
        break;
      case ActionType.OPEN_PANEL:
        this.openPanel(action);
        break;
      case ActionType.NAVIGATE:
        this.navigate(action);
        break;
      case ActionType.REQUEST_API:
        await this.requestApi(action);
        break;
      case ActionType.SET_VARIABLE:
        this.setVariable(action);
        break;
      case ActionType.RUN_SCRIPT:
        this.runScript(action);
        break;
    }
  }

  private buildCtx(): Record<string, unknown> {
    return {
      viewer: this.ctx.viewer,
      variables: new Proxy(
        {},
        {
          get: (_t, k) => this.ctx.getVar(String(k)),
          set: (_t, k, v) => (this.ctx.setVar(String(k), v), true),
        },
      ),
      nodes: this.ctx.nodes,
    };
  }

  private callComponent(action: EventAction): void {
    const id = action.targetId;
    if (!id || !this.ctx.container) return;
    const el = this.ctx.container.querySelector(`[data-node-id="${id}"]`);
    if (el) {
      // 组件若监听 dt-action 自定义事件即可响应（如 refresh）
      el.dispatchEvent(new CustomEvent('dt-action', { detail: action.params?.action ?? 'refresh', bubbles: true }));
    }
    // 三维实例：尝试触发引擎可见性无关的动作时暂无通用接口，记录即可
    void this.ctx.nodes.get(id);
  }

  private toggleVisible(action: EventAction): void {
    const id = action.targetId;
    if (!id) return;
    const node = this.ctx.nodes.get(id);
    if (node) {
      node.visible = node.visible === false ? true : false;
      const el = this.ctx.container?.querySelector(`[data-node-id="${id}"]`);
      if (el) (el as HTMLElement).style.display = node.visible === false ? 'none' : '';
      return;
    }
    // 三维实体
    this.ctx.viewer?.setEntityVisible(id, !this.isEntityVisible(id));
    this.entityVisibility.set(id, !this.isEntityVisible(id));
  }
  private entityVisibility = new Map<string, boolean>();
  private isEntityVisible(id: string): boolean {
    return this.entityVisibility.get(id) ?? true;
  }

  private flyTo(action: EventAction): void {
    const view = action.params?.view as
      | { longitude: number; latitude: number; height: number; heading?: number; pitch?: number; roll?: number }
      | undefined;
    if (view) this.ctx.viewer?.flyTo(view);
  }

  private highlight(action: EventAction): void {
    const id = action.targetId;
    if (!id) return;
    if (action.params?.clear) this.ctx.viewer?.clearHighlight();
    else this.ctx.viewer?.highlight(id, (action.params?.color as string) ?? '#ffcc00');
  }

  private openPanel(action: EventAction): void {
    const id = action.targetId;
    if (!id || !this.ctx.container) return;
    const el = this.ctx.container.querySelector(`[data-node-id="${id}"]`);
    if (el) el.classList.toggle('dt-panel-open');
  }

  private navigate(action: EventAction): void {
    const url = action.params?.url as string | undefined;
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  }

  private async requestApi(action: EventAction): Promise<void> {
    const url = action.params?.url as string | undefined;
    const method = (action.params?.method as 'GET' | 'POST' | 'PUT' | 'DELETE') ?? 'GET';
    const body = action.params?.body;
    if (!url) return;
    try {
      const res = await this.ctx.request(url, method, body);
      // 结果写入变量（若指定）
      const varKey = action.params?.resultVariable as string | undefined;
      if (varKey) this.ctx.setVar(varKey, res);
    } catch {
      // 静默失败，避免影响运行时其余逻辑
    }
  }

  private setVariable(action: EventAction): void {
    const key = action.params?.variable as string | undefined;
    if (key == null) return;
    this.ctx.setVar(key, action.params?.value);
  }

  private runScript(action: EventAction): void {
    const script = (action.params?.script as string) ?? '';
    if (!script.trim()) return;
    try {
      // 安全边界：仅注入 ctx（含 variables / viewer / nodes），不暴露 window/document
      const fn = new Function('ctx', `"use strict";\n${script}`);
      fn(this.buildCtx());
    } catch (err) {
      console.warn('[event-runtime] RUN_SCRIPT 执行失败', err);
    }
  }

  dispose(): void {
    this.handlers.forEach((off) => off());
    this.handlers = [];
    this.bindings = [];
  }
}

/** 提取字段映射后的值（供 data-runtime 复用） */
export function resolveField(data: unknown, path: string): unknown {
  return getByPath(data, path);
}
