import type { PageQuery } from '../common/response';
import type { AlertLevel, DataSourceType, DeviceProtocol } from '../common/enums';

/** 数据源（biz_data_source） */
export interface DataSourceItem {
  id: string;
  name: string;
  type: DataSourceType | string;
  /** 连接配置（密码等敏感字段返回时已脱敏） */
  config: Record<string, unknown>;
  /** 0-离线 1-在线 */
  status: number;
  testResult?: { success: boolean; message?: string; latency?: number; testedAt?: string } | null;
  creatorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataSourceQuery extends PageQuery {
  type?: string;
  status?: number;
}

export interface CreateDataSourceRequest {
  name: string;
  type: DataSourceType | string;
  config: Record<string, unknown>;
}

export type UpdateDataSourceRequest = Partial<CreateDataSourceRequest>;

/** 连通性测试结果 */
export interface DataSourceTestResult {
  success: boolean;
  message: string;
  latency?: number;
  /** 探测到的表/主题列表 */
  schemas?: string[];
}

/** 数据映射（biz_data_mapping）：数据源字段 → 三维组件属性 */
export interface DataMappingItem {
  id: string;
  sceneId: string;
  dataSourceId: string;
  targetComponentId: string;
  mappingConfig: {
    /** 组件属性 → 数据字段路径 */
    fieldMap: Record<string, string>;
    /** 转换规则脚本（沙箱执行） */
    transformScript?: string;
    /** 状态映射：值区间 → 视觉表现 */
    stateRules?: Array<{
      when: string;
      style: Record<string, unknown>;
      label?: string;
    }>;
  };
  refreshInterval: number;
  status: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDataMappingRequest {
  sceneId: string;
  dataSourceId: string;
  targetComponentId: string;
  mappingConfig: DataMappingItem['mappingConfig'];
  refreshInterval?: number;
}

/** IoT 设备（iot_device） */
export interface DeviceItem {
  id: string;
  deviceCode: string;
  deviceName: string;
  deviceType: string;
  protocol: DeviceProtocol | string;
  connectionConfig: Record<string, unknown>;
  status: number;
  lastOnlineAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceQuery extends PageQuery {
  deviceType?: string;
  protocol?: string;
  status?: number;
}

export interface CreateDeviceRequest {
  deviceCode: string;
  deviceName: string;
  deviceType: string;
  protocol: DeviceProtocol | string;
  connectionConfig: Record<string, unknown>;
}

/** 设备属性（iot_device_property） */
export interface DevicePropertyItem {
  id: string;
  deviceId: string;
  propertyCode: string;
  propertyName: string;
  propertyType: string;
  unit: string | null;
  minValue: number | null;
  maxValue: number | null;
  defaultValue: string | null;
}

/** 遥测数据点（iot_device_telemetry，时序） */
export interface TelemetryPoint {
  deviceId: string;
  propertyCode: string;
  value: number;
  timestamp: string;
}

/** 遥测查询参数 */
export interface TelemetryQuery {
  deviceId: string;
  propertyCodes?: string[];
  startTime: string;
  endTime: string;
  /** 聚合粒度，如 1m / 5m / 1h */
  interval?: string;
  /** 聚合函数 */
  agg?: 'avg' | 'max' | 'min' | 'sum' | 'last';
  limit?: number;
}

/** 告警规则（iot_alert_rule） */
export interface AlertRuleItem {
  id: string;
  deviceId: string | null;
  propertyCode: string;
  ruleName: string;
  condition: {
    operator: '>' | '>=' | '<' | '<=' | '==' | '!=' | 'between' | 'outside';
    value?: number;
    min?: number;
    max?: number;
    /** 持续多少毫秒才触发，防抖 */
    duration?: number;
  };
  threshold: number | null;
  alertLevel: AlertLevel | number;
  notifyChannel: {
    websocket?: boolean;
    email?: string[];
    webhook?: string;
    /** 三维场景告警表现 */
    sceneEffect?: { type: 'FLASH' | 'HIGHLIGHT' | 'RIPPLE'; color?: string; targetId?: string };
  };
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAlertRuleRequest {
  deviceId?: string;
  propertyCode: string;
  ruleName: string;
  condition: AlertRuleItem['condition'];
  threshold?: number;
  alertLevel: AlertLevel | number;
  notifyChannel: AlertRuleItem['notifyChannel'];
  enabled?: boolean;
}

/** 告警事件 */
export interface AlertEventItem {
  id: string;
  ruleId: string;
  ruleName: string;
  deviceId: string | null;
  deviceName?: string;
  propertyCode: string;
  triggerValue: number;
  alertLevel: AlertLevel | number;
  /** 0-未处理 1-已确认 2-已恢复 */
  status: number;
  message: string;
  triggeredAt: string;
  recoveredAt?: string | null;
  handledBy?: string | null;
}

/** WebSocket 消息信封（实时通道统一格式） */
export interface RealtimeMessage<T = unknown> {
  /** 事件类型：telemetry / alert / scene-sync / presence */
  type: 'telemetry' | 'alert' | 'scene-sync' | 'presence' | 'ack' | 'error';
  /** 主题，如 scene:{id} 或 device:{code} */
  topic?: string;
  payload: T;
  ts: number;
}
