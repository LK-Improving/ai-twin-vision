import type { Cartographic } from '@dt/shared-types';
import type { BuildingKind, PanelMetric, SceneDsl } from '../dsl/types';

/** 规划器上下文（详细设计 §5.1） */
export interface PlannerContext {
  anchor?: Cartographic;
  /** 可用面板组件种类（预留，L1 全量生成） */
  widgetTypes?: string[];
}

const DEFAULT_ANCHOR: Cartographic = { longitude: 116.397428, latitude: 39.90923, height: 0 };

/** 确定性 RNG */
function makeRand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 规则降级规划器（L1 默认 / LLM 不可用时的兜底）。
 * 解析中文描述中的关键词（业态、规模、天气、时段），产出一份合法 SceneDsl。
 * 不依赖任何 LLM 服务，毫秒级返回，保证「一条 prompt 即可生成园区」的闭环。
 */
export class RulePlanner {
  parse(prompt: string, ctx: PlannerContext = {}): SceneDsl {
    const rand = makeRand(hashStr(prompt || 'ai-scene'));
    const p = prompt || '';

    // 关键词 → 业态权重
    const mix: Record<BuildingKind, number> = {
      commercial: 1,
      residential: 1,
      office: 1,
      school: 0,
      hospital: 0,
      metro: 0,
      industrial: 0,
    };
    if (/商业|商场|综合体|cbd|购物|写字楼/i.test(p)) mix.commercial += 3;
    if (/住宅|小区|居住|楼盘|公寓/i.test(p)) mix.residential += 3;
    if (/办公|总部|科技|软件|研发|园区|产业/i.test(p)) mix.office += 3;
    if (/工厂|工业|制造|厂房/i.test(p)) mix.industrial += 2;
    if (/学校|教育|学院|小学|中学|大学/i.test(p)) mix.school += 1;
    if (/医院|医疗|卫生/i.test(p)) mix.hospital += 1;
    if (/地铁|轨交|交通|车站|枢纽/i.test(p)) mix.metro += 1;

    const weather: 'clear' | 'rain' | 'snow' | 'fog' = /雪/.test(p)
      ? 'snow'
      : /雨/.test(p)
        ? 'rain'
        : /雾/.test(p)
          ? 'fog'
          : 'clear';
    const timeOfDay: 'day' | 'night' = /夜|晚|dark/i.test(p) ? 'night' : 'day';

    const big = /大型|城市级|千亩|百万|超大/i.test(p);
    // 小园区 1200m 而非 900m：保证 RANGE=4 的网格（最远 480m + 楼体半宽）完整落在边界内，
    // 否则会刷出几十条「建筑超出园区范围」告警。
    const extent = big ? { width: 1400, depth: 1400 } : { width: 1200, depth: 1200 };
    const half = Math.max(extent.width, extent.depth) / 2;

    // 园区标题
    const title = deriveTitle(p);

    // 建筑网格布局
    const CELL = 120;
    const ROAD = 24;
    // 由园区半径反推网格圈数：|楼中心| + 楼体半宽(≤50) 必须 ≤ half，留 60m 余量，
    // 避免出现「建筑超出园区范围」告警（小园区 4 圈 / 大园区 5 圈）
    const RANGE = Math.max(1, Math.floor((half - 60) / CELL));
    const buildings: SceneDsl['buildings'] = [];
    let idx = 0;
    for (let gx = -RANGE; gx <= RANGE; gx += 1) {
      for (let gz = -RANGE; gz <= RANGE; gz += 1) {
        const cx = gx * CELL;
        const cz = gz * CELL;
        if (Math.hypot(cx, cz) < 70) continue; // 中心广场留空
        const kind = pickKind(mix, rand);
        const floorsInfo = floorRange(kind, rand);
        const w = 50 + Math.floor(rand() * 50);
        const d = 50 + Math.floor(rand() * 50);
        idx += 1;
        buildings.push({
          id: `bldg-${String(idx).padStart(2, '0')}`,
          name: `${kindName(kind)}${idx}`,
          kind,
          footprint: { x: cx, y: cz, width: w, depth: d },
          floors: floorsInfo.floors,
          floorHeight: floorsInfo.floorHeight,
          facade: { material: facadeFor(kind) },
          roof: { type: kind === 'school' || kind === 'residential' ? 'flat' : 'openTerrace' },
        });
      }
    }

    // 道路：十字主干 + 外环
    const roads: SceneDsl['roads'] = [
      {
        id: 'road-main-h',
        path: [
          { x: -half, y: 0 },
          { x: half, y: 0 },
        ],
        width: 26,
        kind: 'arterial',
        lanes: 4,
        surface: 'asphalt',
      },
      {
        id: 'road-main-v',
        path: [
          { x: 0, y: -half },
          { x: 0, y: half },
        ],
        width: 26,
        kind: 'arterial',
        lanes: 4,
        surface: 'asphalt',
      },
      {
        id: 'road-sec-1',
        path: [
          { x: -half, y: -ROAD * 3 },
          { x: half, y: -ROAD * 3 },
        ],
        width: 16,
        kind: 'secondary',
        lanes: 2,
        surface: 'asphalt',
      },
      {
        id: 'road-sec-2',
        path: [
          { x: -ROAD * 3, y: -half },
          { x: -ROAD * 3, y: half },
        ],
        width: 16,
        kind: 'secondary',
        lanes: 2,
        surface: 'asphalt',
      },
    ];

    // 水体：斜穿河道
    const water: SceneDsl['water'] = [
      {
        id: 'water-river',
        path: [
          { x: -half, y: -half * 0.6 },
          { x: -half * 0.3, y: 0 },
          { x: half * 0.4, y: half * 0.5 },
          { x: half, y: half * 0.8 },
        ],
        width: 22,
        kind: 'river',
        color: '#2f6f86',
      },
    ];

    // 绿地：中心广场 + 沿河
    const greenery: SceneDsl['greenery'] = [
      { id: 'green-plaza', kind: 'plaza', footprint: { x: 0, y: 0, width: 110, depth: 110 } },
      {
        id: 'green-river',
        kind: 'lawn',
        path: [
          { x: -half * 0.3, y: -half * 0.6 },
          { x: half * 0.4, y: half * 0.5 },
        ],
      },
    ];

    // POI：取最高的几栋楼 + 地铁（贴边缘楼）
    const pois: SceneDsl['pois'] = [];
    const sorted = [...buildings].sort(
      (a, b) => b.floors * b.floorHeight - a.floors * a.floorHeight,
    );
    const poiNames = ['主地标塔楼', '企业服务中心', '科创展示中心', '招商运营中心', '综合配套楼'];
    sorted.slice(0, Math.min(5, sorted.length)).forEach((b, i) => {
      pois.push({
        id: `poi-${String(i + 1).padStart(2, '0')}`,
        name: poiNames[i] ?? `${b.name} 标注`,
        buildingId: b.id,
        offset: { x: 0, y: 0, z: 20 },
        color: ['#ffcc33', '#4fc3f7', '#81c784', '#ff7a45', '#9254de'][i % 5],
        kind: b.kind,
      });
    });
    if (mix.metro > 0 && buildings.length > 0) {
      const edge = buildings[buildings.length - 1];
      pois.push({
        id: 'poi-metro',
        name: '园区地铁站',
        buildingId: edge.id,
        offset: { x: -60, y: 0, z: 6 },
        color: '#4fc3f7',
        kind: 'metro',
      });
    }

    // 大屏面板
    const panels: SceneDsl['panels'] = [
      {
        slot: 'topbar',
        type: 'TOP_BAR',
        title,
        tabs: ['综合总览', '招商引资', '环保监管', '安全生产', '经济运行'],
      },
      {
        slot: 'kpi-row',
        type: 'METRIC_CARD',
        items: [
          { title: '企业总数', value: 2568, unit: '家', trend: 3.2, color: '#00d8ff' },
          { title: '经济指标', value: 45.8, unit: '亿元', trend: 5.1, color: '#36cfc9' },
          { title: '在产项目', value: 37, unit: '个', trend: 2.7, color: '#ffcc00' },
          { title: '绿化率', value: 38.6, unit: '%', trend: 1.2, color: '#52c41a' },
        ],
      },
      {
        slot: 'left-pie',
        type: 'CHART_PIE',
        title: '企业业态分布',
        data: [
          { name: '智能制造', value: 96 },
          { name: '数字经济', value: 54 },
          { name: '生命健康', value: 62 },
          { name: '新材料', value: 48 },
          { name: '现代服务', value: 26 },
        ],
      },
      {
        slot: 'left-line',
        type: 'CHART_LINE',
        title: '园区能耗趋势（万kWh）',
        data: [
          '1月',
          '2月',
          '3月',
          '4月',
          '5月',
          '6月',
          '7月',
          '8月',
          '9月',
          '10月',
          '11月',
          '12月',
        ].map((name, i) => ({
          name,
          value: [320, 302, 341, 374, 390, 430, 512, 498, 455, 410, 388, 402][i],
        })),
      },
      {
        slot: 'alerts',
        type: 'ALERT_LIST',
        title: '实时告警',
        alerts: [
          { level: 'red', name: 'A 区废水排放 COD 超标 30%', time: '09:20', status: '未处理' },
          { level: 'orange', name: '3 号厂房消防系统压力异常', time: '09:23', status: '处理中' },
          {
            level: 'yellow',
            name: '西区空气监测站 PM2.5 轻度超标',
            time: '09:30',
            status: '已处理',
          },
        ],
      },
      {
        slot: 'bottom',
        type: 'STAT_BLOCK',
        items: [
          { value: 458, label: '制造业企业', color: '#00d8ff' },
          { value: 326, label: '服务业企业', color: '#4fd6a8' },
          { value: 187, label: '科技企业', color: '#ffd166' },
        ],
      },
    ];

    return {
      version: '1.0.0',
      meta: {
        title,
        summary: '对话式生成的园区数字孪生场景',
        style: '现代都市与科技感融合',
        timeOfDay,
        weather,
      },
      site: { anchor: ctx.anchor ?? DEFAULT_ANCHOR, extent, orientation: 'north' },
      buildings,
      roads,
      water,
      greenery,
      pois,
      dynamics: {
        traffic: { enabled: true, density: 0.4, speed: 12 },
        pedestrians: { enabled: true, density: 0.3 },
      },
      panels,
    };
  }
}

function deriveTitle(p: string): string {
  const clean = p.replace(/\s+/g, '').slice(0, 18);
  if (/园区|科技|智慧|产业|新城/.test(p)) return `${clean || '智慧'} · 数字孪生场景`;
  if (clean) return `${clean} · 三维场景`;
  return 'AI 生成园区 · 数字孪生场景';
}

function pickKind(mix: Record<BuildingKind, number>, rand: () => number): BuildingKind {
  const entries = Object.entries(mix).filter(([, w]) => w > 0) as Array<[BuildingKind, number]>;
  const total = entries.reduce((s, [, w]) => s + w, 0) || 1;
  let r = rand() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return 'commercial';
}

function floorRange(
  kind: BuildingKind,
  rand: () => number,
): { floors: number; floorHeight: number } {
  switch (kind) {
    case 'commercial':
      return { floors: 4 + Math.floor(rand() * 12), floorHeight: 4.2 };
    case 'residential':
      return { floors: 12 + Math.floor(rand() * 22), floorHeight: 3.0 };
    case 'office':
      return { floors: 8 + Math.floor(rand() * 16), floorHeight: 3.6 };
    case 'school':
      return { floors: 3 + Math.floor(rand() * 3), floorHeight: 4.0 };
    case 'hospital':
      return { floors: 6 + Math.floor(rand() * 6), floorHeight: 3.8 };
    case 'industrial':
      return { floors: 2 + Math.floor(rand() * 3), floorHeight: 6.0 };
    default:
      return { floors: 5, floorHeight: 3.6 };
  }
}

function facadeFor(kind: BuildingKind): string {
  switch (kind) {
    case 'commercial':
    case 'office':
      return 'glassCurtain';
    case 'industrial':
      return 'metal';
    case 'school':
      return 'brick';
    case 'hospital':
      return 'stone';
    default:
      return 'concrete';
  }
}

function kindName(kind: BuildingKind): string {
  const map: Record<BuildingKind, string> = {
    commercial: '商业楼',
    residential: '住宅楼',
    office: '办公楼',
    school: '学校',
    hospital: '医院',
    metro: '交通',
    industrial: '厂房',
  };
  return map[kind];
}
