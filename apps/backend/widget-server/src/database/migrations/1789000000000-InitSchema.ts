import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 基线迁移：收编 2026-09-19 之前的全部结构（原 `sql/01_schema.sql`）。
 *
 * 为什么执行 SQL 文件而不是复制一份 DDL：
 * 复制会产生两份真相，改表时必然漂移。这里让「基线」与「docker 首次引导」共用同一份 SQL，
 * 文件本身自此冻结 —— 后续结构变更一律新增 migration，禁止再改 01_schema.sql。
 *
 * 幂等性（关键）：01_schema.sql 通篇使用 CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS，
 * 所以对「已经被旧流程建好库」的陈旧环境，本迁移是安全的空操作 + 只登记版本号，
 * 不会因为重复执行而报错，也不会覆盖已有数据。
 */

/** 兼容 ts-node / dist / pnpm deploy 三种运行位置的基线 SQL 定位 */
function locateBaselineSql(): string {
  const candidates = [
    // 开发（ts-node）与 pnpm deploy 后的包根目录
    path.join(process.cwd(), 'src', 'database', 'sql', '01_schema.sql'),
    // 编译产物 dist/database/migrations → 回到包内 src
    path.join(__dirname, '..', '..', '..', 'src', 'database', 'sql', '01_schema.sql'),
    // 直接以仓库根为 cwd 调用时
    path.join(
      process.cwd(),
      'apps',
      'backend',
      'widget-server',
      'src',
      'database',
      'sql',
      '01_schema.sql',
    ),
  ];
  for (const file of candidates) {
    try {
      return readFileSync(file, 'utf-8');
    } catch {
      /* 换下一个候选路径 */
    }
  }
  throw new Error(
    `找不到基线 SQL（01_schema.sql）。已尝试：\n  ${candidates.join('\n  ')}\n` +
      '请确认在 widget-server 包目录下执行迁移命令。',
  );
}

export class InitSchema1789000000000 implements MigrationInterface {
  name = 'InitSchema1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 基线含 DO $$ 块与 CREATE EXTENSION，按文件原文整体提交由 PostgreSQL 顺序执行
    await queryRunner.query(locateBaselineSql());
  }

  public async down(): Promise<void> {
    // 基线不设计为可回滚：逆操作等价于删库，误执行的代价远大于收益。
    throw new Error(
      'InitSchema 是基线迁移，不支持 revert。需要回到空库请直接重建数据库实例，' +
        '再执行 pnpm db:migrate（基线）+ pnpm db:seed。',
    );
  }
}
