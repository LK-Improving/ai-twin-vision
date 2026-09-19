#!/usr/bin/env node
/**
 * CI 前端产物体积棘轮（迭代 4.2）。
 *
 * 为什么要它：三维/图表类大屏的体积是一路"顺手加个依赖"涨上去的，
 * 光靠 review 拦不住。这里把 dist/assets 的 gzip 体积钉进预算文件，
 * 任何一次增长超过预算都会在 CI 上红掉，除非显式更新预算（review 时可见）。
 *
 * 用法：
 *   node scripts/ci-size-report.mjs                       # 只报告，不判定
 *   node scripts/ci-size-report.mjs --budget scripts/size-budget.json
 *   node scripts/ci-size-report.mjs --update              # 用当前实测值放宽预算（+10% 余量）
 *   node scripts/ci-size-report.mjs --dir <path> --budget <path>
 *
 * 无第三方依赖，只用 node 内置模块。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.join(HERE, '../apps/frontend/builder/dist/assets');
const DEFAULT_BUDGET = path.join(HERE, 'size-budget.json');

function parseArgs(argv) {
  const args = { dir: DEFAULT_DIR, budget: DEFAULT_BUDGET, update: false, check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--update') args.update = true;
    else if (a === '--budget') args.budget = path.resolve(argv[(i += 1)]);
    else if (a === '--dir') args.dir = path.resolve(argv[(i += 1)]);
    else if (a === '--check') args.check = true;
  }
  return args;
}

/**
 * 去掉 vite 注入的内容 hash，得到稳定的预算键：vendor-echarts-tr1DhbfO.js → vendor-echarts.js
 *
 * 只削定长 8 位的 hash 段（vite 默认生成长度）：早期写成 {8,} 贪婪匹配，
 * 会把 vendor-echarts-tr1DhbfO 连中间名字一起吃掉，导致多个厂商包归并成同一个预算键。
 */
function stableName(file) {
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  return base.replace(/-[A-Za-z0-9_-]{8}$/, '') + ext;
}

function collect(dir) {
  if (!fs.existsSync(dir)) {
    console.error(`[size] 目录不存在：${dir}（是否还没执行 pnpm build？）`);
    process.exit(1);
  }
  return fs
    .readdirSync(dir)
    .filter((f) => fs.statSync(path.join(dir, f)).isFile())
    .map((f) => {
      const buf = fs.readFileSync(path.join(dir, f));
      return {
        name: stableName(f),
        file: f,
        rawKB: +(buf.length / 1024).toFixed(1),
        gzipKB: +(gzipSync(buf, { level: 9 }).length / 1024).toFixed(1),
      };
    })
    .sort((a, b) => b.gzipKB - a.gzipKB);
}

function readBudget(file) {
  if (!fs.existsSync(file)) return { assets: {}, totalGzipKB: 0 };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeBudget(file, rows, prev) {
  const assets = {};
  rows.forEach((r) => {
    // 同名 chunk 可能多个（异步分包），取最大值；+0.5KB 地板值避免小产物被舍入到 0 后当场自红
    const cap = Math.max(assets[r.name] ?? 0, +(r.gzipKB * 1.1 + 0.5).toFixed(1));
    assets[r.name] = cap;
  });
  const total = +(rows.reduce((s, r) => s + r.gzipKB, 0) * 1.1 + 5).toFixed(1);
  const out = {
    $comment:
      '前端产物 gzip 体积预算（KB）。由 `node scripts/ci-size-report.mjs --update` 生成，' +
      '含 10% 余量；调高预算等于承认体积增长，请在 PR 里说明原因。',
    generatedFrom: prev?.generatedFrom ?? 'apps/frontend/builder/dist/assets',
    totalGzipKB: total,
    assets,
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  return out;
}

const args = parseArgs(process.argv.slice(2));
const rows = collect(args.dir);
const totalGzip = +rows.reduce((s, r) => s + r.gzipKB, 0).toFixed(1);
const totalRaw = +rows.reduce((s, r) => s + r.rawKB, 0).toFixed(1);

console.log(`[size] ${rows.length} 个产物，raw ${totalRaw} KB / gzip ${totalGzip} KB`);
console.table(rows.slice(0, 12).map(({ name, rawKB, gzipKB }) => ({ name, rawKB, gzipKB })));

if (args.update) {
  const next = writeBudget(args.budget, rows, readBudget(args.budget));
  console.log(
    `[size] 预算已更新 → ${path.relative(process.cwd(), args.budget)}（totalGzipKB=${next.totalGzipKB}）`,
  );
  process.exit(0);
}

if (!args.check && !fs.existsSync(args.budget)) {
  console.log(
    '[size] 未找到预算文件，仅报告不判定。首次生成：node scripts/ci-size-report.mjs --update',
  );
  process.exit(0);
}

const budget = readBudget(args.budget);
const violations = [];
const perAsset = new Map();
rows.forEach((r) => perAsset.set(r.name, Math.max(perAsset.get(r.name) ?? 0, r.gzipKB)));

for (const [name, cap] of Object.entries(budget.assets ?? {})) {
  const actual = perAsset.get(name);
  if (actual === undefined) continue; // 产物消失不算违规（改名/移除依赖时预算自然作废，由 --update 收敛）
  if (actual > cap) violations.push(`${name}: gzip ${actual} KB > 预算 ${cap} KB`);
}
if (budget.totalGzipKB && totalGzip > budget.totalGzipKB) {
  violations.push(`总计 gzip ${totalGzip} KB > 预算 ${budget.totalGzipKB} KB`);
}

if (violations.length) {
  console.error('[size] 体积超预算：');
  violations.forEach((v) => console.error('  - ' + v));
  console.error(
    '[size] 若为有意增长：node scripts/ci-size-report.mjs --update 并把变化写进 PR 说明',
  );
  process.exit(1);
}
console.log(`[size] 通过（预算 ${budget.totalGzipKB || '-'} KB）`);
