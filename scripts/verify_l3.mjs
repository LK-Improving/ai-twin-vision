import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:3001/api/v1';
// 与 mock_text3d.mjs 保持一致：读取脚本目录下 .tmp 的捕获文件
const MOCK_REQ = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '.tmp',
  'mock-request.json',
);

async function waitHealth() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return true;
    } catch {
      // 后端未就绪：忽略本次错误，继续轮询
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

console.log('health=', await waitHealth());

const login = await (
  await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  })
).json();
const token = login?.data?.accessToken;
console.log('login code=', login.code);
if (!token) process.exit(1);

async function gen(name, strategy) {
  const res = await fetch(`${BASE}/ai/scene/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      prompt: '生成一个智慧产业园区，包含商业综合体、研发办公楼和地铁站，夜晚灯光效果',
      name,
      quality: 'L1',
      strategy,
      autoPublish: true,
    }),
  });
  const j = await res.json();
  const d = j.data || {};
  const fallback = (d.warnings || []).filter((w) => w.includes('降级'));
  console.log(`\n=== strategy=${strategy} ===`);
  console.log('  http=', res.status, 'code=', j.code, 'msg=', j.message);
  console.log('  sceneId     =', d.sceneId);
  console.log('  modelUrl    =', d.modelUrl);
  console.log('  screenUrl   =', d.screenUrl);
  console.log('  stats       =', JSON.stringify(d.stats));
  console.log(
    '  warnings    =',
    (d.warnings || []).length,
    JSON.stringify((d.warnings || []).slice(0, 2)),
  );
  console.log('  降级说明    =', fallback[0] ?? '(无，按策略正常执行)');
  return { d, fallback };
}

// A. text3d：mock 服务已配置 → 应真正走第三方适配器，不降级
const a = await gen('L3 验证-text3d(mock已配置)', 'text3d');
// B/C. 未配置的第三方 → 应降级为程序化生成并给出说明
const b = await gen('L3 验证-gaussianSplat(未配置)', 'gaussianSplat');
const c = await gen('L3 验证-amapEarth(未配置)', 'amapEarth');

console.log('\n=== mock 收到的请求（证明适配器真的调用了第三方） ===');
try {
  const req = JSON.parse(fs.readFileSync(MOCK_REQ, 'utf8'));
  console.log('  authorization=', req.authorization);
  console.log('  contentType  =', req.contentType);
  console.log('  prompt       =', req.body?.prompt);
  console.log('  format       =', req.body?.format);
  console.log('  quality      =', req.body?.quality);
  console.log('  meta.title   =', req.body?.meta?.title);
} catch (e) {
  console.log('  读取 mock 请求失败:', e.message);
}

console.log('\n=== 断言 ===');
const mockGlbBytes = 12 + 8 + 8 + 4; // 仅占位，实际以 stats.bytes 为准
console.log(
  'A 走第三方未降级 =',
  a.fallback.length === 0 && !!a.d.modelUrl,
  `(bytes=${a.d.stats?.bytes})`,
);
console.log('B 降级并说明    =', b.fallback.length === 1 && !!b.d.sceneId);
console.log('C 降级并说明    =', c.fallback.length === 1 && !!c.d.sceneId);
console.log('A 与 B 产物不同  =', a.d.modelUrl !== b.d.modelUrl);
