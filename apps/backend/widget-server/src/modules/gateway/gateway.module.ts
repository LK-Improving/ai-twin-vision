import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { AppConfig } from '../../config/configuration';
import { RealtimeGateway } from './realtime.gateway';

/**
 * 实时推送模块（Sprint 1）。
 * Gateway 单例随应用启动；IotModule 等业务模块 import 本模块后即可注入 RealtimeGateway 广播。
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<AppConfig['jwt']>('jwt')!.accessSecret,
      }),
    }),
  ],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class GatewayModule {}
