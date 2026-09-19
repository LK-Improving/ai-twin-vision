// 真实联调脚本：登录 → 用真实 Tripo 跑 strategy:text3d → 校验结果 + 下载 glb
const BASE = 'http://localhost:3001';
const USER = { username: 'admin', password: 'Admin@123' };

async function postJSON(path, body, token) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, raw: text };
}

(async () => {
  // 1) 登录
  const login = await postJSON('/api/v1/auth/login', USER);
  if (login.status !== 201 && login.status !== 200) {
    console.log('LOGIN_FAIL', login.status, login.raw);
    process.exit(1);
  }
  const token = login.json?.data?.accessToken;
  if (!token) {
    console.log('NO_TOKEN', JSON.stringify(login.json));
    process.exit(1);
  }
  console.log('LOGIN_OK, token len =', token.length);

  // 2) 真实文生 3D 生成（会同步等待 Tripo 异步任务完成，最长约 TEXT3D_TIMEOUT_MS）
  const t0 = Date.now();
  const gen = await postJSON(
    '/api/v1/ai/scene/generate',
    {
      prompt: '大型智慧产业园，含商业综合体、办公楼、学校和地铁站，夜晚灯光效果',
      name: 'Tripo真实联调园区',
      sceneType: 'HYBRID',
      quality: 'L1',
      strategy: 'text3d',
      autoPublish: false,
    },
    token,
  );
  const dt = Date.now() - t0;
  console.log('GEN_STATUS', gen.status, 'elapsedMs', dt);
  if (gen.status !== 201 && gen.status !== 200) {
    console.log('GEN_FAIL', gen.raw);
    process.exit(1);
  }
  const d = gen.json?.data ?? gen.json;
  console.log('SCENE_ID', d?.sceneId);
  console.log('WARNINGS', JSON.stringify(d?.warnings ?? []));
  console.log('STATS', JSON.stringify(d?.stats));
  console.log('MODEL_URL', d?.modelUrl);

  if (d?.warnings && d.warnings.length > 0) {
    console.log('NOTE: 含降级提示，说明未真正调用 Tripo');
  } else {
    console.log('NOTE: warnings 为空，已真实调用 Tripo');
  }

  // 3) 下载 glb 校验 magic
  if (d?.modelUrl) {
    const glb = await fetch(BASE + d.modelUrl);
    const buf = Buffer.from(await glb.arrayBuffer());
    const magic = buf.slice(0, 4).toString('ascii');
    console.log('GLB_HEAD', magic === 'glTF' ? 'OK(glTF)' : 'BAD:' + magic, 'bytes', buf.length);
  }
})().catch((e) => {
  console.log('SCRIPT_ERROR', e?.message ?? e);
  process.exit(1);
});
