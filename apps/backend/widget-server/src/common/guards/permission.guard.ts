import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BizCode, RoleCode } from '@dt/shared-types';
import { PERMISSIONS_KEY, ROLES_KEY } from '../decorators/require-permissions.decorator';
import { BizException } from '../exceptions/biz.exception';
import { AuthzService } from '../../modules/user/authz.service';
import type { RequestUser } from '../decorators/current-user.decorator';

/**
 * RBAC 权限守卫（详细设计 3.5 接口权限校验）。
 * 依据 @RequirePermissions / @RequireRoles 元数据做细粒度校验，
 * 超级管理员默认放行，防止垂直越权。
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authzService: AuthzService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 未声明权限要求的接口，只要通过 JWT 即可访问
    if (
      (!requiredPermissions || requiredPermissions.length === 0) &&
      (!requiredRoles || requiredRoles.length === 0)
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user) throw new BizException(BizCode.TOKEN_INVALID);

    // 超级管理员放行
    if (user.roles?.includes(RoleCode.SUPER_ADMIN)) return true;

    if (requiredRoles?.length) {
      const matched = requiredRoles.some((role) => user.roles?.includes(role));
      if (!matched) throw new BizException(BizCode.PERMISSION_DENIED);
    }

    if (requiredPermissions?.length) {
      const owned = await this.authzService.getPermissionCodes(user.userId);
      const matched = requiredPermissions.some((permission) => owned.includes(permission));
      if (!matched) throw new BizException(BizCode.PERMISSION_DENIED);
    }

    return true;
  }
}
