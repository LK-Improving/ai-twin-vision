import { http } from '@/services/request';
import type {
  CreateRoleRequest,
  CreateUserRequest,
  OperationLogItem,
  OperationLogQuery,
  PageResult,
  PermissionNode,
  RoleItem,
  UpdateRoleRequest,
  UpdateUserRequest,
  UserItem,
  UserQuery,
} from '@dt/shared-types';

/* ---------------- 用户 ---------------- */

export function getUsersApi(params: UserQuery): Promise<PageResult<UserItem>> {
  return http.get<PageResult<UserItem>>('/users', { params });
}

export function createUserApi(data: CreateUserRequest): Promise<UserItem> {
  return http.post<UserItem>('/users', data);
}

export function updateUserApi(id: string, data: UpdateUserRequest): Promise<UserItem> {
  return http.put<UserItem>(`/users/${id}`, data);
}

export function deleteUserApi(id: string): Promise<null> {
  return http.del<null>(`/users/${id}`);
}

/* ---------------- 角色 ---------------- */

export function getRolesApi(): Promise<RoleItem[]> {
  return http.get<RoleItem[]>('/roles');
}

export function createRoleApi(data: CreateRoleRequest): Promise<RoleItem> {
  return http.post<RoleItem>('/roles', data);
}

export function updateRoleApi(id: string, data: UpdateRoleRequest): Promise<RoleItem> {
  return http.put<RoleItem>(`/roles/${id}`, data);
}

export function deleteRoleApi(id: string): Promise<null> {
  return http.del<null>(`/roles/${id}`);
}

/* ---------------- 权限树 ---------------- */

export function getPermissionsApi(): Promise<PermissionNode[]> {
  return http.get<PermissionNode[]>('/permissions/tree');
}

/* ---------------- 操作日志 ---------------- */

export function getOperationLogsApi(params: OperationLogQuery): Promise<PageResult<OperationLogItem>> {
  return http.get<PageResult<OperationLogItem>>('/operation-logs', { params });
}
