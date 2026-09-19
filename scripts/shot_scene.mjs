/**
 * 无头截图验证新场景预览页
 * 用法: node _shot_scene.mjs <sceneId>
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  chromium,
} = require('C:/Users/LK/.workbuddy/binaries/node/versions/22.22.2-2/node_modules/@playwright/cli/node_modules/playwright');

const SCENE_ID = process.argv[2] || '0e02c8c5-f30a-4fda-bd48-b940c601dcab';
const BASE = 'http://localhost:5173';
const OUT = process.argv[3] || '_verify_scene.png';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

const errs = [];
page.on('console', (m) => {
  if (m.type() === 'error') errs.push('[console.error] ' + m.text().slice(0, 300));
});
page.on('pageerror', (e) => errs.push('[pageerror] ' + String(e).slice(0, 300)));

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });

const auth = await page.evaluate(async () => {
  const r = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123', deviceId: 'shot' }),
  });
  const j = await r.json();
  const d = j && j.data ? j.data : j;
  if (!d || !d.accessToken) return { ok: false, raw: JSON.stringify(j).slice(0, 300) };
  const p = await fetch('/api/v1/auth/profile', {
    headers: { Authorization: 'Bearer ' + d.accessToken },
  });
  const pj = await p.json();
  const profile = pj && pj.data ? pj.data : pj;
  localStorage.setItem('dt_device_id', 'shot');
  localStorage.setItem('dt_access_token', d.accessToken);
  localStorage.setItem('dt_refresh_token', d.refreshToken);
  localStorage.setItem('dt_expires_in', String(d.expiresIn));
  localStorage.setItem('dt_token_issued_at', String(Date.now()));
  localStorage.setItem('dt_profile', JSON.stringify(profile));
  return { ok: true, perms: Array.isArray(profile.permissions) ? profile.permissions.length : -1 };
});
console.log('AUTH=' + JSON.stringify(auth));

await page.goto(`${BASE}/preview/${SCENE_ID}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(14000);

const snap = await page.evaluate(() => {
  const q = (s) => document.querySelectorAll(s).length;
  const stats = document.querySelector('.stats-panel')?.innerText?.replace(/\s+/g, ' ') ?? '';
  const slots = [...document.querySelectorAll('.node-slot')].map((el) => {
    const id = el.getAttribute('data-node-id');
    const inner = el.querySelector('.dt-widget');
    return { id, html: (inner?.className || '').slice(0, 40) };
  });
  const canvas = document.querySelector('.preview-canvas canvas');
  return {
    hasCanvasEl: !!canvas,
    canvasSize: canvas ? `${canvas.width}x${canvas.height}` : null,
    nodeSlots: slots.length,
    stats,
    bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
    errOverlay: document.querySelector('#__app_error_overlay__')?.innerText?.slice(0, 300) ?? null,
  };
});
console.log('SNAP=' + JSON.stringify(snap, null, 1));

await page.screenshot({ path: OUT, fullPage: false });
console.log('SCREENSHOT=' + OUT);
console.log('ERRORS=' + JSON.stringify(errs.slice(0, 12), null, 1));

await browser.close();
