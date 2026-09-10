import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { BizCode, CommonStatus, type JwtAccessPayload } from '@dt/shared-types';
import { UserService } from '../user/user.service';
import { BizException } from '../../common/exceptions/biz.exception';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import type { AppConfig } from '../../config/configuration';

/**
 * JWT 策略：从 Authorization: Bearer <token> 解析 Access Token。
 * 校验通过后把用户信息注入 request.user，供 @CurrentUser 与 PermissionGuard 使用。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<AppConfig['jwt']>('jwt')!.accessSecret,
    });
  }

  async validate(payload: JwtAccessPayload): Promise<RequestUser> {
    // 二次校验账号状态，确保被禁用的用户即刻失效
    const user = await this.userService.findById(payload.sub);
    if (!user) throw new BizException(BizCode.USER_NOT_FOUND);
    if (user.status !== CommonStatus.ENABLED) throw new BizException(BizCode.ACCOUNT_DISABLED);

    return {
      userId: payload.sub,
      username: payload.username,
      tenantId: payload.tenantId,
      roles: payload.roles ?? [],
    };
  }
}
