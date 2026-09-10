import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import dataSource from '../data-source';

/**
 * 仅执行种子数据（02_seed.sql）。
 * 适用于表结构已存在、只想重置演示数据的场景：
 *   pnpm --filter @dt/widget-server seed
 *
 * 注意：种子脚本含 TRUNCATE/ON CONFLICT 逻辑，重复执行是幂等的。
 */
async function main(): Promise<void> {
  const sqlPath = join(__dirname, '../sql/02_seed.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  await dataSource.initialize();
  console.info('[seed] 数据库连接成功');

  await dataSource.query(sql);
  console.info('[seed] 种子数据写入完成');

  await dataSource.destroy();
  console.info('[seed] 完成。演示账号：admin / Admin@123');
}

main().catch((error) => {
  console.error('[seed] 执行失败：', error);
  process.exit(1);
});
