/**
 * 数据运行时：按节点的 DataBinding 拉取数据并注入，驱动 2D 组件与三维实体刷新。
 *
 * 支持三种数据来源：
 * 1. 静态数据 staticData —— 直接返回，不发起请求。
 * 2. 数据源 dataSourceId —— 轮询平台代理接口 /data-sources/:id/query（Phase 1 先走 HTTP 轮询）。
 * 3. IoT 设备 deviceId + propertyCode —— 走 /devices/:id/properties/:code/latest。
 *
 * 说明：WebSocket / MQTT 推送通道在 Phase 3 接入，此处预留 subscribePush 接入点。
 */
import type { DataBinding, WidgetNode } from '@dt/shared-types';
import { resolveField } from './event-runtime';

export interface DataRuntimeOptions {
  /** 节点表（响应式），数据写入 node.props.__data 供组件消费 */
  nodes: Map<string, WidgetNode>;
  /** 请求封装（已解包 ApiResponse） */
  request: <T = unknown>(url: string, method?: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown) => Promise<T>;
  /** 数据变更回调：可用于触发 dataChange 事件 */
  onChange?: (nodeId: string, data: unknown) => void;
  /** 异常回调 */
  onError?: (nodeId: string, error: Error) => void;
}

/** 节点运行时数据挂载点，组件通过 props.__data 读取 */
export const DATA_KEY = '__data';

export class DataRuntime {
  private opts: DataRuntimeOptions;
  private timers = new Map<string, number>();
  /** 节点 id → 最近一次数据，避免无变化时重复触发 */
  private lastData = new Map<string, string>();

  constructor(opts: DataRuntimeOptions) {
    this.opts = opts;
  }

  /** 为单个节点启动数据刷新（按 refreshInterval，默认 5s） */
  bind(node: WidgetNode): void {
    const binding = node.dataBinding;
    if (!binding) return;
    this.stop(node.id);

    // 静态数据：立即注入一次即可
    if (binding.staticData !== undefined && !binding.dataSourceId && !binding.deviceId) {
      this.applyData(node, binding.staticData);
      return;
    }

    const interval = binding.refreshInterval ?? 5000;
    if (interval <= 0) {
      // 0 表示仅由推送驱动，这里先拉一次兜底
      void this.refresh(node);
      return;
    }
    void this.refresh(node);
    const timer = window.setInterval(() => void this.refresh(node), interval);
    this.timers.set(node.id, timer);
  }

  /** 批量绑定（含子节点） */
  bindAll(nodes: WidgetNode[]): void {
    const walk = (list: WidgetNode[]): void => {
      list.forEach((n) => {
        if (n.dataBinding) this.bind(n);
        if (n.children && n.children.length > 0) walk(n.children);
      });
    };
    walk(nodes);
  }

  /** 手动刷新单个节点 */
  async refresh(node: WidgetNode): Promise<void> {
    const binding = node.dataBinding;
    if (!binding) return;
    try {
      let raw: unknown;
      if (binding.dataSourceId) {
        raw = await this.opts.request(`/data-sources/${binding.dataSourceId}/query`, 'POST', {
          // 供后端按映射裁剪返回字段，未实现时返回全量亦可
          fieldMap: binding.fieldMap ?? {},
        });
      } else if (binding.deviceId) {
        const seg = binding.propertyCode ? `/${binding.propertyCode}` : '';
        raw = await this.opts.request(`/devices/${binding.deviceId}/properties${seg}/latest`);
      } else {
        raw = binding.staticData;
      }
      const mapped = this.mapFields(raw, binding);
      const transformed = this.runTransform(mapped, binding);
      this.applyData(node, transformed);
    } catch (e) {
      this.opts.onError?.(node.id, e instanceof Error ? e : new Error(String(e)));
    }
  }

  /** 按 fieldMap 抽取字段；未配置映射时原样返回 */
  private mapFields(raw: unknown, binding: DataBinding): unknown {
    const map = binding.fieldMap;
    if (!map || Object.keys(map).length === 0) return raw;
    const out: Record<string, unknown> = {};
    Object.entries(map).forEach(([target, path]) => {
      out[target] = resolveField(raw, path);
    });
    return out;
  }

  /**
   * 执行转换脚本：入参 data，返回值作为最终数据。
   * 安全边界：仅注入 data 与常用纯函数，不暴露 window / document / fetch。
   */
  private runTransform(data: unknown, binding: DataBinding): unknown {
    const script = binding.transformScript;
    if (!script || !script.trim()) return data;
    try {
      const fn = new Function(
        'data',
        'JSON',
        'Math',
        'Date',
        `"use strict";\n${script}`,
      ) as (d: unknown, j: typeof JSON, m: typeof Math, dt: typeof Date) => unknown;
      const res = fn(data, JSON, Math, Date);
      return res === undefined ? data : res;
    } catch (err) {
      console.warn('[data-runtime] 转换脚本执行失败，回退原始数据', err);
      return data;
    }
  }

  /** 写入节点并通知变更；数据内容未变化时跳过回调 */
  private applyData(node: WidgetNode, data: unknown): void {
    const serialized = JSON.stringify(data ?? null);
    if (this.lastData.get(node.id) === serialized) return;
    this.lastData.set(node.id, serialized);
    node.props = { ...node.props, [DATA_KEY]: data };
    this.opts.onChange?.(node.id, data);
  }

  /**
   * Phase 3 接入点：WebSocket / MQTT 推送订阅。
   * 后端网关推送 { deviceId, propertyCode, value } 后，找到绑定该设备的节点并立即刷新。
   */
  subscribePush(handler: (msg: { deviceId: string; propertyCode?: string; value: unknown }) => void): void {
    // 预留：建立 WS 连接后按节点绑定关系分发
    this.pushHandlers.push(handler);
  }
  private pushHandlers: Array<(msg: { deviceId: string; propertyCode?: string; value: unknown }) => void> = [];

  /** 内部分发（推送网关就绪后调用） */
  dispatchPush(msg: { deviceId: string; propertyCode?: string; value: unknown }): void {
    this.pushHandlers.forEach((h) => h(msg));
    this.opts.nodes.forEach((node) => {
      const b = node.dataBinding;
      if (!b || b.deviceId !== msg.deviceId) return;
      if (b.propertyCode && msg.propertyCode && b.propertyCode !== msg.propertyCode) return;
      const mapped = this.mapFields(msg.value, b);
      this.applyData(node, this.runTransform(mapped, b));
    });
  }

  /** 停止某节点的数据刷新 */
  stop(nodeId: string): void {
    const t = this.timers.get(nodeId);
    if (t !== undefined) {
      window.clearInterval(t);
      this.timers.delete(nodeId);
    }
  }

  /** 释放全部定时器与缓存 */
  dispose(): void {
    this.timers.forEach((t) => window.clearInterval(t));
    this.timers.clear();
    this.lastData.clear();
    this.pushHandlers = [];
  }
}
