/**
 * 临时场景：验证 Blender/glTF 模型导入后的「朝向」。
 * 同一个模型放 3 个实体：不旋转 / rotation.x=+90 / rotation.x=-90。
 * 用法：node _mk_test_scene.mjs [create|delete]
 */
const API = 'http://localhost:3001/api/v1';
const NAME = '【临时】模型朝向实测';

async function req(p, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(API + p, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    j = t;
  }
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${t.slice(0, 300)}`);
  return j;
}
const unwrap = (r) => (r && typeof r === 'object' && 'data' in r ? r.data : r);

const login = await req('/auth/login', {
  method: 'POST',
  body: { username: 'admin', password: 'Admin@123', deviceId: 'model-test' },
});
const token = unwrap(login).accessToken;

const list = unwrap(await req('/scenes?page=1&pageSize=100', { token }));
const found = (list?.dataList ?? []).find((s) => s.name === NAME);

const mode = process.argv[2] ?? 'create';

if (mode === 'delete') {
  if (!found) {
    console.log('未找到临时场景，无需删除');
  } else {
    await req(`/scenes/${found.id}`, { method: 'DELETE', token });
    console.log('已删除临时场景:', found.id);
  }
  process.exit(0);
}

const MODEL = '50000000-0000-4000-8000-000000000001'; // MODEL_3D
const URL = '/models/test-tower.gltf';
const LAT = 29.8747;

const config = {
  cesium: {
    enabled: true,
    imageryLayers: [
      {
        id: 'base-imagery',
        name: '影像底图',
        provider: 'XYZ',
        url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
        show: true,
        alpha: 1,
        brightness: 0.72,
        maximumLevel: 18,
      },
    ],
    terrain: { enabled: false },
    tilesets: [],
    initialView: {
      longitude: 121.5493,
      latitude: LAT,
      height: 380,
      heading: 0,
      pitch: -88,
      roll: 0,
    },
    scene: {
      globeShow: true,
      skyAtmosphere: false,
      fxaa: true,
      depthTestAgainstTerrain: false,
      maximumScreenSpaceError: 16,
    },
    environment: { rain: 0, snow: 0, fog: 0, enableLighting: false },
  },
  threejs: {
    enabled: true,
    renderer: {
      antialias: true,
      pixelRatioLimit: 2,
      shadowMap: true,
      toneMapping: 'ACES_FILMIC',
      exposure: 1,
    },
    environment: {
      background: '#0b1220',
      ambientIntensity: 0.9,
      directionalIntensity: 1.5,
      directionalPosition: { x: 60, y: 80, z: 60 },
    },
    postProcessing: { bloom: false, outline: true, ssao: false },
    lod: {
      enabled: true,
      levels: [
        { distance: 100, detail: 'HIGH' },
        { distance: 500, detail: 'MEDIUM' },
        { distance: 2000, detail: 'LOW' },
        { distance: 10000, detail: 'HIDDEN' },
      ],
      autoDegradeFps: 30,
      autoDegradeMemoryMb: 2048,
    },
    anchor: { longitude: 121.5493, latitude: LAT, height: 0 },
  },
  layers: [
    { id: 'layer-model', name: '精细模型', visible: true, sortOrder: 0, engine: 'THREE' },
    { id: 'layer-ui', name: '大屏面板', visible: true, sortOrder: 1, engine: 'DOM' },
  ],
  canvas: { width: 1920, height: 1080, fitMode: 'CONTAIN', background: 'transparent' },
  performance: { targetFps: 60, minFps: 30, maxMemoryMb: 2048, maxDrawCall: 3000 },
};

const components = [
  {
    componentId: MODEL,
    name: 'A x=90 y=0',
    componentConfig: { modelUrl: URL, scale: 1, castShadow: true },
    position: {
      cartographic: { longitude: 121.5485, latitude: LAT, height: 0 },
      rotation: { x: 90, y: 0, z: 0 },
    },
    layerId: 'layer-model',
    sortOrder: 0,
    visible: true,
    locked: false,
  },
  {
    componentId: MODEL,
    name: 'B x=90 y=90',
    componentConfig: { modelUrl: URL, scale: 1, castShadow: true },
    position: {
      cartographic: { longitude: 121.5501, latitude: LAT, height: 0 },
      rotation: { x: 90, y: 90, z: 0 },
    },
    layerId: 'layer-model',
    sortOrder: 1,
    visible: true,
    locked: false,
  },
];

let id = found?.id;
if (id) {
  console.log('复用临时场景:', id);
} else {
  id = unwrap(
    await req('/scenes', {
      method: 'POST',
      token,
      body: { name: NAME, description: '朝向验证用，可删', sceneType: 'MICRO', config },
    }),
  ).id;
  console.log('创建临时场景:', id);
}

const detail = unwrap(
  await req(`/scenes/${id}`, {
    method: 'PUT',
    token,
    body: {
      name: NAME,
      description: '朝向验证用，可删',
      sceneType: 'MICRO',
      config,
      layout: { version: '1.0.0', nodes: [], events: [] },
      components,
    },
  }),
);
console.log('组件数 =', (detail.components ?? []).length);
console.log('SCENE_ID=' + id);
