// 查 API 账户余额与用量（官方接口 /v3/account/balance、/v3/account/usage）
import { readFileSync } from 'node:fs';
const ENV = 'D:/Study/重点项目/AI数字孪生可视化大屏/.env.dev';
const raw = readFileSync(ENV, 'utf8')
  .replace(/^\ufeff/, '')
  .replace(/\r\n/g, '\n');
const cfg = {};
for (const line of raw.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) cfg[m[1]] = m[2].trim();
}
const KEY = cfg.TEXT3D_API_KEY;
const host = 'https://openapi.tripo3d.ai';
for (const p of ['/v3/account/balance', '/v3/account/usage']) {
  try {
    const res = await fetch(host + p, { headers: { Authorization: `Bearer ${KEY}` } });
    const j = await res.json().catch(() => ({}));
    console.log(p, '->', res.status, JSON.stringify(j).slice(0, 500));
  } catch (e) {
    console.log(p, 'ERR', e.message);
  }
}
