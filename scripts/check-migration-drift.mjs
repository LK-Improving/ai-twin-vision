#!/usr/bin/env node
/**
 * 迁移漂移检查（迭代 8.2）。
 *
 * 解决的问题：改了 entity 却忘记新增 migration —— 这类问题 typecheck/build 都发现不了，
 * 只会在生产库上以「列不存在」的形式爆出来。做法：让 TypeORM 按当前 entity 与目标库做一次差异比对。
 *
 * ⚠ 基线与 entity 在**外键层面不一致**：`01_schema.sql` 声明了 34 个内联 REFERENCES 外键，
 *   而许多 entity（如 ComponentEntity）只有 tenantId/creatorId 普通列、没有 @ManyToOne 关系，
 *   于是 TypeORM 永远会删掉它“不认识”的外键；叠加它不感知的 `COMMENT ON` 与默认值写法差异，
 *   实测共 123 条恒定噪声。本脚本按类型分类排除，只对「列/表/类型」级净变更告警。
 *   背景与已被否掉的两个假设见迭代清单 8.6（结构对齐需产品/架构先定方向）。
 *
 * 用法：
 *   node scripts/check-migration-drift.mjs             # 报告，不阻断
 *   node scripts/check-migration-drift.mjs --strict    # 有净漂移则 exit 1
 * 退出码：0 无净漂移或仅报告；1 存在净漂移（strict 下）；2 工具/连接故障。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = path.join(ROOT, 'apps/backend/widget-server');
const MIGRATIONS_DIR = path.join(BACKEND, 'src', 'database', 'migrations');
const PROBE_MARK = 'DriftProbe';
const STRICT = process.argv.includes('--strict');

/** TypeORM 会给探针文件名自动补时间戳，所以事后按标记搜索而不是猜名字 */
function findProbes() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.includes(PROBE_MARK));
}

function removeProbes() {
  findProbes().forEach((f) => fs.rmSync(path.join(MIGRATIONS_DIR, f), { force: true }));
}

removeProbes();

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'typeorm-ts-node-commonjs',
    'migration:generate',
    `src/database/migrations/${PROBE_MARK}`,
    '-d',
    'src/database/data-source.ts',
  ],
  { cwd: BACKEND, encoding: 'utf8', shell: process.platform === 'win32' },
);

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const probes = findProbes();

if (probes.length === 0) {
  if (/No changes in database schema/i.test(output)) {
    console.log('[drift] entity 与数据库结构一致');
    process.exit(0);
  }
  console.error(
    `[drift] 无法完成比对（退出码 ${result.status}）。请确认数据库可达且已执行 pnpm db:migrate。`,
  );
  console.error(output.trim().split('\n').slice(-10).join('\n'));
  process.exit(2);
}

const generated = fs.readFileSync(path.join(MIGRATIONS_DIR, probes[0]), 'utf8');
removeProbes();

const upBody = /async up\([\s\S]*?\{([\s\S]*?)\n {4}\}/.exec(generated)?.[1] ?? '';
const statements = upBody
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.startsWith('await queryRunner.query'));

// 已知基线噪声（不是“忘加 migration”）：
// - 外键重建：SQL 基线声明了 entity 里未建模的外键，TypeORM 会删掉“不认识”的那些；
// - 索引重建：随外键一同 drop/create；
// - COMMENT ON：SQL 里手写的表/列注释，TypeORM 不感知，会试图抹除；
// - SET/DROP DEFAULT：默认值写法差异（如 `'{}'::jsonb` vs entity 里的声明）。
// 实测（本地库已跑完全量迁移）：123 条差异语句 = 外键 34 + 索引 32 + 注释 42 + 默认值 15，
// 而 ADD|DROP COLUMN、CREATE TABLE、列改型 均为 0 —— 即列层面 entity 与库一致。
// 因此这些不计入净漂移；真正要拦的是列/表/类型变更（归入下方 net）。
const counts = { fk: 0, index: 0, comment: 0, default: 0 };
const net = [];
statements.forEach((s) => {
  if (/COMMENT\s+ON/i.test(s)) counts.comment += 1;
  else if (/(DROP|ADD)\s+(CONSTRAINT|FOREIGN\s+KEY)/i.test(s)) counts.fk += 1;
  else if (/DROP\s+INDEX|CREATE\s+(UNIQUE\s+)?INDEX/i.test(s)) counts.index += 1;
  else if (/\b(SET|DROP)\s+DEFAULT\b/i.test(s)) counts.default += 1;
  else net.push(s);
});

console.log(
  `[drift] 共 ${statements.length} 条差异语句：外键重建 ${counts.fk}，索引重建 ${counts.index}，` +
    `注释抹除 ${counts.comment}，默认值归一 ${counts.default}，净变更 ${net.length}`,
);

if (net.length > 0) {
  console[STRICT ? 'error' : 'warn'](
    `[drift] ${STRICT ? '存在净漂移，需新增 migration：' : '净变更（非阻断）：'}`,
  );
  net.slice(0, 12).forEach((s) => console[STRICT ? 'error' : 'warn']('  ' + s.slice(0, 150)));
  if (net.length > 12) console.log(`  ...另有 ${net.length - 12} 条`);
}
if (net.length > 0 && STRICT) process.exit(1);
process.exit(0);
