import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  chromium,
} = require('C:/Users/LK/.workbuddy/binaries/node/versions/22.22.2-2/node_modules/@playwright/cli/node_modules/playwright');

const TOKEN = process.env.SMOKE_TOKEN;
const SCENE_ID = process.env.SMOKE_SCENE || '50698e50-749f-404c-af68-96d7f2949a47';
const URL = `http://127.0.0.1:5173/preview/${SCENE_ID}`;

const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
  ],
});
const page = await browser.newPage();
await page.addInitScript((tok) => {
  try {
    window.localStorage.setItem('dt_access_token', tok);
    window.localStorage.setItem('dt_refresh_token', tok);
    window.localStorage.setItem(
      'dt_profile',
      JSON.stringify({ id: '1', username: 'admin', roles: ['SUPER_ADMIN'] }),
    );
  } catch {
    // 隐私模式下 localStorage 可能禁用：忽略注入失败，不阻断冒烟流程
  }
}, TOKEN);

page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(e.message));

await page
  .goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
  .catch((e) => pageErrors.push('GOTO:' + e.message));
// give cesium/three time to render
await page.waitForTimeout(8000);

const summary = await page.evaluate(() => {
  const canvases = Array.from(document.querySelectorAll('canvas'));
  const bodyText = document.body ? document.body.innerText : '';
  const hasModelCanvas = canvases.length > 0;
  // panel-ish text presence
  const metricHits = [
    '指标',
    'METRIC',
    'STAT',
    '在线',
    '运行',
    '能耗',
    '园',
    '综合',
    '办公',
    '地铁',
    '学校',
  ];
  const textHits = metricHits.filter((k) => bodyText.includes(k));
  return {
    canvasCount: canvases.length,
    canvasSizes: canvases.map((c) => `${c.width}x${c.height}`),
    bodyLen: bodyText.length,
    textHits,
    title: document.title,
  };
});

await page
  .screenshot({
    path: 'D:/Study/重点项目/AI数字孪生可视化大屏/_preview_smoke.png',
    fullPage: false,
  })
  .catch(() => {});
await browser.close();

console.log('=== PREVIEW SMOKE RESULT ===');
console.log('url=', URL);
console.log('canvasCount=', summary.canvasCount, 'sizes=', JSON.stringify(summary.canvasSizes));
console.log('bodyLen=', summary.bodyLen, 'title=', summary.title);
console.log('textHits=', JSON.stringify(summary.textHits));
console.log('consoleErrors=', JSON.stringify(consoleErrors.slice(0, 20)));
console.log('pageErrors=', JSON.stringify(pageErrors.slice(0, 20)));
