import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

// 优先加载仓库根目录的多环境变量文件
const rootDir = resolve(__dirname, '../../../../../');
const envFile = process.env.ENV_FILE ?? `.env.${process.env.NODE_ENV === 'production' ? 'prod' : 'dev'}`;
const envPath = join(rootDir, envFile);
if (existsSync(envPath)) {
  loadEnv({ path: envPath });
} else {
  loadEnv();
}

/**
 * TypeORM CLI 数据源（用于 migration:generate / migration:run）。
 * 运行时连接由 DatabaseModule 负责，二者配置保持一致。
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  username: process.env.POSTGRES_USER ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? 'root',
  database: process.env.POSTGRES_DB ?? 'digital_twin',
  entities: [join(__dirname, '../modules/**/entities{.ts,.js}')],
  migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
  migrationsTableName: 'sys_migrations',
  synchronize: false,
  logging: ['error', 'warn'],
});
