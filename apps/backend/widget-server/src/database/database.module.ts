import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'node:path';
import type { AppConfig } from '../config/configuration';

/**
 * 数据库模块。
 * 连接池按并发动态配置，开启慢查询与容错重连（详细设计 6.4）。
 *
 * 结构演进策略（迭代 8.2）：
 * - synchronize 生产严禁，结构变更一律走 src/database/migrations/*；
 * - 默认不自动迁移，由 `pnpm db:migrate` 显式执行；
 *   部署希望“启动即迁移”时置 DB_MIGRATIONS_RUN=true。
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
          // 生产环境严禁 synchronize，结构变更走版本化 migration
          synchronize: db.synchronize,
          // ts-node 与 dist 两种运行形态都能命中（*{.ts,.js} 二选一生效）
          migrations: [join(__dirname, 'migrations/*{.ts,js}')],
          migrationsRun: db.migrationsRun,
          migrationsTableName: 'sys_migrations',
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
