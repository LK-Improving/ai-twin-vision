import type { TwinEventMap } from '../types';

/** 事件名联合类型 */
export type TwinEventName = keyof TwinEventMap;

/** 任意事件的载荷类型 */
type EventPayload<E extends TwinEventName> = TwinEventMap[E] extends void
  ? void
  : TwinEventMap[E];

/**
 * 轻量类型安全事件总线。
 * - on 返回取消订阅函数，便于组件卸载时清理；
 * - off 支持按引用移除具体处理函数；
 * - emit 会按注册顺序同步派发，并在 handler 抛错时隔离（不影响其它订阅者）。
 */
export class EventBus {
  private readonly handlers = new Map<TwinEventName, Set<(payload: unknown) => void>>();
  private destroyed = false;

  on<E extends TwinEventName>(event: E, handler: (payload: EventPayload<E>) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    // 以 unknown 形态存储，emit 时再按类型调用
    set.add(handler as (payload: unknown) => void);
    return () => this.off(event, handler);
  }

  off<E extends TwinEventName>(event: E, handler: (payload: EventPayload<E>) => void): void {
    const set = this.handlers.get(event);
    if (!set) return;
    set.delete(handler as (payload: unknown) => void);
    if (set.size === 0) {
      this.handlers.delete(event);
    }
  }

  emit<E extends TwinEventName>(event: E, payload: EventPayload<E>): void {
    if (this.destroyed) return;
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;
    // 拷贝一份避免派发过程中增删导致迭代异常
    for (const handler of Array.from(set)) {
      try {
        handler(payload);
      } catch (err) {
        // 单个 handler 异常不应中断整条派发链路
        // eslint-disable-next-line no-console
        console.error(`[TwinViewer] 事件 ${String(event)} 的监听函数执行异常:`, err);
      }
    }
  }

  /** 清空全部监听（destroy 时调用） */
  clear(): void {
    this.handlers.clear();
    this.destroyed = true;
  }

  /** 当前已注册事件数量（调试用） */
  get size(): number {
    return this.handlers.size;
  }
}
