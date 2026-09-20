import { Module } from '@nestjs/common';
import { join, resolve } from 'node:path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { OperationLogInterceptor } from './common/interceptors/operation-log.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { SceneModule } from './modules/scene/scene.module';
import { ComponentModule } from './modules/component/component.module';
import { FileModule } from './modules/file/file.module';
import { DataModule } from './modules/data/data.module';
import { IotModule } from './modules/iot/iot.module';
import { LogModule } from './modules/log/log.module';
import { HealthModule } from './modules/health/health.module';
import { AiModule } from './modules/ai/ai.module';
import configuration from './config/configuration';

/**
 * 应用根模块。
 *
 * 全局装配顺序（NestJS 管道模型）：
 * 请求 → ValidationPipe（DTO 校验）
 *      → JwtAuthGuard（@Public 跳过）
 *      → PermissionGuard（@RequirePermissions 校验）
 *      → OperationLogInterceptor（标记 @OperationLog 的落库）
 *      → Controller
 *      → TransformInterceptor（统一 ApiResponse 包裹）
 * 异常统一由 AllExceptionsFilter 兜底。
 */
/**
 * 环境文件解析（约定见《详细设计》6.1）：多环境文件为 .env.dev / .env.test / .env.prod，
 * 统一放在**仓库根目录**，因此需从当前模块向上一级级回溯到 root，
 * 否则在 apps/backend/widget-server 下启动时会找不到文件、静默回落到代码默认值。
 */
const ENV_FILE_ALIAS: Record<string, string> = {
  development: 'dev',
  production: 'prod',
  test: 'test',
};
const rootDir = resolve(__dirname, '../../../../');
const envFileName = ENV_FILE_ALIAS[process.env.NODE_ENV ?? ''] ?? 'dev';
const envFilePath = join(rootDir, `.env.${envFileName}`);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [envFilePath, '.env'],
      ignoreEnvFile: false,
    }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    UserModule,
    SceneModule,
    ComponentModule,
    FileModule,
    DataModule,
    IotModule,
    LogModule,
    HealthModule,
    AiModule,
  ],
  providers: [
    // 全局参数校验：自动剥离未声明字段，数组与嵌套对象一并转换
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: false,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: OperationLogInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {
  /** 启动日志中打印关键配置，便于排障 */
  constructor(config: ConfigService) {
    if (process.env.NODE_ENV !== 'test') {
      const name = config.get<string>('name') ?? 'digital-twin-platform';
      const env = config.get<string>('env') ?? 'development';
      const prefix = config.get<string>('apiPrefix') ?? 'api';
      const version = config.get<string>('apiVersion') ?? 'v1';
      // eslint-disable-next-line no-console
      console.log(`[${name}] env=${env} prefix=/${prefix}/${version}`);
    }
  }
}
