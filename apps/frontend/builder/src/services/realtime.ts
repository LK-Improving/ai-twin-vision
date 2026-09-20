/**
 * 实时推送客户端（Sprint 1）。
 *
 * Socket.IO 单例：应用级共享一条连接，握手携带 Access Token，
 * 断线自动重连并在恢复后重放订阅。路径走同源 /socket.io，
 * 开发环境由 Vite 代理、生产环境由 Nginx 反代到后端。
 */
import { io, type Socket } from 'socket.io-client';
import {
  RealtimeClientEvent,
  RealtimeServerEvent,
  type AlertTriggeredPayload,
  type DeviceStatusPayload,
  type RealtimeSubscribePayload,
  type TelemetryPushPayload,
} from '@dt/shared-types';
import { getExpiresIn } from '@/utils/storage';
import { ensureFreshToken } from '@/services/request';

export type TelemetryHandler = (payload: TelemetryPushPayload) => void;
export type DeviceStatusHandler = (payload: DeviceStatusPayload) => void;
export type AlertHandler = (payload: AlertTriggeredPayload) => void;
export type ConnectionHandler = (connected: boolean) => void;

class RealtimeClient {
  private socket: Socket | null = null;
  private connecting: Promise<void> | null = null;
  private subscribedDevices = new Set<string>();
  private sceneId: string | null = null;
  private telemetryHandlers = new Set<TelemetryHandler>();
  private statusHandlers = new Set<DeviceStatusHandler>();
  private alertHandlers = new Set<AlertHandler>();
  private connectionHandlers = new Set<ConnectionHandler>();
  /** Access Token 主动续期定时器 */
  private authTimer: number | null = null;
  /**
   * 票据模式令牌：大屏公开页（/screen/:token）用发布令牌换取，
   * 短时效、只读、限场景。存在时不走登录态续期逻辑。
   */
  private ticket: string | null = null;
  /**
   * 票据刷新函数：票据模式下由调用方注入（通常用发布令牌重换）。
   * 重建连接前会先调用它拿到最新票据，避免旧票据过期后永久重连失败。
   */
  private ticketProvider: (() => Promise<string | null> | string | null) | null = null;

  /** 当前连接状态（响应式场景请配合 onConnection 使用） */
  connected = false;

  /**
   * 建立连接（幂等；已连接时直接返回）。
   * @param ticket 传入则使用大屏票据握手（公开访问场景）
   */
  ensure(ticket?: string): Promise<void> {
    if (ticket) this.ticket = ticket;
    if (this.connected && !ticket) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = this.connect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async connect(): Promise<void> {
    // 票据模式优先用最新的下发票据（连接前先重换，避免旧票据过期）；
    // 否则临近过期时先续期，避免刚建连就拿到一枚即将失效的令牌
    const token = this.ticket ? await this.refreshTicket() : await ensureFreshToken();
    if (!token) return; // 未登录：保持离线，由调用方在登录后重试

    await new Promise<void>((resolve) => {
      const socket = io({
        path: '/socket.io',
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 15_000,
      });

      socket.on('connect', () => {
        this.connected = true;
        this.socket = socket;
        // 票据是短时效下发令牌，没有 Refresh Token，不做续期
        if (!this.ticket) this.scheduleAuthRefresh();
        this.replaySubscriptions();
        this.connectionHandlers.forEach((h) => h(true));
        resolve();
      });

      socket.on('disconnect', () => {
        this.connected = false;
        this.connectionHandlers.forEach((h) => h(false));
      });

      socket.on(RealtimeServerEvent.TELEMETRY, (payload: TelemetryPushPayload) => {
        this.telemetryHandlers.forEach((h) => h(payload));
      });

      socket.on(RealtimeServerEvent.DEVICE_STATUS, (payload: DeviceStatusPayload) => {
        this.statusHandlers.forEach((h) => h(payload));
      });

      socket.on(RealtimeServerEvent.ALERT_TRIGGERED, (payload: AlertTriggeredPayload) => {
        this.alertHandlers.forEach((h) => h(payload));
      });

      socket.on(RealtimeServerEvent.ERROR, (payload: { message?: string }) => {
        console.warn('[realtime] 服务端错误：', payload?.message);
      });

      socket.on('connect_error', (err: Error) => {
        console.warn('[realtime] 连接失败，将自动重试：', err.message);
        // 令牌过期是重连失败最常见的原因：先续期，下一次自动重试即带上新令牌。
        // 这里不手动 connect()，交给 socket.io 的退避重连，避免重复建连。
        if (this.ticket) {
          // 票据模式无 Refresh Token：重换一张再重试
          void this.refreshTicket().then((fresh) => {
            if (fresh) socket.auth = { token: fresh };
          });
        } else {
          void ensureFreshToken().then((fresh) => {
            if (fresh) socket.auth = { token: fresh };
          });
        }
        resolve(); // 不阻塞调用方，socket.io 会自动重连
      });
    });
  }

  /** 订阅设备遥测（幂等，自动去重；重连后自动重放） */
  subscribeDevices(deviceIds: string[]): void {
    const fresh = deviceIds.filter((id) => id && !this.subscribedDevices.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => this.subscribedDevices.add(id));
    this.emitSubscribe({ deviceIds: fresh });
  }

  /** 取消设备订阅（无其他节点绑定时调用） */
  unsubscribeDevices(deviceIds: string[]): void {
    const known = deviceIds.filter((id) => this.subscribedDevices.has(id));
    if (known.length === 0) return;
    known.forEach((id) => this.subscribedDevices.delete(id));
    this.socket?.emit(RealtimeClientEvent.UNSUBSCRIBE, {
      deviceIds: known,
    } satisfies RealtimeSubscribePayload);
  }

  /** 场景级订阅（告警联动等场景事件） */
  setScene(sceneId: string | null): void {
    if (this.sceneId === sceneId) return;
    const prev = this.sceneId;
    this.sceneId = sceneId;
    if (prev) this.socket?.emit(RealtimeClientEvent.UNSUBSCRIBE, { sceneId: prev });
    if (sceneId) this.emitSubscribe({ sceneId });
  }

  /**
   * 注入票据刷新函数（公开大屏用）。连接前与重连失败时会调用它拿到最新票据。
   */
  setTicketProvider(provider: () => Promise<string | null> | string | null): void {
    this.ticketProvider = provider;
  }

  /**
   * 取得当前（或刷新后的）票据：若注入了刷新函数则调用之，
   * 失败则回退到已有票据。返回 null 表示暂无可用票据。
   */
  private async refreshTicket(): Promise<string | null> {
    if (this.ticketProvider) {
      try {
        const next = await this.ticketProvider();
        if (next) this.ticket = next;
      } catch {
        // 刷新失败：保留旧票据，交由 socket.io 重试
      }
    }
    return this.ticket;
  }

  /** 遥测推送监听；返回取消函数 */
  onTelemetry(handler: TelemetryHandler): () => void {
    this.telemetryHandlers.add(handler);
    return () => this.telemetryHandlers.delete(handler);
  }

  /** 设备状态监听；返回取消函数 */
  onDeviceStatus(handler: DeviceStatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  /** 告警触发/恢复监听；返回取消函数 */
  onAlert(handler: AlertHandler): () => void {
    this.alertHandlers.add(handler);
    return () => this.alertHandlers.delete(handler);
  }

  /** 连接状态变化监听；返回取消函数 */
  onConnection(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  /**
   * 主动续期握手令牌。
   *
   * 服务端只在握手时校验令牌，已建立的连接不会因为令牌过期被踢掉；
   * 但一旦之后发生断线，socket.io 会拿 auth 里的旧令牌重连，导致永久失败。
   * 因此这里在令牌过期前提前续期并刷新 socket.auth，保证任何时刻重连都持有有效令牌。
   */
  private scheduleAuthRefresh(): void {
    this.clearAuthTimer();
    const expiresIn = getExpiresIn();
    if (!expiresIn) return;
    // 提前 60s 续期；令牌极短时兜底至少 30s 一次
    const delay = Math.max(30_000, (expiresIn - 60) * 1000);
    this.authTimer = window.setInterval(() => {
      void ensureFreshToken().then((fresh) => {
        if (fresh && this.socket) this.socket.auth = { token: fresh };
      });
    }, delay);
  }

  private clearAuthTimer(): void {
    if (this.authTimer !== null) {
      window.clearInterval(this.authTimer);
      this.authTimer = null;
    }
  }

  /** 页面卸载时断开（应用级单例一般无需手动调用） */
  close(): void {
    this.ticket = null;
    this.ticketProvider = null;
    this.clearAuthTimer();
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
    this.subscribedDevices.clear();
    this.telemetryHandlers.clear();
    this.statusHandlers.clear();
    this.alertHandlers.clear();
    this.connectionHandlers.clear();
  }

  /** 重连后重放全部订阅 */
  private replaySubscriptions(): void {
    const payload: RealtimeSubscribePayload = {};
    if (this.subscribedDevices.size > 0) payload.deviceIds = [...this.subscribedDevices];
    if (this.sceneId) payload.sceneId = this.sceneId;
    if ((payload.deviceIds?.length ?? 0) > 0 || payload.sceneId) {
      this.socket?.emit(RealtimeClientEvent.SUBSCRIBE, payload);
    }
  }

  private emitSubscribe(payload: RealtimeSubscribePayload): void {
    if (this.connected) {
      this.socket?.emit(RealtimeClientEvent.SUBSCRIBE, payload);
    }
    // 未连接时只记录，连接成功后由 replaySubscriptions 统一下发
  }
}

/** 应用级单例 */
export const realtime = new RealtimeClient();
