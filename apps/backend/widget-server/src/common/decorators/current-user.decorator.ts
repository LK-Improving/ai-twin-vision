import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** 请求上下文中的登录用户信息，由 JwtStrategy 注入 */
export interface RequestUser {
  userId: string;
  username: string;
  tenantId: string;
  roles: string[];
}

/**
 * 取当前登录用户。
 * 用法：`@CurrentUser() user: RequestUser` 或 `@CurrentUser('userId') userId: string`
 */
export const CurrentUser = createParamDecorator(
  (field: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
