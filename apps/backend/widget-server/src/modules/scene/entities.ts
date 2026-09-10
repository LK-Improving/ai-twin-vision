import { Column, Entity, Index } from 'typeorm';
import { BaseEntity, CreateOnlyEntity } from '../../common/entities/base.entity';
import type { EngineConfig, PageSchema, SceneType, Transform } from '@dt/shared-types';

/** 场景表 biz_scene */
@Entity('biz_scene')
@Index('idx_scene_tenant_status', ['tenantId', 'status'])
export class SceneEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'name', length: 200 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'cover_image', length: 255, nullable: true })
  coverImage: string | null;

  /** MACRO / MICRO / HYBRID */
  @Column({ name: 'scene_type', length: 20, default: 'HYBRID' })
  sceneType: SceneType | string;

  /** Cesium 与 Three.js 引擎配置 */
  @Column({ name: 'engine_config', type: 'jsonb', default: () => "'{}'::jsonb" })
  engineConfig: EngineConfig;

  /** 低代码 2D 画布 Schema */
  @Column({ name: 'layout', type: 'jsonb', default: () => "'{}'::jsonb" })
  layout: PageSchema;

  /** 0-草稿 1-已发布 2-已归档 */
  @Column({ name: 'status', type: 'smallint', default: 0 })
  status: number;

  /** 当前编辑版本号，每次保存自增 */
  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  /** 已发布版本号 */
  @Column({ name: 'publish_version', type: 'int', nullable: true })
  publishVersion: number | null;

  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;
}

/** 场景组件实例表 biz_scene_component */
@Entity('biz_scene_component')
@Index('idx_scene_component_scene', ['sceneId', 'sortOrder'])
export class SceneComponentEntity extends BaseEntity {
  @Column({ name: 'scene_id', type: 'uuid' })
  sceneId: string;

  @Column({ name: 'component_id', type: 'uuid' })
  componentId: string;

  @Column({ name: 'name', length: 200, nullable: true })
  name: string | null;

  /** 组件实例化配置（对应 config_schema 的取值） */
  @Column({ name: 'component_config', type: 'jsonb', default: () => "'{}'::jsonb" })
  componentConfig: Record<string, unknown>;

  /** 空间变换 */
  @Column({ name: 'position', type: 'jsonb', default: () => "'{}'::jsonb" })
  position: Transform;

  @Column({ name: 'layer_id', length: 64, nullable: true })
  layerId: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'visible', type: 'boolean', default: true })
  visible: boolean;

  @Column({ name: 'locked', type: 'boolean', default: false })
  locked: boolean;
}

/** 场景版本表 biz_scene_version */
@Entity('biz_scene_version')
@Index('uk_scene_version', ['sceneId', 'versionNo'], { unique: true })
export class SceneVersionEntity extends CreateOnlyEntity {
  @Column({ name: 'scene_id', type: 'uuid' })
  sceneId: string;

  @Column({ name: 'version_no', type: 'int' })
  versionNo: number;

  /** 场景完整快照：引擎配置 + 组件 + 画布 */
  @Column({ name: 'snapshot_data', type: 'jsonb' })
  snapshotData: Record<string, unknown>;

  @Column({ name: 'change_log', type: 'text', nullable: true })
  changeLog: string | null;

  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;
}
