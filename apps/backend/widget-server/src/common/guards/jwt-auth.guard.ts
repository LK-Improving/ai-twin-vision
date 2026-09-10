import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { BizCode } from '@dt/shared-types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { BizException } from '../exceptions/biz.exception';
import type { Observable } from 'rxjs';

/**
 * 全局 JWT 鉴权守卫。
 * 标记 @Public() 的接口跳过校验；令牌过期与非法分别返回不同业务码，
 * 便于前端拦截器区分「无感续期」与「跳转登录」（详细设计 2.3）。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  override handleRequest<TUser>(err: unknown, user: TUser, info: unknown): TUser {
    if (err || !user) {
      const name = (info as Error | undefined)?.name;
      if (name === 'TokenExpiredError') {
        throw new BizException(BizCode.TOKEN_EXPIRED);
      }
      throw new BizException(BizCode.TOKEN_INVALID);
    }
    return user;
  }
}
