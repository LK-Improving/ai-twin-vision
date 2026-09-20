import { BizCode } from '@dt/shared-types';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Repository } from 'typeorm';
import { TokenService, parseDurationToSeconds } from './token.service';
import { BizException } from '../../common/exceptions/biz.exception';
import { sha256 } from '../../common/utils/crypto.util';
import type { RefreshTokenEntity, UserEntity } from '../user/entities';

const JWT_CONFIG = {
  accessSecret: 'a_secret',
  accessExpiresIn: '15m',
  refreshSecret: 'r_secret',
  refreshExpiresIn: '7d',
};

interface Harness {
  service: TokenService;
  sign: jest.Mock;
  verify: jest.Mock;
  repo: {
    insert: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
}

function build(record?: Partial<RefreshTokenEntity>): Harness {
  const sign = jest.fn().mockResolvedValue('jwt-value');
  const verify = jest.fn().mockResolvedValue({ sub: 'u1', jti: 'jti-1', deviceId: 'd1' });
  const repo = {
    insert: jest.fn().mockResolvedValue({ identifiers: [{ id: 'r1' }] }),
    findOne: jest.fn().mockResolvedValue(record ?? null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 3 }),
  };
  const config = { get: () => JWT_CONFIG } as unknown as ConfigService;
  const jwt = { signAsync: sign, verifyAsync: verify } as unknown as JwtService;
  const service = new TokenService(jwt, config, repo as unknown as Repository<RefreshTokenEntity>);
  return { service, sign, verify, repo };
}

const user = { id: 'u1', username: 'admin', tenantId: 't1' } as UserEntity;

/** 未过期、未被吊销、摘要匹配的基线记录 */
function validRecord(
  token: string,
  overrides: Partial<RefreshTokenEntity> = {},
): Partial<RefreshTokenEntity> {
  return {
    userId: 'u1',
    jti: 'jti-1',
    tokenHash: sha256(token),
    deviceId: 'd1',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    ...overrides,
  };
}

describe('parseDurationToSeconds', () => {
  it.each([
    ['15m', 900],
    ['12h', 43200],
    ['7d', 604800],
    ['3600', 3600],
    [' 30m ', 1800],
    ['abc', 900],
    ['', 900],
  ])('%o → %i 秒', (input, expected) => {
    expect(parseDurationToSeconds(input as string)).toBe(expected);
  });
});

describe('TokenService.issueTokenPair', () => {
  it('返回 Bearer 令牌对并落库刷新令牌摘要（不存明文）', async () => {
    const h = build();
    const pair = await h.service.issueTokenPair(user, ['SUPER_ADMIN'], {
      deviceId: 'd1',
      userAgent: 'UA'.repeat(300),
      ipAddress: '10.0.0.1',
    });

    expect(pair.tokenType).toBe('Bearer');
    expect(pair.expiresIn).toBe(900);
    expect(h.sign).toHaveBeenCalledTimes(2);

    const inserted = h.repo.insert.mock.calls[0][0];
    expect(inserted.tokenHash).toBe(sha256('jwt-value'));
    // 明文令牌绝不入库
    expect(inserted.tokenHash).not.toBe('jwt-value');
    expect(inserted.deviceId).toBe('d1');
    expect(inserted.userAgent).toHaveLength(500);
    expect(inserted.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('访问与刷新令牌使用不同密钥签发（防止互相冒充）', async () => {
    const h = build();
    await h.service.issueTokenPair(user, [], {});
    const secrets = h.sign.mock.calls.map((call) => call[1].secret);
    expect(secrets[0]).toBe(JWT_CONFIG.accessSecret);
    expect(secrets[1]).toBe(JWT_CONFIG.refreshSecret);
  });
});

describe('TokenService.verifyRefreshToken', () => {
  it('签名失效 / 记录不存在 / 已吊销 / 已过期 一律 REFRESH_TOKEN_INVALID', async () => {
    await expect(build().service.verifyRefreshToken('x')).rejects.toMatchObject({
      bizCode: BizCode.REFRESH_TOKEN_INVALID,
    });

    // 签名通过但库里没有（令牌被清理或伪造 jti）
    const missing = build();
    missing.repo.findOne.mockResolvedValue(null);
    await expect(missing.service.verifyRefreshToken('x')).rejects.toBeInstanceOf(BizException);

    const revoked = build({ ...validRecord('jwt-value'), revokedAt: new Date() });
    await expect(revoked.service.verifyRefreshToken('jwt-value')).rejects.toMatchObject({
      bizCode: BizCode.REFRESH_TOKEN_INVALID,
    });

    const expired = build({ ...validRecord('jwt-value'), expiresAt: new Date(Date.now() - 1) });
    await expect(expired.service.verifyRefreshToken('jwt-value')).rejects.toMatchObject({
      bizCode: BizCode.REFRESH_TOKEN_INVALID,
    });
  });

  it('摘要不匹配（令牌被复用/篡改）时吊销该用户全部会话以防重放', async () => {
    const h = build(validRecord('some-other-token'));
    await expect(h.service.verifyRefreshToken('jwt-value')).rejects.toMatchObject({
      bizCode: BizCode.REFRESH_TOKEN_INVALID,
    });
    // 关键安全行为：不是只拒绝这一次，而是清掉该用户所有刷新会话
    expect(h.repo.update).toHaveBeenCalledWith(
      { userId: 'u1' },
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });

  it('设备指纹不一致时拒绝，且不会误吊销全部会话', async () => {
    const h = build(validRecord('jwt-value'));
    await expect(h.service.verifyRefreshToken('jwt-value', 'other-device')).rejects.toMatchObject({
      bizCode: BizCode.REFRESH_TOKEN_INVALID,
    });
    expect(h.repo.update).not.toHaveBeenCalled();
  });

  it('一切匹配时返回载荷', async () => {
    const h = build(validRecord('jwt-value'));
    await expect(h.service.verifyRefreshToken('jwt-value', 'd1')).resolves.toMatchObject({
      jti: 'jti-1',
    });
  });
});

describe('TokenService 吊销与清理', () => {
  it('revokeByJti 只动单个 jti', async () => {
    const h = build();
    await h.service.revokeByJti('jti-9');
    expect(h.repo.update).toHaveBeenCalledWith(
      { jti: 'jti-9' },
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });

  it('revokeAllByUser 可限定设备，也可全端吊销', async () => {
    const h = build();
    await h.service.revokeAllByUser('u1');
    expect(h.repo.update).toHaveBeenLastCalledWith(
      { userId: 'u1' },
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );

    await h.service.revokeAllByUser('u1', 'd2');
    expect(h.repo.update).toHaveBeenLastCalledWith(
      { userId: 'u1', deviceId: 'd2' },
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });

  it('cleanupExpired 返回删除行数', async () => {
    const h = build();
    await expect(h.service.cleanupExpired()).resolves.toBe(3);
    expect(h.repo.delete).toHaveBeenCalledTimes(1);
  });
});
