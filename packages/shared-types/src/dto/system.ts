import type { PageQuery } from '../common/response';
import type { ResourceType } from '../common/enums';

/** 用户列表项（sys_user） */
export interface UserItem {
  id: string;
  tenantId: string;
  username: string;
  realName: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  status: number;
  roles: Array<{ id: string; roleCode: string; roleName: string }>;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserQuery extends PageQuery {
  status?: number;
  roleId?: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  realName?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  status?: number;
  roleIds?: string[];
}

export type UpdateUserRequest = Partial<Omit<CreateUserRequest, 'password'>>;

/** 角色（sys_role） */
export interface RoleItem {
  id: string;
  tenantId: string;
  roleCode: string;
  roleName: string;
  description: string | null;
  isSystem: boolean;
  permissionIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoleRequest {
  roleCode: string;
  roleName: string;
  description?: string;
  permissionIds?: string[];
}

export type UpdateRoleRequest = Partial<CreateRoleRequest>;

/** 权限（sys_permission），树形结构 */
export interface PermissionNode {
  id: string;
  permissionCode: string;
  permissionName: string;
  resourceType: ResourceType | string;
  parentId: string | null;
  path: string | null;
  sortOrder: number;
  children?: PermissionNode[];
}

/** 租户（sys_tenant） */
export interface TenantItem {
  id: string;
  tenantCode: string;
  tenantName: string;
  contactPerson: string | null;
  contactPhone: string | null;
  status: number;
  expireAt: string | null;
  createdAt: string;
}

/** 操作日志（sys_operation_log） */
export interface OperationLogItem {
  id: string;
  userId: string;
  username: string;
  module: string;
  action: string;
  requestMethod: string;
  requestUrl: string;
  requestParams: Record<string, unknown> | null;
  responseStatus: number;
  responseTime: number;
  ipAddress: string;
  userAgent: string | null;
  createdAt: string;
}

export interface OperationLogQuery extends PageQuery {
  userId?: string;
  module?: string;
  startTime?: string;
  endTime?: string;
}

/** 健康检查响应 */
export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  uptime: number;
  version: string;
  dependencies: Record<string, { status: 'up' | 'down'; latency?: number; message?: string }>;
  timestamp: string;
}
