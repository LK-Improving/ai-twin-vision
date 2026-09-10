import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshTokenEntity, TenantEntity } from '../user/entities';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { JwtStrategy } from './jwt.strategy';

/**
 * 认证模块：JWT 双 Token 机制 + 登录防爆破 + 令牌轮换。
 */
@Module({
  imports: [
    ConfigModule,
    PassportModule,
    // 各处签发时显式传入 secret 与过期时间，此处不设默认值
    JwtModule.register({}),
    TypeOrmModule.forFeature([RefreshTokenEntity, TenantEntity]),
    UserModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtStrategy],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
