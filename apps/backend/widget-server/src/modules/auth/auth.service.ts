import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BizCode, CommonStatus, type TokenPair, type UserProfile } from '@dt/shared-types';
import { TenantEntity } from '../user/entities';
import { UserService } from '../user/user.service';
import { AuthzService } from '../user/authz.service';
import { TokenService } from './token.service';
import { BizException } from '../../common/exceptions/biz.exception';
import { verifyPassword } from '../../common/utils/crypto.util';
import { RedisService } from '../../redis/redis.service';
import type { LoginDto, RefreshTokenDto } from './dto/auth.dto';

/** 登录失败锁定策略：5 次失败锁定 10 分钟 */
const LOGIN_FAIL_LIMIT = 5;
const LOGIN_LOCK_SECONDS = 600;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly authzService: AuthzService,
    private readonly tokenService: TokenService,
    private readonly redis: RedisService,
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
  ) {}

  /**
   * 用户登录。
   * 失败次数写入 Redis 做暴力破解防护，成功后签发双 Token。
   */
  async login(
    dto: LoginDto,
    context: { deviceId?: string; userAgent?: string; ipAddress?: string },
  ): Promise<TokenPair> {
    const lockKey = `auth:login:fail:${dto.username}`;
    const failCount = (await this.redis.get<number>(lockKey)) ?? 0;
    if (failCount >= LOGIN_FAIL_LIMIT) {
      throw new BizException(
        BizCode.ACCOUNT_OR_PASSWORD_ERROR,
        '登录失败次数过多，账号已临时锁定，请稍后再试',
      );
    }

    const user = await this.userService.findByUsernameWithPassword(dto.username);
    if (!user) {
      await this.redis.set(lockKey, failCount + 1, LOGIN_LOCK_SECONDS);
      throw new BizException(BizCode.ACCOUNT_OR_PASSWORD_ERROR);
    }

    const matched = await verifyPassword(dto.password, user.password);
    if (!matched) {
      await this.redis.set(lockKey, failCount + 1, LOGIN_LOCK_SECONDS);
      throw new BizException(BizCode.ACCOUNT_OR_PASSWORD_ERROR);
    }

    if (user.status !== CommonStatus.ENABLED) {
      throw new BizException(BizCode.ACCOUNT_DISABLED);
    }

    // 校验租户有效性（多租户到期控制）
    const tenant = await this.tenantRepo.findOne({ where: { id: user.tenantId } });
    if (!tenant || tenant.status !== CommonStatus.ENABLED) {
      throw new BizException(BizCode.TENANT_EXPIRED, '租户已被冻结');
    }
    if (tenant.expireAt && tenant.expireAt.getTime() < Date.now()) {
      throw new BizException(BizCode.TENANT_EXPIRED);
    }

    await this.redis.del(lockKey);

    const roles = await this.authzService.getRoleCodes(user.id);
    const tokens = await this.tokenService.issueTokenPair(user, roles, context);
    await this.userService.touchLoginTime(user.id);
    this.logger.log(`用户 ${user.username} 登录成功 ip=${context.ipAddress ?? '-'}`);

    return tokens;
  }

  /**
   * 刷新令牌（无感续期）。
   * 采用轮换策略：旧 Refresh Token 立即吊销，返回全新令牌对。
   */
  async refresh(
    dto: RefreshTokenDto,
    context: { deviceId?: string; userAgent?: string; ipAddress?: string },
  ): Promise<TokenPair> {
    const payload = await this.tokenService.verifyRefreshToken(
      dto.refreshToken,
      dto.deviceId ?? context.deviceId,
    );

    const user = await this.userService.findById(payload.sub);
    if (!user) throw new BizException(BizCode.USER_NOT_FOUND);
    if (user.status !== CommonStatus.ENABLED) throw new BizException(BizCode.ACCOUNT_DISABLED);

    // 先吊销旧令牌再签发新令牌，避免同一 Refresh Token 被重复使用
    await this.tokenService.revokeByJti(payload.jti);

    const roles = await this.authzService.getRoleCodes(user.id);
    return this.tokenService.issueTokenPair(user, roles, {
      deviceId: dto.deviceId ?? context.deviceId,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    });
  }

  /** 登出：吊销当前设备（或全部设备）的刷新令牌 */
  async logout(userId: string, deviceId?: string): Promise<void> {
    await this.tokenService.revokeAllByUser(userId, deviceId);
    await this.authzService.clearUserCache(userId);
  }

  /** 当前登录用户信息 */
  getProfile(userId: string): Promise<UserProfile> {
    return this.userService.getProfile(userId);
  }

  /** 修改密码后强制下线，要求重新登录 */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    await this.userService.changePassword(userId, oldPassword, newPassword);
    await this.tokenService.revokeAllByUser(userId);
  }
}
