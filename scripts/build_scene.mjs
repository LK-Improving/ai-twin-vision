/**
 * 构建「中意宁波生态园数智指挥大厅」演示场景
 * 用法: node _build_scene.mjs
 * 登录 admin → 建/复用场景 → PUT 写入 engineConfig + layout(2D大屏) + components(白模城市 + 楼顶POI)
 */
import * as fs from 'node:fs';

const API = 'http://localhost:3001/api/v1';
const SCENE_NAME = '中意宁波生态园数智指挥大厅';

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(API + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}\n${text.slice(0, 600)}`);
  return parsed;
}

const unwrap = (res) => (res && typeof res === 'object' && 'data' in res ? res.data : res);

/* ----------------------------- 数据 ----------------------------- */
const MONTHS = [
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
];
const ENERGY = [320, 302, 341, 374, 390, 430, 512, 498, 455, 410, 388, 402];
const energyData = MONTHS.map((name, i) => ({ name, value: ENERGY[i] }));

const industryData = [
  { name: '智能制造', value: 96 },
  { name: '生命健康', value: 62 },
  { name: '数字经济', value: 54 },
  { name: '新材料', value: 48 },
  { name: '现代服务', value: 26 },
];

const outputData = [
  { name: '智能制造', value: 128.6 },
  { name: '生命健康', value: 86.2 },
  { name: '新材料', value: 74.5 },
  { name: '数字经济', value: 58.3 },
  { name: '现代服务', value: 32.1 },
];

const aqiData = [
  { name: '周一', value: 52 },
  { name: '周二', value: 48 },
  { name: '周三', value: 61 },
  { name: '周四', value: 55 },
  { name: '周五', value: 43 },
  { name: '周六', value: 38 },
  { name: '周日', value: 46 },
];

const alertRows = [
  { time: '11:42', point: 'A3 变压器', level: '严重' },
  { time: '11:18', point: 'B2 配电房', level: '警告' },
  { time: '10:55', point: 'C1 水泵房', level: '提示' },
  { time: '10:20', point: 'D4 冷却塔', level: '警告' },
  { time: '09:48', point: 'A1 总配电', level: '提示' },
  { time: '09:12', point: 'E2 消防泵', level: '严重' },
];

const projectRows = [
  { name: '科创中心', progress: '92%', owner: '城投集团' },
  { name: '生命健康园', progress: '78%', owner: '医药集团' },
  { name: '数字产业园', progress: '65%', owner: '科技公司' },
  { name: '生态景观带', progress: '88%', owner: '园林公司' },
  { name: '综合服务中心', progress: '54%', owner: '城建公司' },
];

/* ------------------------- layout 构建工具 ------------------------- */
let seq = 0;
const uid = (p) => `${p}-${++seq}`;

/** 2D 节点 */
function node({ id, type, name, x, y, w, h, z = 5, props = {}, style, children }) {
  const n = {
    id: id ?? uid('node'),
    type,
    name,
    rect: { x, y, width: w, height: h, zIndex: z },
    props,
  };
  if (style) n.style = style;
  if (children && children.length) n.children = children;
  return n;
}

/** 面板容器 + 子节点（子节点坐标相对面板左上角） */
function panel({
  id,
  title,
  x,
  y,
  w,
  h,
  z = 5,
  borderColor = '#2ea8d8',
  glow = true,
  icon,
  headerTabs,
  activeTab,
  children,
}) {
  return node({
    id,
    type: 'PANEL',
    name: title,
    x,
    y,
    w,
    h,
    z,
    props: { title, borderColor, glow, icon, headerTabs, activeTab },
    children,
  });
}

const txt = (o) => node({ type: 'TEXT', ...o });

/* 常用 SVG 图标 path（供指标卡复用） */
const ICON_BUILDING = 'M3 21h18M5 21V7l8-4 8 4v14M8 21v-9h8v9';
const ICON_MONEY = 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6';
const ICON_TARGET = 'M12 2a10 10 0 1 0 10 10h-10z';
const ICON_LEAF = 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z';
const ICON_GAUGE = 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z';
const ICON_BELL = 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0';

/* ----------------------------- 2D 大屏 ----------------------------- */
const nodes = [];

// 底部暗角遮罩：统一三维画布色调、突出面板
nodes.push(
  node({
    id: 'bg-vignette',
    type: 'TEXT',
    name: '暗角遮罩',
    x: 0,
    y: 0,
    w: 1920,
    h: 1080,
    z: 1,
    props: { text: '' },
    style: {
      background:
        'radial-gradient(ellipse at 50% 46%, rgba(3,12,26,0.06) 0%, rgba(3,12,26,0.42) 58%, rgba(3,12,26,0.86) 100%)',
      pointerEvents: 'none',
    },
  }),
);

// 顶部通栏：标题 + 导航 + 工具/用户（复用 TopBar 组件）
nodes.push(
  node({
    id: 'hd-topbar',
    type: 'TOP_BAR',
    name: '顶部通栏',
    x: 0,
    y: 0,
    w: 1920,
    h: 92,
    z: 30,
    props: {
      title: '中意宁波生态园数智指挥大厅',
      subtitle: 'ZHONGYI NINGBO ECOLOGICAL PARK · DIGITAL TWIN COMMAND CENTER',
      tabs: ['综合总览', '招商引资', '环保监管', '安全生产', '经济运行'],
      activeIndex: 0,
      userName: '王主任',
      showTools: true,
      color: '#00e0ff',
    },
  }),
);

// 顶部核心 KPI 卡（导航下方一排）
const topKpis = [
  {
    id: 'kpi-1',
    title: '企业总数',
    value: 2568,
    unit: '家',
    trend: 0.47,
    color: '#00d8ff',
    icon: ICON_BUILDING,
  },
  {
    id: 'kpi-2',
    title: '经济指标',
    value: 45.8,
    unit: '亿元',
    trend: 5.2,
    color: '#36cfc9',
    icon: ICON_MONEY,
  },
  {
    id: 'kpi-3',
    title: '重点项目',
    value: 37,
    unit: '个',
    trend: 2.7,
    color: '#ffcc00',
    icon: ICON_TARGET,
  },
  {
    id: 'kpi-4',
    title: '环保指数',
    value: 86.5,
    unit: '',
    trend: 1.3,
    color: '#52c41a',
    icon: ICON_LEAF,
  },
];
topKpis.forEach((k, i) => {
  nodes.push(
    node({
      id: k.id,
      type: 'METRIC_CARD',
      name: k.title,
      x: 496 + i * 236,
      y: 100,
      w: 220,
      h: 74,
      z: 12,
      props: {
        title: k.title,
        value: k.value,
        unit: k.unit,
        trend: k.trend,
        color: k.color,
        icon: k.icon,
      },
    }),
  );
});

// 左列
nodes.push(
  panel({
    id: 'p-enterprise',
    title: '企业总数统计',
    x: 20,
    y: 186,
    w: 420,
    h: 214,
    borderColor: '#2ea8d8',
    children: [
      node({
        type: 'CHART_GAUGE',
        name: '企业总数',
        x: 10,
        y: 40,
        w: 200,
        h: 164,
        props: { title: '', value: 2568, max: 3000, unit: '家', color: '#00d8ff' },
      }),
      node({
        type: 'PROGRESS_LIST',
        name: '企业规模分布',
        x: 218,
        y: 48,
        w: 192,
        h: 152,
        props: {
          showValue: true,
          items: [
            { label: '大型企业', value: 590, percent: 50, color: '#00d8ff' },
            { label: '中型企业', value: 60, percent: 5.3, color: '#36cfc9' },
            { label: '小型企业', value: 150, percent: 20, color: '#ffcc00' },
            { label: '微型企业', value: 380, percent: 33.3, color: '#9254de' },
          ],
        },
      }),
    ],
  }),
  panel({
    id: 'p-energy',
    title: '园区能耗趋势（万kWh）',
    x: 20,
    y: 412,
    w: 420,
    h: 196,
    headerTabs: ['月度', '年度'],
    children: [
      node({
        type: 'CHART_LINE',
        name: '能耗趋势',
        x: 10,
        y: 36,
        w: 400,
        h: 150,
        props: {
          title: '',
          xField: 'name',
          yField: 'value',
          smooth: true,
          area: true,
          legend: false,
          colors: ['#00d8ff'],
          grid: { left: 44, right: 16, top: 18, bottom: 26 },
          data: energyData,
        },
      }),
    ],
  }),
  panel({
    id: 'p-industry',
    title: '企业业态分布（家）',
    x: 20,
    y: 620,
    w: 420,
    h: 186,
    children: [
      node({
        type: 'CHART_PIE',
        name: '业态分布',
        x: 10,
        y: 34,
        w: 400,
        h: 144,
        props: {
          nameField: 'name',
          valueField: 'value',
          doughnut: true,
          legend: true,
          colors: ['#00d8ff', '#36cfc9', '#ffcc00', '#ff7a45', '#9254de'],
          data: industryData,
        },
      }),
    ],
  }),
  panel({
    id: 'p-alert',
    title: '实时告警',
    x: 20,
    y: 818,
    w: 420,
    h: 226,
    borderColor: '#ff7a45',
    children: [
      node({
        type: 'ALERT_LIST',
        name: '告警列表',
        x: 10,
        y: 36,
        w: 400,
        h: 174,
        props: {
          autoScroll: true,
          items: [
            {
              level: 'red',
              name: '化工园区 A 区废水排放 COD 超标 30%',
              time: '2024-05-15 09:20:00',
              status: '未处理',
            },
            {
              level: 'orange',
              name: '3 号厂房消防系统压力异常',
              time: '2024-05-15 09:23:45',
              status: '处理中',
            },
            {
              level: 'yellow',
              name: '西区空气监测站 PM2.5 轻度超标',
              time: '2024-05-15 09:30:12',
              status: '已处理',
            },
            {
              level: 'red',
              name: 'D4 冷却塔温度超过阈值 45℃',
              time: '2024-05-15 09:41:08',
              status: '未处理',
            },
          ],
        },
      }),
    ],
  }),
);

// 右列
nodes.push(
  panel({
    id: 'p-indicators',
    title: '重点指标实时监控',
    x: 1480,
    y: 186,
    w: 420,
    h: 238,
    headerTabs: ['粉尘数据', '安全数据', '能耗数据'],
    children: [
      node({
        type: 'METRIC_CARD',
        name: '空气质量 AQI',
        x: 12,
        y: 40,
        w: 396,
        h: 60,
        props: {
          title: '空气质量（AQI）',
          value: 72,
          unit: '优',
          trend: -5.2,
          color: '#00d8ff',
          icon: ICON_LEAF,
          compact: true,
        },
      }),
      node({
        type: 'METRIC_CARD',
        name: '水质指数',
        x: 12,
        y: 108,
        w: 396,
        h: 60,
        props: {
          title: '水质指数',
          value: 94.6,
          unit: '%',
          trend: 1.8,
          color: '#36cfc9',
          icon: ICON_TARGET,
          compact: true,
        },
      }),
      node({
        type: 'METRIC_CARD',
        name: '噪声达标率',
        x: 12,
        y: 176,
        w: 396,
        h: 60,
        props: {
          title: '噪声达标率',
          value: 96.5,
          unit: '%',
          trend: 0.6,
          color: '#52c41a',
          icon: ICON_GAUGE,
          compact: true,
        },
      }),
    ],
  }),
  panel({
    id: 'p-warning',
    title: '异常事件预警提示',
    x: 1480,
    y: 436,
    w: 420,
    h: 206,
    borderColor: '#ff8c00',
    children: [
      node({
        type: 'ALERT_LIST',
        name: '预警列表',
        x: 10,
        y: 36,
        w: 400,
        h: 160,
        props: {
          autoScroll: true,
          items: [
            {
              level: 'red',
              name: '化工园区 A 区废水排放 COD 超标 30%',
              time: '2024-05-15 09:20:00',
              status: '未处理',
            },
            {
              level: 'orange',
              name: '3 号厂房消防系统压力异常',
              time: '2024-05-15 09:23:45',
              status: '处理中',
            },
            {
              level: 'yellow',
              name: '西区空气监测站 PM2.5 轻度超标',
              time: '2024-05-15 09:30:12',
              status: '已处理',
            },
          ],
        },
      }),
    ],
  }),
  panel({
    id: 'p-safety',
    title: '安全生产',
    x: 1480,
    y: 654,
    w: 420,
    h: 170,
    children: [
      node({
        type: 'METRIC_CARD',
        name: '安全检查',
        x: 12,
        y: 44,
        w: 190,
        h: 112,
        props: {
          title: '安全检查次数',
          value: 156,
          unit: '次',
          trend: 12.3,
          color: '#00d8ff',
          icon: ICON_BELL,
        },
      }),
      node({
        type: 'METRIC_CARD',
        name: '隐患整改',
        x: 218,
        y: 44,
        w: 190,
        h: 112,
        props: {
          title: '隐患整改数',
          value: 23,
          unit: '项',
          trend: -8.1,
          color: '#ffcc00',
          icon: ICON_BELL,
        },
      }),
    ],
  }),
  panel({
    id: 'p-project',
    title: '重点项目建设进度',
    x: 1480,
    y: 836,
    w: 420,
    h: 208,
    children: [
      node({
        type: 'TABLE',
        name: '项目进度',
        x: 10,
        y: 36,
        w: 400,
        h: 162,
        props: {
          columns: [
            { key: 'name', label: '项目' },
            { key: 'progress', label: '进度' },
            { key: 'owner', label: '责任单位' },
          ],
          rows: projectRows,
          zebra: true,
        },
      }),
    ],
  }),
);

// 中央：重点企业信息卡（参考图的浮动企业名片）
nodes.push(
  panel({
    id: 'p-company',
    title: '智能制造有限公司',
    x: 466,
    y: 196,
    w: 340,
    h: 216,
    children: [
      node({
        type: 'METRIC_CARD',
        name: '注册资本',
        x: 10,
        y: 40,
        w: 156,
        h: 78,
        props: {
          title: '注册资本',
          value: 5000,
          unit: '万元',
          color: '#00d8ff',
          icon: ICON_MONEY,
          compact: true,
        },
      }),
      node({
        type: 'METRIC_CARD',
        name: '员工数',
        x: 174,
        y: 40,
        w: 156,
        h: 78,
        props: {
          title: '员工数',
          value: 328,
          unit: '人',
          color: '#36cfc9',
          icon: ICON_BUILDING,
          compact: true,
        },
      }),
      node({
        type: 'METRIC_CARD',
        name: '年产值',
        x: 10,
        y: 124,
        w: 156,
        h: 78,
        props: {
          title: '年产值',
          value: 1.2,
          unit: '亿元',
          color: '#ffcc00',
          icon: ICON_TARGET,
          compact: true,
        },
      }),
      node({
        type: 'METRIC_CARD',
        name: '用地面积',
        x: 174,
        y: 124,
        w: 156,
        h: 78,
        props: {
          title: '用地面积',
          value: 2800,
          unit: '㎡',
          color: '#52c41a',
          icon: ICON_LEAF,
          compact: true,
        },
      }),
    ],
  }),
  node({
    id: 'p-stat-block',
    type: 'STAT_BLOCK',
    name: '企业类型总览',
    x: 600,
    y: 876,
    w: 720,
    h: 148,
    z: 12,
    props: {
      items: [
        { value: 458, label: '制造业企业', color: '#00d8ff' },
        { value: 326, label: '服务业企业', color: '#4fd6a8' },
        { value: 187, label: '科技企业', color: '#ffd166' },
      ],
    },
  }),
);

nodes.push(
  txt({
    id: 'hd-footer',
    name: '底部状态',
    x: 560,
    y: 1032,
    w: 800,
    h: 24,
    z: 12,
    props: {
      text: '系统运行正常 · 数据更新时间 2026-09-12 10:04:00 · 已接入 IoT 设备 186 台',
      fontSize: 12,
      color: '#4a7fa8',
      align: 'center',
    },
  }),
);

const layout = { version: '1.0.0', nodes, events: [], variables: [] };

/* ----------------------------- 3D 组件 ----------------------------- */
const POI = '50000000-0000-4000-8000-000000000003';
const MODEL3D = '50000000-0000-4000-8000-000000000001';
const CENTER = { longitude: 121.5497, latitude: 29.8747 };
const D2R = Math.PI / 180;
/** 调试用：把模型整体东/北/上平移，用于验证 POI 是否跟随模型（默认 0） */
const SHIFT_E = Number(process.env.SHIFT_E ?? 0);
const SHIFT_N = Number(process.env.SHIFT_N ?? 0);
const SHIFT_H = Number(process.env.SHIFT_H ?? 0);
const MODEL_CARTO = {
  longitude: CENTER.longitude + SHIFT_E / (111320 * Math.cos(CENTER.latitude * D2R)),
  latitude: CENTER.latitude + SHIFT_N / 110574,
  height: SHIFT_H,
};
/** 调试用：放大 POI 图标尺寸 */
const POI_W = Number(process.env.POI_W ?? 26);
const POI_H = Number(process.env.POI_H ?? 32);

/** 生成发光定位针图标的 data URI（不依赖 Cesium 文字图集，软件渲染下也稳定可见） */
function poiIcon(color) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80">` +
    `<circle cx="32" cy="32" r="26" fill="${color}" opacity="0.16"/>` +
    `<path d="M32 6c-9 0-16 7-16 16 0 12 16 28 16 28s16-16 16-28c0-9-7-16-16-16z" fill="${color}" stroke="#ffffff" stroke-width="2.5"/>` +
    `<circle cx="32" cy="22" r="6" fill="#ffffff"/>` +
    `</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}
/** 程序化白模城市（_mk_city_model.mjs 产出），POI 贴在制高楼顶 */
const CITY_POIS = JSON.parse(fs.readFileSync(new URL('./city-pois.json', import.meta.url), 'utf8'));

const components = [
  {
    componentId: MODEL3D,
    name: '园区白模建筑群',
    componentConfig: { modelUrl: '/models/city-white.glb', scale: 1, castShadow: true },
    // 模型 Y-up → 场景 ENU（Z 朝上）必须 rotation.x=90；底面在 y=0，立于地表
    position: {
      cartographic: MODEL_CARTO,
      rotation: { x: 90, y: 0, z: 0 },
    },
    layerId: 'layer-model',
    sortOrder: 0,
    visible: true,
    locked: false,
  },
  ...CITY_POIS.map((p, i) => ({
    componentId: POI,
    name: p.name,
    componentConfig: {
      label: p.name,
      color: '#ffcc33',
      image: poiIcon('#ffcc33'),
      width: POI_W,
      height: POI_H,
      scaleByDistance: true,
      // 绑定到白模城市：模型被拖动/旋转时标注自动跟随
      parentId: MODEL3D,
      localOffset: p.local,
    },
    position: { cartographic: { longitude: p.longitude, latitude: p.latitude, height: p.height } },
    layerId: 'layer-gis',
    sortOrder: i + 1,
    visible: true,
    locked: false,
  })),
];

/* ----------------------------- config ----------------------------- */
const config = {
  cesium: {
    enabled: true,
    // 深色矢量底图（CartoDB dark_all），配白模才是“数智指挥大厅”的科技暗色调
    imageryLayers: [
      {
        id: 'base-imagery',
        name: '深色底图',
        provider: 'XYZ',
        url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        show: true,
        alpha: 1,
        maximumLevel: 19,
      },
    ],
    terrain: { enabled: false },
    tilesets: [],
    initialView: {
      // initialView 是相机自身位置：pitch 越平视野中心越偏离相机正下方
      // （偏移 ≈ height/tan|pitch|），故把纬度南移让白模城市落在画面中心
      longitude: CENTER.longitude,
      latitude: CENTER.latitude - 0.0082,
      height: 1300,
      heading: 8,
      pitch: -50,
      roll: 0,
    },
    scene: {
      globeShow: true,
      skyAtmosphere: false,
      fxaa: true,
      depthTestAgainstTerrain: false,
      maximumScreenSpaceError: 16,
    },
    environment: { rain: 0, snow: 0, fog: 0.15, enableLighting: false },
  },
  threejs: {
    enabled: true,
    renderer: {
      antialias: true,
      pixelRatioLimit: 2,
      shadowMap: true,
      toneMapping: 'ACES_FILMIC',
      exposure: 1.0,
    },
    environment: {
      background: '#04080f',
      ambientIntensity: 1.1,
      directionalIntensity: 1.6,
      directionalPosition: { x: 200, y: 400, z: 160 },
    },
    // bloom 让楼体棱线（青色 emissive）泛光，即参考图的“发光白模”效果
    postProcessing: { bloom: true, outline: true, ssao: false },
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
    anchor: { longitude: CENTER.longitude, latitude: CENTER.latitude, height: 0 },
  },
  layers: [
    { id: 'layer-gis', name: 'GIS 图层', visible: true, sortOrder: 0, engine: 'CESIUM' },
    { id: 'layer-model', name: '精细模型', visible: true, sortOrder: 1, engine: 'THREE' },
    { id: 'layer-ui', name: '大屏面板', visible: true, sortOrder: 2, engine: 'DOM' },
  ],
  canvas: { width: 1920, height: 1080, fitMode: 'CONTAIN', background: 'transparent' },
  performance: { targetFps: 60, minFps: 30, maxMemoryMb: 2048, maxDrawCall: 3000 },
};

/* ----------------------------- 执行 ----------------------------- */
const login = await req('/auth/login', {
  method: 'POST',
  body: { username: 'admin', password: 'Admin@123', deviceId: 'scene-builder' },
});
const token = unwrap(login)?.accessToken;
if (!token) throw new Error('登录失败：未拿到 accessToken\n' + JSON.stringify(login).slice(0, 400));
console.log('✓ 登录成功');

const listRes = await req('/scenes?page=1&pageSize=100', { token });
const list = unwrap(listRes);
const items = list?.dataList ?? list?.items ?? list?.list ?? [];
let scene = items.find((s) => s.name === SCENE_NAME);

if (scene) {
  console.log('✓ 场景已存在，直接更新：', scene.id);
} else {
  const created = await req('/scenes', {
    method: 'POST',
    token,
    body: {
      name: SCENE_NAME,
      description: '中意宁波生态园数智指挥大厅 · 园区运行监测与三维实景融合演示',
      sceneType: 'HYBRID',
      config,
    },
  });
  scene = unwrap(created);
  console.log('✓ 场景创建成功：', scene.id);
}

const updated = await req(`/scenes/${scene.id}`, {
  method: 'PUT',
  token,
  body: {
    name: SCENE_NAME,
    description: '中意宁波生态园数智指挥大厅 · 园区运行监测与三维实景融合演示',
    sceneType: 'HYBRID',
    config,
    layout,
    components,
  },
});

const detail = unwrap(updated);
const flat = (list2 = []) => list2.reduce((acc, n) => acc.concat(n, flat(n.children ?? [])), []);
console.log('✓ 写入完成');
console.log('  sceneId      =', detail.id);
console.log('  2D 节点数    =', flat(detail.layout?.nodes ?? []).length);
console.log('  3D 组件数    =', (detail.components ?? []).length);
console.log('SCENE_ID=' + detail.id);
