/**
 * 数据运行时：按节点的 DataBinding 拉取/接收数据并注入，驱动 2D 组件与三维实体刷新。
 *
 * 数据来源：
 * 1. 静态数据 staticData —— 直接返回，不发起请求。
 * 2. 数据源 dataSourceId —— 轮询平台代理接口 /data-sources/:id/query。
 * 3. IoT 设备 deviceId + propertyCode —— 实时通道优先（/socket.io 推送），
 *    未连接或重连失败时自动降级为轮询 /devices/:id/properties/:code/latest。
 */
import type { DataBinding, WidgetNode } from '@dt/shared-types';
import { getScriptSandbox, type ScriptSandbox } from '@/sandbox';
import { resolveField } from './event-runtime';

/** 实时通道最小接口（由 services/realtime 的 singleton 实现，解耦 socket.io） */
export interface RealtimeChannel {
  readonly connected: boolean;
  subscribeDevices(deviceIds: string[]): void;
  unsubscribeDevices(deviceIds: string[]): void;
  onTelemetry(
    handler: (msg: {
      deviceId: string;
      propertyCode?: string;
      points?: Array<{ propertyCode: string; value: number; timestamp: string }>;
    }) => void,
  ): () => void;
  onConnection(handler: (connected: boolean) => void): () => void;
}

export interface DataRuntimeOptions {
  /** 节点表（响应式），数据写入 node.props.__data 供组件消费 */
  nodes: Map<string, WidgetNode>;
  /** 请求封装（已解包 ApiResponse） */
  request: <T = unknown>(
    url: string,
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: unknown,
  ) => Promise<T>;
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
  /** 实时通道（PreviewView 通过 attachRealtime 注入） */
  private realtime: RealtimeChannel | null = null;
  private realtimeUnsubs: Array<() => void> = [];
  /** 绑定 IoT 设备的节点：nodeId → node（用于推送分发与轮询/推送模式切换） */
  private deviceNodes = new Map<string, WidgetNode>();
  /** 已订阅的设备集合，用于增量订阅与释放 */
  private subscribedDevices = new Set<string>();

  constructor(opts: DataRuntimeOptions, sandbox: ScriptSandbox = getScriptSandbox()) {
    this.opts = opts;
    this.sandbox = sandbox;
  }

  private sandbox: ScriptSandbox;

  /**
   * 接入实时推送通道。绑定 IoT 设备的节点将改为推送驱动（不再轮询），
   * 通道断开时自动回退轮询，恢复后重新订阅并立即拉取一次。
   */
  attachRealtime(channel: RealtimeChannel): void {
    this.detachRealtime();
    this.realtime = channel;
    this.realtimeUnsubs = [
      channel.onTelemetry((msg) => {
        void this.handleTelemetry(msg);
      }),
      channel.onConnection((connected) => this.onRealtimeState(connected)),
    ];

    // 补订阅运行中已绑定的设备
    if (this.deviceNodes.size > 0) {
      channel.subscribeDevices([...this.collectBoundDevices()]);
    }
    // 已在推送模式的节点补拉一次（可能错过断线期间的数据）
    if (channel.connected) {
      this.deviceNodes.forEach((n) => void this.refresh(n));
    }
  }

  detachRealtime(): void {
    this.realtimeUnsubs.forEach((un) => un());
    this.realtimeUnsubs = [];
    this.realtime = null;
  }

  /** 遥测入口：多点推送串行分发，保证转换脚本的执行顺序与数据到达顺序一致 */
  private async handleTelemetry(msg: {
    deviceId: string;
    propertyCode?: string;
    points?: Array<{ propertyCode: string; value: number; timestamp: string }>;
  }): Promise<void> {
    const points = msg.points ?? [];
    if (points.length > 0) {
      for (const p of points) {
        await this.dispatchPush({ deviceId: msg.deviceId, propertyCode: p.propertyCode, value: p });
      }
      return;
    }
    // 无点位明细（如仅状态变化）：按设备维度重新拉取最新值
    this.opts.nodes.forEach((node) => {
      if (node.dataBinding?.deviceId === msg.deviceId) void this.refresh(node);
    });
  }

  /** 推送通道断开 → 全部设备节点回退轮询；恢复 → 停轮询、重订阅、立即拉取 */
  private onRealtimeState(connected: boolean): void {
    if (this.deviceNodes.size === 0) return;
    if (connected) {
      this.realtime?.subscribeDevices([...this.collectBoundDevices()]);
      this.deviceNodes.forEach((n) => {
        this.stopTimer(n.id);
        void this.refresh(n);
      });
    } else {
      this.deviceNodes.forEach((n) => this.startPolling(n));
    }
  }

  /** 汇总当前绑定且已订阅的设备（未订阅的过滤掉） */
  private collectBoundDevices(): string[] {
    const ids = new Set<string>();
    this.deviceNodes.forEach((n) => {
      const id = n.dataBinding?.deviceId;
      if (id && this.subscribedDevices.has(id)) ids.add(id);
    });
    return [...ids];
  }

  /** 绑定节点 → 维护设备订阅表 */
  private trackDeviceNode(node: WidgetNode, binding: DataBinding): void {
    if (!binding.deviceId) return;
    this.deviceNodes.set(node.id, node);
    if (!this.subscribedDevices.has(binding.deviceId)) {
      this.subscribedDevices.add(binding.deviceId);
      this.realtime?.subscribeDevices([binding.deviceId]);
    }
  }

  /** 释放节点 → 若无其他节点绑定该设备则取消订阅 */
  private untrackDeviceNode(nodeId: string): void {
    const node = this.deviceNodes.get(nodeId);
    if (!node) return;
    const deviceId = node.dataBinding?.deviceId;
    this.deviceNodes.delete(nodeId);
    if (!deviceId) return;
    const stillBound = [...this.deviceNodes.values()].some(
      (n) => n.dataBinding?.deviceId === deviceId,
    );
    if (!stillBound) {
      this.subscribedDevices.delete(deviceId);
      this.realtime?.unsubscribeDevices([deviceId]);
    }
  }

  /** 为单个节点启动数据刷新（IoT 绑定优先走推送，否则按 refreshInterval 轮询，默认 5s） */
  bind(node: WidgetNode): void {
    const binding = node.dataBinding;
    if (!binding) return;
    this.stop(node.id);

    // 静态数据：立即注入一次即可（同样经字段映射与转换脚本，与编辑器预览行为一致）
    if (binding.staticData !== undefined && !binding.dataSourceId && !binding.deviceId) {
      void this.refresh(node);
      return;
    }

    // IoT 设备绑定：登记到推送订阅表；通道在线时改为推送驱动（仅拉一次初始值）
    if (binding.deviceId) {
      this.trackDeviceNode(node, binding);
      if (this.realtime?.connected) {
        void this.refresh(node);
        return;
      }
    }

    const interval = binding.refreshInterval ?? 5000;
    if (interval <= 0) {
      // 0 表示仅由推送驱动，拉一次兜底
      void this.refresh(node);
      return;
    }
    void this.refresh(node);
    this.startPolling(node, interval);
  }

  /** 启动节点轮询定时器 */
  private startPolling(node: WidgetNode, interval?: number): void {
    const ms = interval ?? node.dataBinding?.refreshInterval ?? 5000;
    if (ms <= 0) return;
    const timer = window.setInterval(() => void this.refresh(node), ms);
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
      const transformed = await this.runTransform(mapped, binding);
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
   * 安全边界：脚本在 Worker 沙箱内执行，无 window/document/fetch，超时自动中断；
   * 执行失败则回退原始数据并通过 onError 上报，不让一个坏脚本卡死整张屏。
   */
  private async runTransform(data: unknown, binding: DataBinding): Promise<unknown> {
    const script = binding.transformScript;
    if (!script || !script.trim()) return data;
    const res = await this.sandbox.runTransform(script, data);
    if (!res.ok) {
      const error = new Error(res.error ?? '转换脚本执行失败');
      console.warn('[data-runtime] 转换脚本执行失败，回退原始数据', res.error);
      this.opts.onError?.('__transform', error);
      return data;
    }
    return res.value === undefined ? data : res.value;
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
   * 推送分发（由 RealtimeChannel 遥测事件驱动）：
   * 找到绑定该设备（且属性匹配）的节点，立即注入推送数据。
   */
  async dispatchPush(msg: {
    deviceId: string;
    propertyCode?: string;
    value: unknown;
  }): Promise<void> {
    const targets = [...this.opts.nodes.values()].filter((node) => {
      const b = node.dataBinding;
      if (!b || b.deviceId !== msg.deviceId) return false;
      if (b.propertyCode && msg.propertyCode && b.propertyCode !== msg.propertyCode) return false;
      return true;
    });
    for (const node of targets) {
      const mapped = this.mapFields(msg.value, node.dataBinding!);
      this.applyData(node, await this.runTransform(mapped, node.dataBinding!));
    }
  }

  /** 停止某节点的数据刷新并解除设备订阅 */
  stop(nodeId: string): void {
    this.stopTimer(nodeId);
    this.untrackDeviceNode(nodeId);
  }

  /** 释放全部定时器与缓存 */
  dispose(): void {
    this.timers.forEach((t) => window.clearInterval(t));
    this.timers.clear();
    this.lastData.clear();
    this.detachRealtime();
    this.deviceNodes.clear();
    this.subscribedDevices.clear();
  }

  private stopTimer(nodeId: string): void {
    const t = this.timers.get(nodeId);
    if (t !== undefined) {
      window.clearInterval(t);
      this.timers.delete(nodeId);
    }
  }
}
