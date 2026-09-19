/**
 * 生成一个用于「朝向实测」的 glTF 2.0 长方体（内嵌 base64 buffer，无外部依赖）。
 * 尺寸：宽 20(X) × 高 100(Y) × 深 20(Z) —— 长轴沿局部 +Y（glTF 惯例：Y 轴朝上）。
 * 输出：apps/frontend/builder/public/models/test-tower.gltf
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const hx = 10;
const hz = 30; // 进深 60，与宽度 20 不同，便于看出偏航
/** 楼层沿局部 +Y 从 0 长到 100（底座在原点，Blender 建模的常见约定） */
const y0 = 0;
const y1 = 100;
const hy = (y1 - y0) / 2;
const yc = (y0 + y1) / 2;

/** 六个面：法线 + 4 个角点（外侧看逆时针） */
const faces = [
  {
    n: [1, 0, 0],
    v: [
      [hx, y0, hz],
      [hx, y0, -hz],
      [hx, y1, -hz],
      [hx, y1, hz],
    ],
  },
  {
    n: [-1, 0, 0],
    v: [
      [-hx, y0, -hz],
      [-hx, y0, hz],
      [-hx, y1, hz],
      [-hx, y1, -hz],
    ],
  },
  {
    n: [0, 1, 0],
    v: [
      [-hx, y1, hz],
      [hx, y1, hz],
      [hx, y1, -hz],
      [-hx, y1, -hz],
    ],
  },
  {
    n: [0, -1, 0],
    v: [
      [-hx, y0, -hz],
      [hx, y0, -hz],
      [hx, y0, hz],
      [-hx, y0, hz],
    ],
  },
  {
    n: [0, 0, 1],
    v: [
      [-hx, y0, hz],
      [hx, y0, hz],
      [hx, y1, hz],
      [-hx, y1, hz],
    ],
  },
  {
    n: [0, 0, -1],
    v: [
      [hx, y0, -hz],
      [-hx, y0, -hz],
      [-hx, y1, -hz],
      [hx, y1, -hz],
    ],
  },
];

const positions = [];
const normals = [];
const indices = [];
faces.forEach((f, fi) => {
  f.v.forEach((p) => {
    positions.push(...p);
    normals.push(...f.n);
  });
  const b = fi * 4;
  indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
});

const posArr = new Float32Array(positions);
const nrmArr = new Float32Array(normals);
const idxArr = new Uint16Array(indices);

const posBuf = Buffer.from(posArr.buffer);
const nrmBuf = Buffer.from(nrmArr.buffer);
const idxBuf = Buffer.from(idxArr.buffer);

const buffer = Buffer.concat([posBuf, nrmBuf, idxBuf]);

const min = [-hx, y0, -hz];
const max = [hx, y1, hz];

const gltf = {
  asset: { version: '2.0', generator: 'dt-orientation-test' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'Tower' }],
  meshes: [
    {
      name: 'Tower',
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }],
    },
  ],
  materials: [
    {
      name: 'RedMat',
      pbrMetallicRoughness: {
        baseColorFactor: [0.92, 0.18, 0.18, 1],
        metallicFactor: 0,
        roughnessFactor: 0.75,
      },
      doubleSided: false,
    },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
    { buffer: 0, byteOffset: posBuf.length, byteLength: nrmBuf.length, target: 34962 },
    {
      buffer: 0,
      byteOffset: posBuf.length + nrmBuf.length,
      byteLength: idxBuf.length,
      target: 34963,
    },
  ],
  buffers: [
    {
      byteLength: buffer.length,
      uri: `data:application/octet-stream;base64,${buffer.toString('base64')}`,
    },
  ],
};

const out = path.resolve('apps/frontend/builder/public/models/test-tower.gltf');
fs.writeFileSync(out, JSON.stringify(gltf));
console.log('written:', out, fs.statSync(out).size, 'bytes');
console.log('bbox: 20(X) x 100(Y) x 20(Z)  —— 长轴沿局部 +Y');
