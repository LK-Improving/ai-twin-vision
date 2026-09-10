import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { BizCode, type JwtAccessPayload, type JwtRefreshPayload, type TokenPair } from '@dt/shared-types';
import { RefreshTokenEntity, UserEntity } from '../user/entities';
import { BizException } from '../../common/exceptions/biz.exception';
import { sha256 } from '../../common/utils/crypto.util';
import type { AppConfig } from '../../config/configuration';

/** 把 15m / 7d / 3600 这类时长描述转换为秒 */
export function parseDurationToSeconds(duration: string): number {
  const matched = /^(\d+)([smhd])?$/.exec(duration.trim());
  if (!matched) return 900;
  const value = Number(matched[1]);
  switch (matched[2]) {
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return value;
  }
}

/**
 * 令牌服务：实现 JWT 双 Token 机制（详细设计 2.3）。
 * - Access Token 短效（默认 15 分钟），仅用于接口鉴权
 * - Refresh Token 长效（默认 7 天），落库并绑定设备指纹，支持轮换与吊销
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshRepo: Repository<RefreshTokenEntity>,
  ) {}

  private get jwtConfig(): AppConfig['jwt'] {
    return this.config.get<AppConfig['jwt']>('jwt')!;
  }

  /** 签发令牌对，并把 Refresh Token 摘要写入数据库 */
  async issueTokenPair(
    user: UserEntity,
    roles: string[],
    context: { deviceId?: string; userAgent?: string; ipAddress?: string } = {},
  ): Promise<TokenPair> {
    const jwtConfig = this.jwtConfig;
    const accessExpires = parseDurationToSeconds(jwtConfig.accessExpiresIn);
    const refreshExpires = parseDurationToSeconds(jwtConfig.refreshExpiresIn);

    const accessPayload: JwtAccessPayload = {
      sub: user.id,
      username: user.username,
      tenantId: user.tenantId,
      roles,
    };
    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: jwtConfig.accessSecret,
      expiresIn: accessExpires,
    });

    const jti = randomUUID();
    const refreshPayload: JwtRefreshPayload = {
      sub: user.id,
      jti,
      deviceId: context.deviceId,
    };
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: jwtConfig.refreshSecret,
      expiresIn: refreshExpires,
    });

    await this.refreshRepo.insert({
      userId: user.id,
      jti,
      tokenHash: sha256(refreshToken),
      deviceId: context.deviceId ?? null,
      userAgent: context.userAgent?.slice(0, 500) ?? null,
      ipAddress: context.ipAddress?.slice(0, 45) ?? null,
      expiresAt: new Date(Date.now() + refreshExpires * 1000),
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpires,
      tokenType: 'Bearer',
    };
  }

  /**
   * 校验 Refresh Token 并返回载荷。
   * 校验点：签名有效、未过期、库中存在、未被吊销、设备指纹一致。
   */
  async verifyRefreshToken(token: string, deviceId?: string): Promise<JwtRefreshPayload> {
    let payload: JwtRefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtRefreshPayload>(token, {
        secret: this.jwtConfig.refreshSecret,
      });
    } catch {
      throw new BizException(BizCode.REFRESH_TOKEN_INVALID);
    }

    const record = await this.refreshRepo.findOne({ where: { jti: payload.jti } });
    if (!record || record.revokedAt) {
      throw new BizException(BizCode.REFRESH_TOKEN_INVALID);
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new BizException(BizCode.REFRESH_TOKEN_INVALID, '刷新令牌已过期');
    }
    if (record.tokenHash !== sha256(token)) {
      // 摘要不一致意味着令牌被篡改或已轮换，吊销该用户全部会话以防重放
      await this.revokeAllByUser(record.userId);
      this.logger.warn(`检测到刷新令牌摘要不一致，已吊销用户 ${record.userId} 的全部会话`);
      throw new BizException(BizCode.REFRESH_TOKEN_INVALID);
    }
    if (record.deviceId && deviceId && record.deviceId !== deviceId) {
      throw new BizException(BizCode.REFRESH_TOKEN_INVALID, '刷新令牌与设备不匹配');
    }

    return payload;
  }

  /** 吊销单个 Refresh Token（轮换时调用） */
  async revokeByJti(jti: string): Promise<void> {
    await this.refreshRepo.update({ jti }, { revokedAt: new Date() });
  }

  /** 吊销用户全部会话（登出、改密、安全事件） */
  async revokeAllByUser(userId: string, deviceId?: string): Promise<void> {
    const where = deviceId ? { userId, deviceId } : { userId };
    await this.refreshRepo.update(where, { revokedAt: new Date() });
  }

  /** 清理过期令牌记录，避免表膨胀 */
  async cleanupExpired(): Promise<number> {
    const result = await this.refreshRepo.delete({ expiresAt: LessThan(new Date()) });
    return result.affected ?? 0;
  }
}
