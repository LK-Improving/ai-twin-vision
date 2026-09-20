import type { AiSceneStrategy } from '@dt/shared-types';
import type { BuildingSemantic, BuildingSpec, SceneDsl } from '../dsl/types';
import type { GenerateInput, GenerateOutput, GeometryGenerator } from './geometry-generator';

/** 输入输出类型统一定义在 geometry-generator，这里再导出以免破坏既有引用 */
export type { GenerateInput, GenerateOutput };

/**
 * 程序化生成器（L1 默认策略，也是 L3 第三方服务未配置时的兜底）。
 * 纯 Buffer 拼装 GLB，零外部依赖（不依赖 three / Blob / FileReader），可在 Node 进程直接跑。
 * 几何坐标用 glTF Y-up（x=东, y=天, z=南），与现有 _mk_city_model.mjs 同构，
 * 运行时由 MODEL_3D.position.rotation.x=90 转为 ENU。禁用 Draco（引擎无解码器目录）。
 */
export class ProceduralGenerator implements GeometryGenerator {
  readonly strategy: AiSceneStrategy = 'procedural';

  supports(dsl?: SceneDsl): boolean {
    return !!dsl && Array.isArray(dsl.buildings);
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const { dsl } = input;
    const extent = dsl.site?.extent ?? { width: 900, depth: 900 };
    const half = Math.max(extent.width, extent.depth) / 2 + 60;

    // 材质组 0-9（白混凝土/蓝玻/青玻/深玻/发光棱线/地面/道路/水面/绿地/树）
    const solidGroups = Array.from({ length: 10 }, () => ({
      pos: [] as number[],
      nrm: [] as number[],
    }));
    const edgePos: number[] = [];

    const pushTri = (g: number, a: number[], b: number[], c: number[], n: number[]) => {
      const grp = solidGroups[g];
      for (const p of [a, b, c]) {
        grp.pos.push(...p);
        grp.nrm.push(...n);
      }
    };
    const pushQuad = (
      g: number,
      a: number[],
      b: number[],
      c: number[],
      d: number[],
      n: number[],
    ) => {
      pushTri(g, a, b, c, n);
      pushTri(g, a, c, d, n);
    };

    /** 追加盒体（cx/cz 为 glTF 网格坐标：x=东, z=南；y0 为底面高度） */
    const addBox = (o: {
      cx: number;
      cz: number;
      w: number;
      d: number;
      h: number;
      y0?: number;
      group?: number;
    }) => {
      const { cx, cz, w, d, h } = o;
      const y0 = o.y0 ?? 0;
      const group = o.group ?? 0;
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
    };

    /** ENU（x=东, y=北）→ glTF 网格（x=东, z=南） */
    const toMesh = (east: number, north: number, up = 0): [number, number, number] => [
      east,
      up,
      -north,
    ];

    /** 沿中心线生成带状路面/水面/绿带 */
    const addRibbon = (
      points: Array<{ x: number; y: number }>,
      width: number,
      group: number,
      y: number,
    ) => {
      if (points.length < 2) return;
      const hw = width / 2;
      for (let i = 0; i < points.length - 1; i += 1) {
        const m0 = toMesh(points[i].x, points[i].y);
        const m1 = toMesh(points[i + 1].x, points[i + 1].y);
        const dx = m1[0] - m0[0];
        const dz = m1[2] - m0[2];
        const len = Math.hypot(dx, dz) || 1;
        const px = (-dz / len) * hw;
        const pz = (dx / len) * hw;
        const a: number[] = [m0[0] + px, y, m0[2] + pz];
        const b: number[] = [m1[0] + px, y, m1[2] + pz];
        const c: number[] = [m1[0] - px, y, m1[2] - pz];
        const d: number[] = [m0[0] - px, y, m0[2] - pz];
        pushQuad(group, a, b, c, d, [0, 1, 0]);
      }
    };

    const facadeGroup = (material: string | undefined, idx: number): number => {
      switch (material) {
        case 'glassCurtain':
          return idx % 2 === 0 ? 1 : 2;
        case 'metal':
        case 'aluminumPanel':
          return 3;
        default:
          return 0; // concrete / stone / brick → 白混凝土
      }
    };

    // 确定性 RNG（按 id 播种，保证可复现）
    const hashSeed = (s: string): number => {
      let h = 2166136261;
      for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    };
    const makeRand = (seed: number) => {
      let s = seed || 1;
      return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };

    // 地面
    pushQuad(
      5,
      toMesh(-half, -half, -0.2),
      toMesh(half, -half, -0.2),
      toMesh(half, half, -0.2),
      toMesh(-half, half, -0.2),
      [0, 1, 0],
    );

    // 道路
    for (const r of dsl.roads ?? []) {
      addRibbon(r.path, r.width, 6, -0.15);
    }
    // 水体
    for (const w of dsl.water ?? []) {
      addRibbon(w.path, w.width, 7, -0.1);
    }
    // 绿地
    for (const g of dsl.greenery ?? []) {
      if (g.footprint) {
        const { x, y, width, depth } = g.footprint;
        const hx = width / 2;
        const hz = depth / 2;
        pushQuad(
          8,
          toMesh(x - hx, y - hz, -0.08),
          toMesh(x + hx, y - hz, -0.08),
          toMesh(x + hx, y + hz, -0.08),
          toMesh(x - hx, y + hz, -0.08),
          [0, 1, 0],
        );
        // 树木点缀
        const rand = makeRand(hashSeed(g.id));
        const treeCount = Math.floor(rand() * 6) + 3;
        for (let t = 0; t < treeCount; t += 1) {
          const tx = x + (rand() - 0.5) * width * 0.7;
          const tz = y + (rand() - 0.5) * depth * 0.7;
          const th = 5 + rand() * 5;
          const tr = 1.2 + rand() * 0.8;
          addBox({ cx: tx, cz: -tz, w: tr * 0.5, d: tr * 0.5, h: th * 0.45, y0: -0.08, group: 9 });
          const cy = th * 0.45 - 0.08;
          const top: number[] = [tx, cy + th * 0.65, -tz];
          const base = [
            [tx - tr, cy, -tz - tr],
            [tx + tr, cy, -tz - tr],
            [tx + tr, cy, -tz + tr],
            [tx - tr, cy, -tz + tr],
          ];
          base.forEach((a, i) => {
            const b = base[(i + 1) % 4];
            pushQuad(9, a, b, top, top, [0, 1, 0]);
          });
        }
      } else if (g.path) {
        addRibbon(g.path, 18, 8, -0.08);
      }
    }

    // 建筑
    const semantics: BuildingSemantic[] = [];
    (dsl.buildings ?? []).forEach((b: BuildingSpec, idx: number) => {
      const w = b.footprint.width;
      const d = b.footprint.depth;
      const h = b.floors * b.floorHeight;
      const cx = b.footprint.x;
      const cz = -b.footprint.y; // glTF z = 南
      const group = facadeGroup(b.facade?.material, idx);
      addBox({ cx, cz, w, d, h, group });
      if (h > 60) {
        addBox({ cx, cz, w: w * 0.55, d: d * 0.55, h: h * 0.3, y0: h, group });
      }
      semantics.push({
        id: b.id,
        name: b.name,
        kind: b.kind,
        bbox: {
          min: { x: cx - w / 2, y: 0, z: cz - d / 2 },
          max: { x: cx + w / 2, y: h, z: cz + d / 2 },
        },
        roofZ: h,
      });
    });

    /* ---------------- GLB 打包（与 _mk_city_model.mjs 一致） ---------------- */
    const buffers: Buffer[] = [];
    const accessors: unknown[] = [];
    const bufferViews: unknown[] = [];
    const primitives: unknown[] = [];

    solidGroups.forEach((g, gi) => {
      if (g.pos.length === 0) return;
      const posBuf = Buffer.from(new Float32Array(g.pos).buffer);
      const nrmBuf = Buffer.from(new Float32Array(g.nrm).buffer);
      const posOff = buffers.reduce((s, b) => s + b.length, 0);
      buffers.push(posBuf);
      const nrmOff = buffers.reduce((s, b) => s + b.length, 0);
      buffers.push(nrmBuf);

      const posIdx = accessors.length;
      const px = g.pos.filter((_, i) => i % 3 === 0);
      const py = g.pos.filter((_, i) => i % 3 === 1);
      const pz = g.pos.filter((_, i) => i % 3 === 2);
      const minP = [Math.min(...px), Math.min(...py), Math.min(...pz)];
      const maxP = [Math.max(...px), Math.max(...py), Math.max(...pz)];
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
      primitives.push({
        attributes: { POSITION: posIdx, NORMAL: posIdx + 1 },
        material: gi,
        mode: 4,
      });
    });

    // 棱线 primitive
    if (edgePos.length > 0) {
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
      bufferViews.push({
        buffer: 0,
        byteOffset: edgeOff,
        byteLength: edgeBuf.length,
        target: 34962,
      });
      primitives.push({ attributes: { POSITION: edgeAccIdx }, material: 4, mode: 1 });
    }

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
      asset: { version: '2.0', generator: 'dt-procedural-city-v1' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: 'AiCityModel' }],
      meshes: [{ name: 'City', primitives }],
      materials,
      accessors,
      bufferViews,
      buffers: [{ byteLength: bin.length }],
    };

    const glb = buildGlb(gltf as unknown as Record<string, unknown>, bin);

    const triangles = solidGroups.reduce((s, g) => s + g.pos.length / 9, 0) + edgePos.length / 2;

    return {
      glb,
      semantics,
      stats: {
        buildings: (dsl.buildings ?? []).length,
        triangles: Math.round(triangles),
        bytes: glb.length,
      },
    };
  }
}

/** 手工拼 JSON chunk + BIN chunk（不依赖 Blob/FileReader，Node 进程可跑） */
function buildGlb(json: Record<string, unknown>, binBuf: Buffer): Buffer {
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
  const off = 20 + jsonBytes.length + jsonPad;
  out.writeUInt32LE(binBuf.length + binPad, off);
  out.writeUInt32LE(0x004e4942, off + 4);
  binBuf.copy(out, off + 8);
  for (let i = 0; i < binPad; i += 1) out[off + 8 + binBuf.length + i] = 0;
  return out;
}
