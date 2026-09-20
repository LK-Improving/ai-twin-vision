/**
 * 实时推送（WebSocket）契约。
 *
 * 通道：Socket.IO，默认路径 /socket.io。
 * 握手鉴权：客户端在 auth 中携带 accessToken（JWT 双 Token 中的 Access Token）。
 * 订阅模型：
 * - 房间 device:{deviceId} —— 遥测与状态按设备分发；
 * - 房间 scene:{sceneId}  —— 场景级事件（告警联动、数据源刷新）按场景分发。
 */

/** 客户端 → 服务端事件名 */
export enum RealtimeClientEvent {
  /** 订阅：{ deviceIds?: string[], sceneId?: string } */
  SUBSCRIBE = 'subscribe',
  /** 取消订阅：{ deviceIds?: string[], sceneId?: string } */
  UNSUBSCRIBE = 'unsubscribe',
  /** 心跳 ping（可选，Socket.IO 自带 ping/pong，此事件用于业务层保活确认） */
  PING = 'ping',
}

/** 服务端 → 客户端事件名 */
export enum RealtimeServerEvent {
  /** 订阅结果确认 */
  SUBSCRIBED = 'subscribed',
  /** 遥测推送：TelemetryPushPayload */
  TELEMETRY = 'telemetry',
  /** 设备上下线推送：DeviceStatusPayload */
  DEVICE_STATUS = 'device:status',
  /** 告警触发推送：AlertTriggeredPayload（Sprint 2 规则引擎启用） */
  ALERT_TRIGGERED = 'alert:triggered',
  /** 服务端错误（如鉴权失败后主动断开前通知） */
  ERROR = 'error',
}

/** subscribe / unsubscribe 事件负载 */
export interface RealtimeSubscribePayload {
  sceneId?: string;
  deviceIds?: string[];
}

/** 遥测推送负载：一次上报可携带多个属性点 */
export interface TelemetryPushPayload {
  deviceId: string;
  deviceCode: string;
  tenantId: string;
  points: Array<{
    propertyCode: string;
    value: number;
    timestamp: string;
  }>;
}

/** 设备状态推送负载 */
export interface DeviceStatusPayload {
  deviceId: string;
  deviceCode: string;
  tenantId: string;
  /** 0-离线 1-在线 */
  status: number;
  lastOnlineAt: string | null;
}

/** 告警触发推送负载（与 iot_alert_event 对齐，规则引擎 Sprint 2 启用） */
export interface AlertTriggeredPayload {
  eventId: string;
  tenantId: string;
  ruleId: string;
  ruleName: string;
  deviceId: string | null;
  deviceCode: string | null;
  propertyCode: string;
  triggerValue: number;
  alertLevel: number;
  message: string;
  triggeredAt: string;
  /** 0-触发(进入告警) 2-恢复(回到安全区间)。前端据此高亮/清除 */
  status: number;
  /** 三维场景表现（flash/highlight/ripple），由 notify_channel.sceneEffect 下发 */
  sceneEffect?: { type: 'FLASH' | 'HIGHLIGHT' | 'RIPPLE'; color?: string; targetId?: string };
}

/** 遥测聚合历史点（降采样结果） */
export interface TelemetryHistoryPoint {
  /** 聚合桶起始时间（ISO） */
  timestamp: string;
  propertyCode: string;
  aggValue: number;
  maxValue: number;
  minValue: number;
  /** 桶内原始样本数，可用于判断数据密度 */
  sampleCount: number;
}
