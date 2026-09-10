import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfig } from '../config/configuration';

/**
 * 数据库模块。
 * 连接池按并发动态配置，开启慢查询与容错重连（详细设计 6.4）。
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.get<AppConfig['database']>('database')!;
        return {
          type: 'postgres' as const,
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.database,
          // 生产环境严禁 synchronize，结构变更走版本化 SQL / migration
          synchronize: db.synchronize,
          logging: db.logging ? (['error', 'warn', 'migration'] as const) : ['error'],
          autoLoadEntities: true,
          // 连接池与容错（防止数据库瞬时抖动导致服务雪崩）
          extra: {
            min: db.poolMin,
            max: db.poolMax,
            connectionTimeoutMillis: 10_000,
            idleTimeoutMillis: 30_000,
            statement_timeout: 30_000,
          },
          retryAttempts: 10,
          retryDelay: 3000,
          // 时间戳统一按 UTC 存储，展示层负责时区转换
          timezone: 'Z',
        };
      },
    }),
  ],
})
export class DatabaseModule {}
