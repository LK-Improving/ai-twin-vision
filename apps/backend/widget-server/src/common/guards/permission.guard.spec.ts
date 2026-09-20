import { BizCode, RoleCode } from '@dt/shared-types';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import { PERMISSIONS_KEY, ROLES_KEY } from '../decorators/require-permissions.decorator';
import { BizException } from '../exceptions/biz.exception';
import type { AuthzService } from '../../modules/user/authz.service';
import type { RequestUser } from '../decorators/current-user.decorator';

/**
 * RBAC 守卫是垂直越权的最后一道闸，重点测「默认放行」的边界与失败路径：
 * 一旦 `@RequirePermissions` 被漏标或超管判断写反，这里必须红。
 */

/** 构造只带 user 的 HTTP 执行上下文 */
function ctxOf(user?: Partial<RequestUser>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

/** 用反射结果驱动守卫（Reflector 是守卫唯一的元数据入口） */
function build(
  meta: { permissions?: string[]; roles?: string[] },
  user?: Partial<RequestUser>,
  owned: string[] = [],
) {
  const authz = {
    getPermissionCodes: jest.fn().mockResolvedValue(owned),
  } as unknown as AuthzService;
  const reflector = {
    // 用真实导出的 key 而不是字面量，避开装饰器改名时测试在原地骗人
    getAllAndOverride: jest.fn((key: string) => {
      if (key === PERMISSIONS_KEY) return meta.permissions;
      if (key === ROLES_KEY) return meta.roles;
      return undefined;
    }),
  } as unknown as Reflector;
  // 用具体类型而非 CanActivate：后者的 canActivate 返回 union，无法直接 await 断言
  const guard = new PermissionGuard(reflector, authz);
  return { guard, authz, ctx: ctxOf(user) };
}

const expectBizCode = async (promise: Promise<unknown>, code: number): Promise<void> => {
  await expect(promise).rejects.toBeInstanceOf(BizException);
  await promise.catch((err: BizException) => {
    expect(err.bizCode).toBe(code);
  });
};

describe('PermissionGuard', () => {
  it('未声明权限要求时只要通过 JWT 即放行（且不查权限表）', async () => {
    const { guard, ctx, authz } = build({}, { userId: 'u1', roles: [RoleCode.VIEWER] });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authz.getPermissionCodes).not.toHaveBeenCalled();
  });

  it('声明了权限但没有 user（未认证请求）→ TOKEN_INVALID', async () => {
    const { guard, ctx } = build({ permissions: ['scene:publish'] }, undefined);
    await expectBizCode(guard.canActivate(ctx), BizCode.TOKEN_INVALID);
  });

  it('超级管理员直接放行，不再比对角色与权限', async () => {
    const { guard, ctx, authz } = build(
      { permissions: ['user:manage'], roles: [RoleCode.TENANT_ADMIN] },
      { userId: 'root', roles: [RoleCode.SUPER_ADMIN] },
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authz.getPermissionCodes).not.toHaveBeenCalled();
  });

  it('角色不匹配 → PERMISSION_DENIED，且不会去查权限码', async () => {
    const { guard, ctx, authz } = build(
      { roles: [RoleCode.TENANT_ADMIN] },
      { userId: 'u2', roles: [RoleCode.VIEWER] },
    );
    await expectBizCode(guard.canActivate(ctx), BizCode.PERMISSION_DENIED);
    expect(authz.getPermissionCodes).not.toHaveBeenCalled();
  });

  it('命中任一所需权限即放行（some 语义）', async () => {
    const { guard, ctx, authz } = build(
      { permissions: ['scene:publish', 'scene:manage'] },
      { userId: 'u3', roles: [RoleCode.DEVELOPER] },
      ['scene:publish'],
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authz.getPermissionCodes).toHaveBeenCalledWith('u3');
  });

  it('权限一个都不含 → PERMISSION_DENIED', async () => {
    const { guard, ctx } = build(
      { permissions: ['scene:publish'] },
      { userId: 'u4', roles: [RoleCode.DEVELOPER] },
      ['device:view'],
    );
    await expectBizCode(guard.canActivate(ctx), BizCode.PERMISSION_DENIED);
  });

  it('空数组装饰器等同未声明（防止 @RequirePermissions() 意外全放行误判为拒绝）', async () => {
    const { guard, ctx } = build({ permissions: [], roles: [] }, { userId: 'u5', roles: [] });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
