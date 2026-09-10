import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';
export const ROLES_KEY = 'requiredRoles';

/**
 * 声明访问接口所需的权限编码（RBAC 细粒度控制，详细设计 3.5）。
 * 多个权限为「任一满足」语义。
 * 用法：`@RequirePermissions(Permissions.SCENE_EDIT)`
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** 声明访问接口所需角色编码（任一满足） */
export const RequireRoles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
