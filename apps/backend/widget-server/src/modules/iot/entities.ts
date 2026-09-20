import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type { AlertRuleItem } from '@dt/shared-types';

/** IoT 设备表 iot_device */
@Entity('iot_device')
@Index('idx_device_tenant_status', ['tenantId', 'status'])
export class DeviceEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'device_code', length: 100 })
  deviceCode: string;

  @Column({ name: 'device_name', length: 200 })
  deviceName: string;

  @Column({ name: 'device_type', length: 50 })
  deviceType: string;

  /** MQTT / OPC-UA / MODBUS / HTTP */
  @Column({ name: 'protocol', length: 20 })
  protocol: string;

  @Column({ name: 'connection_config', type: 'jsonb', default: () => "'{}'::jsonb" })
  connectionConfig: Record<string, unknown>;

  /** 0-离线 1-在线 */
  @Column({ name: 'status', type: 'smallint', default: 0 })
  status: number;

  @Column({ name: 'last_online_at', type: 'timestamptz', nullable: true })
  lastOnlineAt: Date | null;
}

/** 设备属性表 iot_device_property（物模型） */
@Entity('iot_device_property')
export class DevicePropertyEntity extends BaseEntity {
  @Column({ name: 'device_id', type: 'uuid' })
  deviceId: string;

  @Column({ name: 'property_code', length: 100 })
  propertyCode: string;

  @Column({ name: 'property_name', length: 200 })
  propertyName: string;

  @Column({ name: 'property_type', length: 20 })
  propertyType: string;

  @Column({ type: 'varchar', name: 'unit', length: 20, nullable: true })
  unit: string | null;

  @Column({ name: 'min_value', type: 'decimal', nullable: true })
  minValue: string | null;

  @Column({ name: 'max_value', type: 'decimal', nullable: true })
  maxValue: string | null;

  @Column({ type: 'varchar', name: 'default_value', length: 100, nullable: true })
  defaultValue: string | null;
}

/**
 * 设备遥测数据表 iot_device_telemetry（时序表）
 * 主键为 (id, timestamp) 以满足 TimescaleDB 分区约束。
 */
@Entity('iot_device_telemetry')
@Index('idx_telemetry_device_time', ['deviceId', 'propertyCode', 'timestamp'])
export class DeviceTelemetryEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @PrimaryColumn({ name: 'timestamp', type: 'timestamptz', default: () => 'NOW()' })
  timestamp: Date;

  @Column({ name: 'device_id', type: 'uuid' })
  deviceId: string;

  @Column({ name: 'property_code', length: 100 })
  propertyCode: string;

  @Column({ name: 'value', type: 'double precision' })
  value: number;
}

/** 告警规则表 iot_alert_rule */
@Entity('iot_alert_rule')
@Index('idx_alert_rule_device', ['deviceId', 'enabled'])
export class AlertRuleEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'device_id', type: 'uuid', nullable: true })
  deviceId: string | null;

  @Column({ name: 'property_code', length: 100 })
  propertyCode: string;

  @Column({ name: 'rule_name', length: 200 })
  ruleName: string;

  @Column({ name: 'condition', type: 'jsonb' })
  condition: AlertRuleItem['condition'];

  @Column({ name: 'threshold', type: 'double precision', nullable: true })
  threshold: number | null;

  /** 1-提示 2-警告 3-严重 4-紧急 */
  @Column({ name: 'alert_level', type: 'smallint', default: 2 })
  alertLevel: number;

  @Column({ name: 'notify_channel', type: 'jsonb', default: () => "'{}'::jsonb" })
  notifyChannel: AlertRuleItem['notifyChannel'];

  @Column({ name: 'enabled', type: 'boolean', default: true })
  enabled: boolean;
}

/** 告警事件表 iot_alert_event */
@Entity('iot_alert_event')
@Index('idx_alert_event_tenant_time', ['tenantId', 'triggeredAt'])
export class AlertEventEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId: string;

  @Column({ name: 'rule_name', length: 200 })
  ruleName: string;

  @Column({ name: 'device_id', type: 'uuid', nullable: true })
  deviceId: string | null;

  @Column({ name: 'property_code', length: 100 })
  propertyCode: string;

  @Column({ name: 'trigger_value', type: 'double precision' })
  triggerValue: number;

  @Column({ name: 'alert_level', type: 'smallint' })
  alertLevel: number;

  /** 0-未处理 1-已确认 2-已恢复 */
  @Column({ name: 'status', type: 'smallint', default: 0 })
  status: number;

  @Column({ name: 'message', length: 500 })
  message: string;

  @Column({ name: 'triggered_at', type: 'timestamptz', default: () => 'NOW()' })
  triggeredAt: Date;

  @Column({ name: 'recovered_at', type: 'timestamptz', nullable: true })
  recoveredAt: Date | null;

  @Column({ name: 'handled_by', type: 'uuid', nullable: true })
  handledBy: string | null;
}
