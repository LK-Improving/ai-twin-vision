import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 业务表基类（数据库设计原则 5.2）：
 * 所有业务表必须包含 id (UUID 主键)、created_at、updated_at、deleted_at (软删除)。
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', default: () => 'NOW()' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}

/** 仅含创建时间的基类（日志、关联表等无需更新时间） */
export abstract class CreateOnlyEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;
}

/** 带租户隔离的业务表基类（多租户权限隔离，需求模块六） */
export abstract class TenantBaseEntity extends BaseEntity {
  // 子类通过 @Column({ name: 'tenant_id' }) 声明，避免装饰器元数据继承歧义
}
