import type { Cartographic, Transform } from '@dt/shared-types';
import type { BuildingSemantic, SceneDsl } from './types';

/** 种子库固定组件 UUID（与 02_seed.sql 保持一致） */
export const MODEL_3D_UUID = '50000000-0000-4000-8000-000000000001';
export const POI_UUID = '50000000-0000-4000-8000-000000000003';

export interface AiComponentInput {
  modelUrl: string;
  anchor: Cartographic;
  /** 生成器返回的建筑语义（用于核对，本函数直接用 DSL 计算更可靠） */
  semantics?: BuildingSemantic[];
}

/** 生成器消费的组件实例（与场景更新接口的 components 字段结构一致） */
export interface AiComponent {
  componentId: string;
  name?: string;
  componentConfig: Record<string, unknown>;
  position: Transform;
  layerId: string | null;
  sortOrder: number;
  visible?: boolean;
  locked?: boolean;
}

/**
 * 生成发光定位针图标的 data URI（不依赖 Cesium 文字图集，软件渲染下也稳定可见）。
 * 与 _build_scene.mjs 同款实现。
 */
function poiIcon(color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80">` +
    `<circle cx="32" cy="32" r="26" fill="${color}" opacity="0.16"/>` +
    `<path d="M32 6c-9 0-16 7-16 16 0 12 16 28 16 28s16-16 16-28c0-9-7-16-16-16z" fill="${color}" stroke="#ffffff" stroke-width="2.5"/>` +
    `<circle cx="32" cy="22" r="6" fill="#ffffff"/>` +
    `</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

/**
 * DSL → 三维组件实例。
 * 产出单个合并 MODEL_3D（白模城市 glb）+ 每栋楼顶一个 POI 标注。
 * POI 同时写入「绝对经纬度」与「parentId+localOffset」：绝对坐标保证落点正确，
 * parentId/localOffset 与现有演示场景同构（运行时若匹配到模型实例则跟随模型）。
 */
export function dslToComponents(dsl: SceneDsl, input: AiComponentInput): AiComponent[] {
  const components: AiComponent[] = [];
  const anchor = input.anchor;

  // 1) 合并白模城市
  components.push({
    componentId: MODEL_3D_UUID,
    name: `${dsl.meta.title} · 三维模型`,
    componentConfig: { modelUrl: input.modelUrl, scale: 1, castShadow: true },
    // 模型 Y-up → 场景 ENU（Z 朝上）必须 rotation.x=90；底面在 y=0 立于地表
    position: {
      cartographic: anchor,
      rotation: { x: 90, y: 0, z: 0 },
    },
    layerId: 'layer-model',
    sortOrder: 0,
    visible: true,
    locked: false,
  });

  const d2r = Math.PI / 180;
  const cosLat = Math.cos(anchor.latitude * d2r);

  const buildingMap = new Map(dsl.buildings.map((b) => [b.id, b]));

  // 2) 每栋楼顶 POI
  dsl.pois.forEach((poi, i) => {
    let east = 0;
    let north = 0;
    let roof = 0;
    if (poi.buildingId && poi.buildingId !== 'site') {
      const b = buildingMap.get(poi.buildingId);
      if (b) {
        east = b.footprint.x;
        north = b.footprint.y;
        roof = b.floors * b.floorHeight;
      }
    }
    const off = poi.offset ?? {};
    east += off.x ?? 0;
    north += off.y ?? 0;
    const up = roof + (off.z ?? 18);

    const color = poi.color ?? '#ffcc33';
    const longitude = anchor.longitude + east / (111320 * cosLat);
    const latitude = anchor.latitude + north / 110574;
    const height = up;

    components.push({
      componentId: POI_UUID,
      name: poi.name,
      componentConfig: {
        label: poi.name,
        color,
        image: poiIcon(color),
        width: 26,
        height: 32,
        scaleByDistance: true,
        // 跟随白模城市：模型被拖动/旋转时标注自动跟随（与演示场景同构）
        parentId: MODEL_3D_UUID,
        // glTF 局部坐标（x=东, y=天, z=南）
        localOffset: { x: east, y: up, z: -north },
      },
      position: { cartographic: { longitude, latitude, height } },
      layerId: 'layer-gis',
      sortOrder: i + 1,
      visible: true,
      locked: false,
    });
  });

  return components;
}
