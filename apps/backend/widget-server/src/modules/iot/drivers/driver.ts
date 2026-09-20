/**
 * 协议驱动抽象（Sprint 1 数据底座）。
 *
 * MQTT / OPC-UA / Modbus 三种接入方式统一为 ProtocolDriver 契约：
 * 驱动负责「连接设备侧」，把原始报文解析为标准遥测点后通过 DriverContext 上抛，
 * 由 DeviceIngestService 统一落库、广播。新增协议只需实现本接口并注册。
 */

/** 一个设备的订阅描述（来自 iot_device 行） */
export interface DeviceSubscription {
  tenantId: string;
  deviceId: string;
  deviceCode: string;
  /** 主题/节点地址等寻址信息（MQTT 为 topic，可含 +/# 通配符） */
  topic: string;
  qos?: number;
}

/** 解析后的标准遥测点 */
export interface ParsedTelemetryPoint {
  propertyCode: string;
  value: number;
  /** ISO 字符串或毫秒时间戳；缺省由落库侧取当前时间 */
  timestamp?: string | number;
}

/** 驱动回调上下文 */
export interface DriverContext {
  /** 报文解析成功：按订阅维度上抛遥测点集合 */
  onMessage(device: DeviceSubscription, rawTopic: string, points: ParsedTelemetryPoint[]): void;
  /** 设备上下线变化 */
  onStatus(device: DeviceSubscription, online: boolean): void;
  /** 驱动级断线/重连：批量标记该驱动下全部设备离线（可选） */
  onStatusAll?(online: boolean): void;
  /** 驱动级错误（连接失败、重连、解析异常等），不中断服务 */
  onError(source: string, error: Error): void;
}

/** 协议驱动契约 */
export interface ProtocolDriver {
  readonly protocol: string;
  /** 建立连接并订阅全部设备；实现需内置自动重连 */
  start(subscriptions: DeviceSubscription[]): Promise<void>;
  /** 释放连接与全部监听 */
  stop(): Promise<void>;
}

/**
 * 解析 MQTT 报文为标准遥测点。兼容四种常见格式：
 * 1. { deviceCode, properties: { temperature: 65.2 }, timestamp }   —— 平台标准格式
 * 2. { properties: { temperature: 65.2 } }                          —— 无设备编码
 * 3. { propertyCode: 'temperature', value: 65.2, timestamp }        —— 单点格式
 * 4. { temperature: 65.2, load: 71.3 }                              —— 裸属性表
 * 非数值属性自动跳过；解析失败返回空数组（不抛错，避免毒消息打断订阅）。
 */
export function parseTelemetryPayload(raw: string | Buffer): ParsedTelemetryPoint[] {
  let body: unknown;
  try {
    body = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    return [];
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return [];

  const obj = body as Record<string, unknown>;
  const timestamp = extractTimestamp(obj.timestamp);
  const toPoint = (code: unknown, value: unknown): ParsedTelemetryPoint | null => {
    const numeric =
      typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    if (typeof code !== 'string' || !code.trim() || !Number.isFinite(numeric)) return null;
    const point: ParsedTelemetryPoint = { propertyCode: code.trim(), value: numeric };
    if (timestamp !== undefined) point.timestamp = timestamp;
    return point;
  };

  // 格式 2/1：properties 属性表
  if (obj.properties && typeof obj.properties === 'object' && !Array.isArray(obj.properties)) {
    const points: ParsedTelemetryPoint[] = [];
    Object.entries(obj.properties as Record<string, unknown>).forEach(([code, value]) => {
      const p = toPoint(code, value);
      if (p) points.push(p);
    });
    return points;
  }

  // 格式 3：单点
  if (typeof obj.propertyCode === 'string') {
    const p = toPoint(obj.propertyCode, obj.value);
    return p ? [p] : [];
  }

  // 格式 4：裸属性表（跳过保留键）
  const reserved = new Set([
    'deviceCode',
    'timestamp',
    'time',
    'ts',
    'properties',
    'propertyCode',
    'value',
  ]);
  const points: ParsedTelemetryPoint[] = [];
  Object.entries(obj).forEach(([code, value]) => {
    if (reserved.has(code)) return;
    const p = toPoint(code, value);
    if (p) points.push(p);
  });
  return points;
}

function extractTimestamp(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value && !Number.isNaN(Date.parse(value))) return value;
  return undefined;
}

/** 将 MQTT 主题通配符（+/#）转为正则，用于报文主题与订阅主题的匹配 */
export function topicToRegExp(topic: string): RegExp {
  const source = topic
    .split('/')
    .map((seg) => {
      if (seg === '+') return '[^/]+';
      if (seg === '#') return '.*';
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return new RegExp(`^${source}$`);
}
