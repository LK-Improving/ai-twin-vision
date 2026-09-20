import type { Cartographic } from '@dt/shared-types';

/**
 * 场景 DSL 类型（详细设计 §4）。
 * 说明：本文件即「packages/scene-dsl」的核心类型定义，为规避 monorepo 构建编排
 * （当前环境无 pnpm 可用，新增 workspace 包需手工补软链），临时内聚于后端模块，
 * 后续可整体迁至 packages/scene-dsl 而不影响调用方。
 *
 * 坐标系约定（与引擎一致）：DSL 内所有坐标为「以 site.anchor 为原点的 ENU 局部坐标」
 *   x = 东（米），y = 北（米），z = 天（米，仅用于 POI 高度）。
 * 生成器内部会转换为 glTF Y-up 网格坐标（x=东, y=天, z=南）。
 */

export type BuildingKind =
  'commercial' | 'residential' | 'office' | 'school' | 'hospital' | 'metro' | 'industrial';

export interface Vec2 {
  /** 东向（米） */
  x: number;
  /** 北向（米） */
  y: number;
}

export interface Footprint {
  /** 底面中心东向（米） */
  x: number;
  /** 底面中心北向（米） */
  y: number;
  /** 东向宽度（米） */
  width: number;
  /** 北向进深（米） */
  depth: number;
}

export interface BuildingSpec {
  /** 语义 id，如 bldg-mall；数据绑定依赖它 */
  id: string;
  /** 显示名 */
  name: string;
  kind: BuildingKind;
  footprint: Footprint;
  /** 层数 */
  floors: number;
  /** 层高（米），默认 3.6 */
  floorHeight: number;
  facade?: { material?: string; color?: string };
  roof?: { type?: string };
  /** 朝向（度），0 = 正北 */
  rotate?: number;
}

export interface RoadSpec {
  id: string;
  /** 中心线途经点（ENU） */
  path: Vec2[];
  width: number;
  kind?: 'arterial' | 'secondary' | 'lane';
  lanes?: number;
  surface?: 'asphalt' | 'paver';
}

export interface WaterSpec {
  id: string;
  path: Vec2[];
  width: number;
  kind?: 'river' | 'canal' | 'lake';
  color?: string;
}

export interface GreenSpec {
  id: string;
  kind?: 'lawn' | 'forest' | 'plaza';
  footprint?: Footprint;
  path?: Vec2[];
  density?: number;
}

export interface PoiSpec {
  id: string;
  name: string;
  /** 关联建筑 id；'site' 表示贴在园区地面 */
  buildingId?: string;
  /** ENU 偏移（相对建筑中心：x=东, y=北, z=天），缺省 {0,0,18} */
  offset?: { x?: number; y?: number; z?: number };
  color?: string;
  kind?: string;
}

export interface PanelMetric {
  /** KPI / 指标卡主标题 */
  title?: string;
  /** 统计块等场景的主标签（与 title 二选一） */
  label?: string;
  value: number;
  unit?: string;
  trend?: number;
  color?: string;
}

export interface PanelAlert {
  level: 'red' | 'orange' | 'yellow';
  name: string;
  time?: string;
  status?: string;
}

export interface PanelSpec {
  /** 布局槽位：topbar / kpi-row / left-* / right-* / bottom / alerts */
  slot: string;
  type:
    'TOP_BAR' | 'METRIC_CARD' | 'STAT_BLOCK' | 'ALERT_LIST' | 'CHART_LINE' | 'CHART_PIE' | 'PANEL';
  title?: string;
  tabs?: string[];
  /** kpi-row / stat-block 数据（统一用 PanelMetric，title 与 label 二选一） */
  items?: PanelMetric[];
  /** alerts 数据 */
  alerts?: PanelAlert[];
  /** 图表数据 */
  data?: Array<{ name: string; value: number }>;
  color?: string;
}

export interface DynamicsSpec {
  traffic?: { enabled?: boolean; density?: number; speed?: number };
  pedestrians?: { enabled?: boolean; density?: number };
}

export interface SceneMeta {
  title: string;
  summary?: string;
  style?: string;
  timeOfDay?: 'day' | 'night';
  weather?: 'clear' | 'rain' | 'snow' | 'fog';
}

export interface SiteSpec {
  anchor: Cartographic;
  /** 园区范围（米） */
  extent: { width: number; depth: number };
  orientation?: string;
}

/** 对话式生成的场景描述（规划器产出，生成器消费） */
export interface SceneDsl {
  version: string;
  meta: SceneMeta;
  site: SiteSpec;
  buildings: BuildingSpec[];
  roads: RoadSpec[];
  water: WaterSpec[];
  greenery: GreenSpec[];
  pois: PoiSpec[];
  dynamics?: DynamicsSpec;
  panels: PanelSpec[];
}

/** 生成器返回的单个建筑语义信息（供 POI 定位 / 审计） */
export interface BuildingSemantic {
  id: string;
  name: string;
  kind: BuildingKind;
  /** glTF 局部包围盒（x=东, y=天, z=南） */
  bbox: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  /** 楼顶高度（米） */
  roofZ: number;
}
