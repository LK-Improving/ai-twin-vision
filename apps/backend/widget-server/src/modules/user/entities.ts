import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity, CreateOnlyEntity } from '../../common/entities/base.entity';

/** 租户表 sys_tenant */
@Entity('sys_tenant')
export class TenantEntity extends BaseEntity {
  @Column({ name: 'tenant_code', length: 50 })
  tenantCode: string;

  @Column({ name: 'tenant_name', length: 100 })
  tenantName: string;

  @Column({ name: 'contact_person', length: 50, nullable: true })
  contactPerson: string | null;

  @Column({ name: 'contact_phone', length: 20, nullable: true })
  contactPhone: string | null;

  /** 1-正常 0-冻结 */
  @Column({ name: 'status', type: 'smallint', default: 1 })
  status: number;

  @Column({ name: 'expire_at', type: 'timestamptz', nullable: true })
  expireAt: Date | null;
}

/** 用户表 sys_user */
@Entity('sys_user')
@Index('idx_user_tenant_status', ['tenantId', 'status'])
export class UserEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'username', length: 50 })
  username: string;

  /** bcrypt 加密后的密码，查询时需显式 select */
  @Column({ name: 'password', length: 255, select: false })
  password: string;

  @Column({ name: 'real_name', length: 50, nullable: true })
  realName: string | null;

  @Column({ name: 'email', length: 100, nullable: true })
  email: string | null;

  @Column({ name: 'phone', length: 20, nullable: true })
  phone: string | null;

  @Column({ name: 'avatar', length: 255, nullable: true })
  avatar: string | null;

  /** 1-启用 0-禁用 */
  @Column({ name: 'status', type: 'smallint', default: 1 })
  status: number;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @ManyToOne(() => TenantEntity, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantEntity;
}

/** 角色表 sys_role */
@Entity('sys_role')
export class RoleEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'role_code', length: 50 })
  roleCode: string;

  @Column({ name: 'role_name', length: 100 })
  roleName: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;
}

/** 权限表 sys_permission */
@Entity('sys_permission')
@Index('idx_permission_parent', ['parentId', 'sortOrder'])
export class PermissionEntity extends CreateOnlyEntity {
  @Column({ name: 'permission_code', length: 100 })
  permissionCode: string;

  @Column({ name: 'permission_name', length: 100 })
  permissionName: string;

  /** MENU / BUTTON / API */
  @Column({ name: 'resource_type', length: 20 })
  resourceType: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ name: 'path', length: 255, nullable: true })
  path: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}

/** 用户角色关联表 sys_user_role */
@Entity('sys_user_role')
@Index('uk_user_role', ['userId', 'roleId'], { unique: true })
export class UserRoleEntity extends CreateOnlyEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;
}

/** 角色权限关联表 sys_role_permission */
@Entity('sys_role_permission')
@Index('uk_role_permission', ['roleId', 'permissionId'], { unique: true })
export class RolePermissionEntity extends CreateOnlyEntity {
  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @Column({ name: 'permission_id', type: 'uuid' })
  permissionId: string;
}

/**
 * 刷新令牌表 sys_refresh_token
 * Refresh Token 绑定设备指纹并支持轮换吊销（详细设计 2.3）。
 */
@Entity('sys_refresh_token')
@Index('idx_refresh_user_device', ['userId', 'deviceId'])
export class RefreshTokenEntity extends CreateOnlyEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'jti', length: 64 })
  jti: string;

  /** 仅存 SHA256 摘要，避免明文令牌落库 */
  @Column({ name: 'token_hash', length: 64 })
  tokenHash: string;

  @Column({ name: 'device_id', length: 128, nullable: true })
  deviceId: string | null;

  @Column({ name: 'user_agent', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ name: 'ip_address', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
