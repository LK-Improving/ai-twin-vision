import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type { DataMappingItem } from '@dt/shared-types';

/** 数据源表 biz_data_source */
@Entity('biz_data_source')
@Index('idx_data_source_tenant_type', ['tenantId', 'type'])
export class DataSourceEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'name', length: 200 })
  name: string;

  /** PG / MYSQL / HTTP / WEBSOCKET / MQTT / OPC-UA / MODBUS / STATIC */
  @Column({ name: 'type', length: 20 })
  type: string;

  /** 连接配置，接口返回时敏感字段脱敏 */
  @Column({ name: 'config', type: 'jsonb' })
  config: Record<string, unknown>;

  /** 0-离线 1-在线 */
  @Column({ name: 'status', type: 'smallint', default: 0 })
  status: number;

  @Column({ name: 'test_result', type: 'jsonb', nullable: true })
  testResult: Record<string, unknown> | null;

  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;
}

/** 数据映射表 biz_data_mapping */
@Entity('biz_data_mapping')
@Index('idx_data_mapping_scene', ['sceneId', 'status'])
export class DataMappingEntity extends BaseEntity {
  @Column({ name: 'scene_id', type: 'uuid' })
  sceneId: string;

  @Column({ name: 'data_source_id', type: 'uuid' })
  dataSourceId: string;

  /** 目标组件实例 ID（biz_scene_component.id） */
  @Column({ name: 'target_component_id', type: 'uuid' })
  targetComponentId: string;

  @Column({ name: 'mapping_config', type: 'jsonb' })
  mappingConfig: DataMappingItem['mappingConfig'];

  /** 刷新间隔（毫秒） */
  @Column({ name: 'refresh_interval', type: 'int', default: 5000 })
  refreshInterval: number;

  /** 1-启用 0-禁用 */
  @Column({ name: 'status', type: 'smallint', default: 1 })
  status: number;
}
