/** 局部放大截图：node _zoom.mjs <sceneId> <x> <y> <w> <h> <out.png> */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  chromium,
} = require('C:/Users/LK/.workbuddy/binaries/node/versions/22.22.2-2/node_modules/@playwright/cli/node_modules/playwright');
const SCENE_ID = process.argv[2];
const [x, y, w, h] = process.argv.slice(3, 7).map(Number);
const OUT = process.argv[7] ?? '_zoom.png';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
  ],
});
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1.5,
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(async () => {
  const r = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123', deviceId: 'zoom' }),
  });
  const j = await r.json();
  const d = j.data ?? j;
  const p = await fetch('/api/v1/auth/profile', {
    headers: { Authorization: 'Bearer ' + d.accessToken },
  });
  const pj = await p.json();
  localStorage.setItem('dt_device_id', 'zoom');
  localStorage.setItem('dt_access_token', d.accessToken);
  localStorage.setItem('dt_refresh_token', d.refreshToken);
  localStorage.setItem('dt_expires_in', String(d.expiresIn));
  localStorage.setItem('dt_token_issued_at', String(Date.now()));
  localStorage.setItem('dt_profile', JSON.stringify(pj.data ?? pj));
});
await page.goto(`http://localhost:5173/preview/${SCENE_ID}`, {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(15000);
await page.screenshot({ path: OUT, clip: { x, y, width: w, height: h } });
console.log('OK ->', OUT);
await browser.close();
