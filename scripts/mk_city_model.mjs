/**
 * 程序化生成「科技城市」GLB —— 不依赖 Blender。
 *
 * 相对上一版升级：
 *   - 道路网、河道、绿地、广场
 *   - 建筑材质差异化（白混凝土 / 蓝玻 / 青玻 / 深玻）
 *   - CBD 地标塔楼 + 多层退台 / 裙楼
 *   - 楼体棱线保持青色发光，配合 bloom
 *   - 少量低面树木点缀绿地
 *
 * 产出：
 *   1. apps/frontend/builder/public/models/city-white.glb
 *   2. city-pois.json —— 楼高点经纬度
 *
 * 模型空间：Y-up（glTF 约定），场景里 rotation.x=90 转成 ENU。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/* ------------------------- 可调参数 ------------------------- */
const CELL = 120; // 街区间距
const ROAD = 24; // 道路宽
const RANGE = 7; // ±N 个街区
const SEED = 20260912;

let seed = SEED;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

/* ------------------------- 城市布局 ------------------------- */
const buildings = [];
const parks = [];
const half = CELL / 2 - ROAD / 2;
const ext = (RANGE + 0.6) * CELL;

// 河道与绿地控制带：斜穿城市
function inRiverBand(x, z) {
  const d = Math.abs(x + z * 1.45 + 12);
  return d < 34;
}
function inParkBand(x, z) {
  const d = Math.abs(x + z * 1.45 + 12);
  return d < 58 && d >= 34;
}

// 中心广场
function inCentralPlaza(x, z) {
  return Math.hypot(x, z) < 70;
}

// 绿地多边形（简单矩形带沿河道两侧）
for (let gx = -RANGE; gx <= RANGE; gx += 1) {
  for (let gz = -RANGE; gz <= RANGE; gz += 1) {
    const cx = gx * CELL;
    const cz = gz * CELL;
    if (inCentralPlaza(cx, cz)) {
      parks.push({ cx, cz, w: CELL - ROAD, d: CELL - ROAD });
      continue;
    }
    // 河道两侧建绿地
    if (inParkBand(cx, cz)) {
      parks.push({ cx, cz, w: CELL - ROAD, d: CELL - ROAD });
    }
  }
}

for (let gx = -RANGE; gx <= RANGE; gx += 1) {
  for (let gz = -RANGE; gz <= RANGE; gz += 1) {
    const cx = gx * CELL;
    const cz = gz * CELL;
    const dist = Math.hypot(cx, cz);

    // 河道、绿地、中心广场不建房
    if (inRiverBand(cx, cz) || inParkBand(cx, cz) || inCentralPlaza(cx, cz)) continue;

    // 高度：中心 CBD 高，外围衰减
    const baseH = clamp(210 - dist * 0.65, 22, 210);

    if (dist < 85) {
      // CBD 核心：地标塔楼 + 裙楼
      const h = clamp(baseH * (1.05 + rand() * 0.45), 90, 320);
      const w = half * (1.1 + rand() * 0.5);
      const d = half * (1.1 + rand() * 0.5);
      const type = rand() < 0.7 ? 'glass-blue' : 'glass-teal';
      buildings.push({ cx, cz, w, d, h, type, tiered: true, landmark: true });
      // 裙楼
      if (rand() < 0.6) {
        buildings.push({
          cx: cx + (rand() - 0.5) * 40,
          cz: cz + (rand() - 0.5) * 40,
          w: w * (1.2 + rand() * 0.5),
          d: d * (1.2 + rand() * 0.5),
          h: 28 + rand() * 22,
          type: 'white',
          y0: 0,
        });
      }
    } else {
      // 外围：每街区 2~4 栋
      const n = rand() < 0.4 ? 2 : rand() < 0.8 ? 3 : 4;
      const sub = half * 0.55;
      const spots =
        n === 2
          ? [
              [-sub, -sub],
              [sub, sub],
            ]
          : n === 3
            ? [
                [-sub, -sub],
                [sub, -sub],
                [0, sub],
              ]
            : [
                [-sub, -sub],
                [sub, -sub],
                [-sub, sub],
                [sub, sub],
              ];
      spots.forEach(([sx, sz]) => {
        const h = baseH * (0.55 + rand() * 0.85);
        const w = half * (0.65 + rand() * 0.35);
        const d = half * (0.65 + rand() * 0.35);
        const r = rand();
        const type =
          r < 0.4 ? 'white' : r < 0.7 ? 'glass-blue' : r < 0.9 ? 'glass-teal' : 'dark-glass';
        buildings.push({
          cx: cx + sx,
          cz: cz + sz,
          w,
          d,
          h,
          type,
          tiered: rand() < 0.25 && h > 55,
        });
      });
    }
  }
}

/* ------------------------- 几何拼装 ------------------------- */
// 材质索引：0 白混凝土、1 蓝玻、2 青玻、3 深玻、4 发光棱线、5 地面、6 道路、7 水面、8 绿地、9 树木
const solidGroups = Array.from({ length: 10 }, () => ({ pos: [], nrm: [] }));
const edgePos = [];

function pushTri(groupIdx, a, b, c, n) {
  const g = solidGroups[groupIdx];
  for (const p of [a, b, c]) {
    g.pos.push(...p);
    g.nrm.push(...n);
  }
}
function pushQuad(groupIdx, a, b, c, d, n) {
  pushTri(groupIdx, a, b, c, n);
  pushTri(groupIdx, a, c, d, n);
}

/** 追加一个盒体，指定材质组 */
function addBox({ cx, cz, w, d, h, y0 = 0, group = 0 }) {
  const hx = w / 2;
  const hz = d / 2;
  const yA = y0;
  const yB = y0 + h;

  const faces = [
    {
      n: [1, 0, 0],
      v: [
        [cx + hx, yA, cz + hz],
        [cx + hx, yA, cz - hz],
        [cx + hx, yB, cz - hz],
        [cx + hx, yB, cz + hz],
      ],
    },
    {
      n: [-1, 0, 0],
      v: [
        [cx - hx, yA, cz - hz],
        [cx - hx, yA, cz + hz],
        [cx - hx, yB, cz + hz],
        [cx - hx, yB, cz - hz],
      ],
    },
    {
      n: [0, 1, 0],
      v: [
        [cx - hx, yB, cz + hz],
        [cx + hx, yB, cz + hz],
        [cx + hx, yB, cz - hz],
        [cx - hx, yB, cz - hz],
      ],
    },
    {
      n: [0, -1, 0],
      v: [
        [cx - hx, yA, cz - hz],
        [cx + hx, yA, cz - hz],
        [cx + hx, yA, cz + hz],
        [cx - hx, yA, cz + hz],
      ],
    },
    {
      n: [0, 0, 1],
      v: [
        [cx - hx, yA, cz + hz],
        [cx + hx, yA, cz + hz],
        [cx + hx, yB, cz + hz],
        [cx - hx, yB, cz + hz],
      ],
    },
    {
      n: [0, 0, -1],
      v: [
        [cx + hx, yA, cz - hz],
        [cx - hx, yA, cz - hz],
        [cx - hx, yB, cz - hz],
        [cx + hx, yB, cz - hz],
      ],
    },
  ];
  faces.forEach((f) => {
    const [a, b, c, dd] = f.v;
    pushQuad(group, a, b, c, dd, f.n);
  });

  // 发光棱线
  const corners = [
    [cx - hx, yA, cz - hz],
    [cx + hx, yA, cz - hz],
    [cx + hx, yA, cz + hz],
    [cx - hx, yA, cz + hz],
    [cx - hx, yB, cz - hz],
    [cx + hx, yB, cz - hz],
    [cx + hx, yB, cz + hz],
    [cx - hx, yB, cz + hz],
  ];
  const lines = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  lines.forEach(([i, j]) => edgePos.push(...corners[i], ...corners[j]));
}

const groupMap = { white: 0, 'glass-blue': 1, 'glass-teal': 2, 'dark-glass': 3 };

// 地面
pushQuad(5, [-ext, -0.2, -ext], [ext, -0.2, -ext], [ext, -0.2, ext], [-ext, -0.2, ext], [0, 1, 0]);

// 道路网：道路面略低于地面
for (let i = -RANGE; i <= RANGE; i += 1) {
  const x = i * CELL;
  pushQuad(
    6,
    [x - ROAD / 2, -0.15, -ext],
    [x + ROAD / 2, -0.15, -ext],
    [x + ROAD / 2, -0.15, ext],
    [x - ROAD / 2, -0.15, ext],
    [0, 1, 0],
  );
  const z = i * CELL;
  pushQuad(
    6,
    [-ext, -0.15, z - ROAD / 2],
    [ext, -0.15, z - ROAD / 2],
    [ext, -0.15, z + ROAD / 2],
    [-ext, -0.15, z + ROAD / 2],
    [0, 1, 0],
  );
}

// 河道水面：沿 x + 1.45z + 12 = 0 的带状多边形，用长条近似
const riverLen = ext * 2.5;
const riverSegs = 40;
for (let i = 0; i < riverSegs; i += 1) {
  const t0 = (i / riverSegs) * 2 - 1;
  const t1 = ((i + 1) / riverSegs) * 2 - 1;
  // 参数：z = t * riverLen
  const z0 = t0 * riverLen;
  const z1 = t1 * riverLen;
  const x0 = -1.45 * z0 - 12;
  const x1 = -1.45 * z1 - 12;
  const w = 32; // 河宽
  const nx = 1.45 / Math.hypot(1, 1.45);
  const nz = -1 / Math.hypot(1, 1.45);
  pushQuad(
    7,
    [x0 + (nx * w) / 2, -0.1, z0 + (nz * w) / 2],
    [x1 + (nx * w) / 2, -0.1, z1 + (nz * w) / 2],
    [x1 - (nx * w) / 2, -0.1, z1 - (nz * w) / 2],
    [x0 - (nx * w) / 2, -0.1, z0 - (nz * w) / 2],
    [0, 1, 0],
  );
}

// 绿地
parks.forEach((p) => {
  const hx = p.w / 2;
  const hz = p.d / 2;
  pushQuad(
    8,
    [p.cx - hx, -0.08, p.cz - hz],
    [p.cx + hx, -0.08, p.cz - hz],
    [p.cx + hx, -0.08, p.cz + hz],
    [p.cx - hx, -0.08, p.cz + hz],
    [0, 1, 0],
  );
  // 简单树木：随机点缀
  const treeCount = Math.floor(rand() * 5) + 2;
  for (let t = 0; t < treeCount; t += 1) {
    const tx = p.cx + (rand() - 0.5) * p.w * 0.7;
    const tz = p.cz + (rand() - 0.5) * p.d * 0.7;
    const th = 5 + rand() * 5;
    const tr = 1.2 + rand() * 0.8;
    // 树干
    addBox({ cx: tx, cz: tz, w: tr * 0.5, d: tr * 0.5, h: th * 0.45, y0: -0.08, group: 9 });
    // 树冠（圆锥近似：八面锥）
    const cy = th * 0.45 - 0.08;
    const top = [tx, cy + th * 0.65, tz];
    const base = [
      [tx - tr, cy, tz - tr],
      [tx + tr, cy, tz - tr],
      [tx + tr, cy, tz + tr],
      [tx - tr, cy, tz + tr],
    ];
    base.forEach((a, i) => {
      const b = base[(i + 1) % 4];
      pushQuad(9, a, b, top, top, [0, 1, 0]);
    });
  }
});

// 建筑生成
buildings.forEach((b) => {
  const g = groupMap[b.type] ?? 0;
  const boxes = [{ cx: b.cx, cz: b.cz, w: b.w, d: b.d, h: b.h, y0: 0 }];
  if (b.tiered && b.h > 60) {
    boxes.push({ cx: b.cx, cz: b.cz, w: b.w * 0.55, d: b.d * 0.55, h: b.h * 0.3, y0: b.h });
  }
  boxes.forEach((box) => addBox({ ...box, group: g }));
});

/* ------------------------- GLB 打包 ------------------------- */
const buffers = [];
const accessors = [];
const bufferViews = [];
const primitives = [];

solidGroups.forEach((g, gi) => {
  if (g.pos.length === 0) return;
  const posBuf = Buffer.from(new Float32Array(g.pos).buffer);
  const nrmBuf = Buffer.from(new Float32Array(g.nrm).buffer);
  const posOff = buffers.reduce((s, b) => s + b.length, 0);
  buffers.push(posBuf);
  const nrmOff = buffers.reduce((s, b) => s + b.length, 0);
  buffers.push(nrmBuf);

  const posIdx = accessors.length;
  const minP = [
    Math.min(...g.pos.filter((_, i) => i % 3 === 0)),
    Math.min(...g.pos.filter((_, i) => i % 3 === 1)),
    Math.min(...g.pos.filter((_, i) => i % 3 === 2)),
  ];
  const maxP = [
    Math.max(...g.pos.filter((_, i) => i % 3 === 0)),
    Math.max(...g.pos.filter((_, i) => i % 3 === 1)),
    Math.max(...g.pos.filter((_, i) => i % 3 === 2)),
  ];
  accessors.push({
    bufferView: posIdx,
    componentType: 5126,
    count: g.pos.length / 3,
    type: 'VEC3',
    min: minP,
    max: maxP,
  });
  accessors.push({
    bufferView: posIdx + 1,
    componentType: 5126,
    count: g.nrm.length / 3,
    type: 'VEC3',
  });
  bufferViews.push({ buffer: 0, byteOffset: posOff, byteLength: posBuf.length, target: 34962 });
  bufferViews.push({ buffer: 0, byteOffset: nrmOff, byteLength: nrmBuf.length, target: 34962 });
  primitives.push({ attributes: { POSITION: posIdx, NORMAL: posIdx + 1 }, material: gi, mode: 4 });
});

// 棱线 primitive
const edgeBuf = Buffer.from(new Float32Array(edgePos).buffer);
const edgeOff = buffers.reduce((s, b) => s + b.length, 0);
buffers.push(edgeBuf);
const edgeAccIdx = accessors.length;
accessors.push({
  bufferView: bufferViews.length,
  componentType: 5126,
  count: edgePos.length / 3,
  type: 'VEC3',
});
bufferViews.push({ buffer: 0, byteOffset: edgeOff, byteLength: edgeBuf.length, target: 34962 });
primitives.push({ attributes: { POSITION: edgeAccIdx }, material: 4, mode: 1 });

const bin = Buffer.concat(buffers);

const materials = [
  {
    name: 'WhiteConcrete',
    pbrMetallicRoughness: {
      baseColorFactor: [0.84, 0.88, 0.92, 1],
      metallicFactor: 0.08,
      roughnessFactor: 0.78,
    },
    doubleSided: false,
  },
  {
    name: 'GlassBlue',
    pbrMetallicRoughness: {
      baseColorFactor: [0.34, 0.56, 0.74, 0.78],
      metallicFactor: 0.55,
      roughnessFactor: 0.14,
    },
    alphaMode: 'BLEND',
    doubleSided: false,
  },
  {
    name: 'GlassTeal',
    pbrMetallicRoughness: {
      baseColorFactor: [0.22, 0.66, 0.68, 0.78],
      metallicFactor: 0.5,
      roughnessFactor: 0.16,
    },
    alphaMode: 'BLEND',
    doubleSided: false,
  },
  {
    name: 'DarkGlass',
    pbrMetallicRoughness: {
      baseColorFactor: [0.2, 0.26, 0.34, 0.8],
      metallicFactor: 0.4,
      roughnessFactor: 0.22,
    },
    alphaMode: 'BLEND',
    doubleSided: false,
  },
  {
    name: 'GlowEdge',
    pbrMetallicRoughness: {
      baseColorFactor: [0.75, 1, 1, 1],
      metallicFactor: 0,
      roughnessFactor: 1,
    },
    emissiveFactor: [0.75, 1, 1],
    extensions: { KHR_materials_emissive_strength: { emissiveStrength: 3.5 } },
  },
  {
    name: 'Ground',
    pbrMetallicRoughness: {
      baseColorFactor: [0.06, 0.1, 0.15, 1],
      metallicFactor: 0,
      roughnessFactor: 0.95,
    },
    doubleSided: false,
  },
  {
    name: 'Road',
    pbrMetallicRoughness: {
      baseColorFactor: [0.1, 0.13, 0.16, 1],
      metallicFactor: 0,
      roughnessFactor: 0.9,
    },
    doubleSided: false,
  },
  {
    name: 'Water',
    pbrMetallicRoughness: {
      baseColorFactor: [0.08, 0.32, 0.5, 0.72],
      metallicFactor: 0.2,
      roughnessFactor: 0.08,
    },
    alphaMode: 'BLEND',
    doubleSided: false,
  },
  {
    name: 'Park',
    pbrMetallicRoughness: {
      baseColorFactor: [0.08, 0.28, 0.18, 1],
      metallicFactor: 0,
      roughnessFactor: 0.9,
    },
    doubleSided: false,
  },
  {
    name: 'Tree',
    pbrMetallicRoughness: {
      baseColorFactor: [0.1, 0.42, 0.22, 1],
      metallicFactor: 0,
      roughnessFactor: 0.85,
    },
    doubleSided: false,
  },
];

const gltf = {
  asset: { version: '2.0', generator: 'dt-procedural-city-v2' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'CityTechModel' }],
  meshes: [{ name: 'City', primitives }],
  materials,
  accessors,
  bufferViews,
  buffers: [{ byteLength: bin.length }],
};

function buildGlb(json, binBuf) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binPad = (4 - (binBuf.length % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + binBuf.length + binPad;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBytes.length + jsonPad, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(out, 20);
  for (let i = 0; i < jsonPad; i += 1) out[20 + jsonBytes.length + i] = 0x20;
  let off = 20 + jsonBytes.length + jsonPad;
  out.writeUInt32LE(binBuf.length + binPad, off);
  out.writeUInt32LE(0x004e4942, off + 4);
  binBuf.copy(out, off + 8);
  for (let i = 0; i < binPad; i += 1) out[off + 8 + binBuf.length + i] = 0;
  return out;
}

const outFile = path.resolve('apps/frontend/builder/public/models/city-white.glb');
fs.writeFileSync(outFile, buildGlb(gltf, bin));

/* ------------------------- 导出楼顶 POI 坐标 ------------------------- */
const CENTER = { longitude: 121.5497, latitude: 29.8747 };
const NAMES = [
  '智能制造企业',
  '数字经济企业',
  '生命健康企业',
  '新材料企业',
  '科创中心',
  '总部经济企业',
  '现代服务企业',
  '跨境电商企业',
  '工业设计中心',
  '检测认证企业',
  '供应链企业',
  '新能源企业',
];
const top = [...buildings].sort((a, b) => b.h + (b.y0 ?? 0) - (a.h + (a.y0 ?? 0))).slice(0, 12);
const d2r = Math.PI / 180;
const pois = top.map((b, i) => {
  const h = b.h + (b.y0 ?? 0);
  const e = b.cx;
  const n = -b.cz;
  return {
    name: NAMES[i],
    // 模型自身局部坐标（glTF：x=东、y=天、z=南），供 POI 跟随模型变换用
    local: { x: b.cx, y: h + 18, z: b.cz },
    longitude: CENTER.longitude + e / (111320 * Math.cos(CENTER.latitude * d2r)),
    latitude: CENTER.latitude + n / 110574,
    height: h + 18,
  };
});
fs.writeFileSync(new URL('city-pois.json', import.meta.url), JSON.stringify(pois, null, 1));

console.log('GLB      :', outFile, (fs.statSync(outFile).size / 1024).toFixed(1) + ' KB');
console.log('楼块数量 :', buildings.length);
console.log(
  '三角面数 :',
  (solidGroups.reduce((s, g) => s + g.pos.length / 9, 0) / 1000).toFixed(1) + 'k',
);
console.log('POI 导出 :', pois.length, '个楼顶坐标 → scripts/city-pois.json');
