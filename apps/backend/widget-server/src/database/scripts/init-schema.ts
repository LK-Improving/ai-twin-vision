import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import dataSource from '../data-source';

/**
 * 手动初始化数据库结构与种子数据。
 * 适用于未使用 docker-entrypoint-initdb.d 的场景（如连接已有 PostgreSQL 实例）：
 *   pnpm --filter @dt/widget-server schema:init
 */
async function main(): Promise<void> {
  const sqlDir = join(__dirname, '../sql');
  const files = ['01_schema.sql', '02_seed.sql'];

  await dataSource.initialize();
  console.info('[init-schema] 数据库连接成功');

  for (const file of files) {
    const sql = readFileSync(join(sqlDir, file), 'utf-8');
    console.info(`[init-schema] 执行 ${file} ...`);
    await dataSource.query(sql);
    console.info(`[init-schema] ${file} 执行完成`);
  }

  await dataSource.destroy();
  console.info('[init-schema] 全部完成。演示账号：admin / Admin@123');
}

main().catch((error) => {
  console.error('[init-schema] 执行失败：', error);
  process.exit(1);
});
