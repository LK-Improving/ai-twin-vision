const BASE = 'http://localhost:3001/api/v1';

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

const ok = await waitHealth();
console.log('health=', ok);
if (!ok) process.exit(1);

const loginRes = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
});
const login = await loginRes.json();
const token = login?.data?.accessToken;
console.log('login code=', login.code, 'tokenLen=', token ? token.length : 0);
if (!token) process.exit(1);

const CASES = [
  {
    tag: '普通园区(无「大型」)',
    name: 'AI 演示大屏闭环-普通',
    prompt: '生成一个智慧产业园区，包含商业综合体、研发办公楼、学校和地铁站，夜晚灯光效果',
  },
  {
    tag: '大型园区',
    name: 'AI 演示大屏闭环-大型',
    prompt: '生成一个大型智慧产业园区，包含商业综合体、研发办公楼、学校和地铁站，夜晚灯光效果',
  },
];

for (const c of CASES) {
  const genRes = await fetch(`${BASE}/ai/scene/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ prompt: c.prompt, name: c.name, quality: 'L1', autoPublish: true }),
  });
  const gen = await genRes.json();
  const d = gen.data || {};
  console.log(`\n=== ${c.tag} ===`);
  console.log('  http=', genRes.status, 'code=', gen.code, 'msg=', gen.message);
  console.log('  sceneId     =', d.sceneId);
  console.log('  publishToken=', d.publishToken);
  console.log('  screenUrl   =', d.screenUrl);
  console.log('  stats       =', JSON.stringify(d.stats));
  console.log(
    '  warnings    =',
    d.warnings ? d.warnings.length : 0,
    d.warnings && d.warnings.length ? JSON.stringify(d.warnings.slice(0, 3)) : '',
  );

  if (!d.publishToken) {
    console.log('  !! 未拿到 publishToken');
    continue;
  }
  const pubRes = await fetch(`${BASE}/public/screens/${d.publishToken}`);
  const pub = await pubRes.json();
  const pd = pub.data || {};
  const comps = pd.components || [];
  console.log('  公开快照 http=', pubRes.status, 'code=', pub.code, 'name=', pd.name);
  console.log('  components  =', comps.length, JSON.stringify(comps.map((x) => x.componentType)));
  console.log('  layoutNodes =', ((pd.layout && pd.layout.nodes) || []).length);
  console.log('  PUBLIC_OK   =', pubRes.status === 200 && comps.length > 0);
}
