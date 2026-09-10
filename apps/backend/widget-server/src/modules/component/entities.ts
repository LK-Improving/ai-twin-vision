import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type { ComponentConfigSchema } from '@dt/shared-types';

/** 组件表 biz_component */
@Entity('biz_component')
@Index('idx_component_tenant_category', ['tenantId', 'category'])
export class ComponentEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'name', length: 200 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'component_type', length: 50 })
  componentType: string;

  @Column({ name: 'category', length: 50 })
  category: string;

  @Column({ name: 'model_file_path', length: 500, nullable: true })
  modelFilePath: string | null;

  @Column({ name: 'thumbnail', length: 255, nullable: true })
  thumbnail: string | null;

  /** 属性面板 Schema，驱动前端动态表单 */
  @Column({ name: 'config_schema', type: 'jsonb', default: () => "'{}'::jsonb" })
  configSchema: ComponentConfigSchema;

  /** 自定义组件源码，沙箱执行 */
  @Column({ name: 'source_code', type: 'text', nullable: true })
  sourceCode: string | null;

  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic: boolean;

  @Column({ name: 'version', length: 20, default: '1.0.0' })
  version: string;

  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;
}

/** 模板表 biz_template */
@Entity('biz_template')
@Index('idx_template_tenant_category', ['tenantId', 'category'])
export class TemplateEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'name', length: 200 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'category', length: 50 })
  category: string;

  /** 模板结构数据：引擎配置 + 组件 + 画布 */
  @Column({ name: 'template_data', type: 'jsonb' })
  templateData: Record<string, unknown>;

  @Column({ name: 'cover_image', length: 255, nullable: true })
  coverImage: string | null;

  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic: boolean;

  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;
}
