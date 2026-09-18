/**
 * Mock 数据集（仅在 VITE_USE_MOCK=true 时使用）
 * 数据为内存态，支持增删改，模拟真实业务场景（智慧园区 / 变电站 / 生产车间等）。
 */
import {
  DEFAULT_ENGINE_CONFIG,
  EMPTY_PAGE_SCHEMA,
  type ComponentCategory,
  type ComponentDetail,
  type ComponentListItem,
  type ComponentType,
  type DataSourceItem,
  type DataSourceType,
  type DeviceItem,
  type DeviceProtocol,
  type ModelAssetItem,
  type OperationLogItem,
  type PageResult,
  type PermissionNode,
  type RoleItem,
  type SceneDetail,
  type SceneListItem,
  type SceneStatus,
  type SceneType,
  type TemplateDetail,
  type TemplateListItem,
  type UserItem,
} from '@dt/shared-types';

let seq = 1000;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

/* ---------------- 场景 ---------------- */
export const mockScenes: SceneListItem[] = [
  {
    id: nextId('scene'),
    name: '智慧园区数字孪生',
    description: '覆盖楼宇、管网、能耗与安防的园区级宏观孪生',
    coverImage: null,
    sceneType: 'MACRO' as SceneType,
    status: 'PUBLISHED',
    version: 3,
    publishVersion: 2,
    creatorId: 'u_1',
    creatorName: '张工',
    createdAt: '2025-08-01T09:12:00.000Z',
    updatedAt: '2025-09-01T14:30:00.000Z',
  },
  {
    id: nextId('scene'),
    name: '220kV 变电站三维监控',
    description: '主变压器、GIS 组合电器的实时温度与局放监测',
    coverImage: null,
    sceneType: 'HYBRID' as SceneType,
    status: 'DRAFT',
    version: 5,
    publishVersion: null,
    creatorId: 'u_2',
    creatorName: '李工',
    createdAt: '2025-07-20T10:00:00.000Z',
    updatedAt: '2025-09-05T08:20:00.000Z',
  },
  {
    id: nextId('scene'),
    name: '智能制造车间产线',
    description: '微观级产线设备孪生，联动 MES 节拍与告警',
    coverImage: null,
    sceneType: 'MICRO' as SceneType,
    status: 'PUBLISHED',
    version: 2,
    publishVersion: 1,
    creatorId: 'u_1',
    creatorName: '张工',
    createdAt: '2025-06-15T11:30:00.000Z',
    updatedAt: '2025-08-28T16:45:00.000Z',
  },
  {
    id: nextId('scene'),
    name: '城市综合管廊',
    description: '管廊内部环境与设备运行状态宏观监测',
    coverImage: null,
    sceneType: 'MACRO' as SceneType,
    status: 'ARCHIVED',
    version: 1,
    publishVersion: 1,
    creatorId: 'u_3',
    creatorName: '王工',
    createdAt: '2025-05-02T09:00:00.000Z',
    updatedAt: '2025-07-10T10:10:00.000Z',
  },
  {
    id: nextId('scene'),
    name: '风电场集群监测',
    description: '风机点位分布与发电功率实时大屏',
    coverImage: null,
    sceneType: 'MACRO' as SceneType,
    status: 'DRAFT',
    version: 4,
    publishVersion: null,
    creatorId: 'u_2',
    creatorName: '李工',
    createdAt: '2025-08-18T13:20:00.000Z',
    updatedAt: '2025-09-06T09:05:00.000Z',
  },
  {
    id: nextId('scene'),
    name: '数据中心机房微模块',
    description: '机房微模块温湿度与能耗精细孪生',
    coverImage: null,
    sceneType: 'MICRO' as SceneType,
    status: 'PUBLISHED',
    version: 2,
    publishVersion: 1,
    creatorId: 'u_1',
    creatorName: '张工',
    createdAt: '2025-07-01T08:00:00.000Z',
    updatedAt: '2025-08-30T11:00:00.000Z',
  },
  {
    id: nextId('scene'),
    name: '地铁车站客流孪生',
    description: '车站客流密度与设备运行宏观监测',
    coverImage: null,
    sceneType: 'HYBRID' as SceneType,
    status: 'DRAFT',
    version: 6,
    publishVersion: null,
    creatorId: 'u_3',
    creatorName: '王工',
    createdAt: '2025-06-25T15:40:00.000Z',
    updatedAt: '2025-09-04T17:25:00.000Z',
  },
  {
    id: nextId('scene'),
    name: '水利泵站群',
    description: '泵站机组运行与水位宏观监测',
    coverImage: null,
    sceneType: 'MACRO' as SceneType,
    status: 'PUBLISHED',
    version: 1,
    publishVersion: 1,
    creatorId: 'u_2',
    creatorName: '李工',
    createdAt: '2025-05-18T10:30:00.000Z',
    updatedAt: '2025-07-22T12:00:00.000Z',
  },
  {
    id: nextId('scene'),
    name: '智慧校园能源',
    description: '校园建筑能耗精细孪生与节能分析',
    coverImage: null,
    sceneType: 'MICRO' as SceneType,
    status: 'DRAFT',
    version: 3,
    publishVersion: null,
    creatorId: 'u_1',
    creatorName: '张工',
    createdAt: '2025-08-08T09:45:00.000Z',
    updatedAt: '2025-09-02T14:15:00.000Z',
  },
  {
    id: nextId('scene'),
    name: '化工厂区安全',
    description: '危化品储罐与管线安全宏观监测',
    coverImage: null,
    sceneType: 'HYBRID' as SceneType,
    status: 'PUBLISHED',
    version: 2,
    publishVersion: 1,
    creatorId: 'u_3',
    creatorName: '王工',
    createdAt: '2025-06-30T11:10:00.000Z',
    updatedAt: '2025-08-20T15:50:00.000Z',
  },
  {
    id: nextId('scene'),
    name: '港口集装箱调度',
    description: '岸桥与堆场调度宏观孪生',
    coverImage: null,
    sceneType: 'MACRO' as SceneType,
    status: 'DRAFT',
    version: 2,
    publishVersion: null,
    creatorId: 'u_2',
    creatorName: '李工',
    createdAt: '2025-07-28T16:00:00.000Z',
    updatedAt: '2025-09-03T10:30:00.000Z',
  },
  {
    id: nextId('scene'),
    name: '光伏电站运维',
    description: '光伏阵列发电与逆变状态微观孪生',
    coverImage: null,
    sceneType: 'MICRO' as SceneType,
    status: 'PUBLISHED',
    version: 1,
    publishVersion: 1,
    creatorId: 'u_1',
    creatorName: '张工',
    createdAt: '2025-05-25T09:00:00.000Z',
    updatedAt: '2025-07-15T13:20:00.000Z',
  },
];

/** 由列表项生成详情（补充引擎配置与组件树） */
// 空页面 Schema：节点/事件/变量均为空

export function buildSceneDetail(item: SceneListItem): SceneDetail {
  return {
    ...item,
    config: DEFAULT_ENGINE_CONFIG,
    components: [],
    layout: EMPTY_PAGE_SCHEMA,
  };
}

/* ---------------- 组件库 ---------------- */
const COMPONENT_SEED: Array<{
  name: string;
  type: ComponentType | string;
  category: ComponentCategory | string;
  isPublic: boolean;
  version: string;
}> = [
  { name: 'GLTF 模型加载器', type: 'MODEL_3D', category: 'SCENE_3D', isPublic: true, version: '1.2.0' },
  { name: '3D Tiles 倾斜摄影', type: 'TILES_3D', category: 'SCENE_3D', isPublic: true, version: '1.0.0' },
  { name: '地形服务', type: 'TERRAIN', category: 'SCENE_3D', isPublic: true, version: '1.1.0' },
  { name: 'POI 标注点', type: 'POI', category: 'SCENE_3D', isPublic: true, version: '1.3.1' },
  { name: '轨迹路径', type: 'PATH', category: 'SCENE_3D', isPublic: false, version: '0.9.0' },
  { name: '粒子特效', type: 'PARTICLE', category: 'SCENE_3D', isPublic: false, version: '0.8.0' },
  { name: '折线图', type: 'CHART_LINE', category: 'CHART', isPublic: true, version: '2.1.0' },
  { name: '柱状图', type: 'CHART_BAR', category: 'CHART', isPublic: true, version: '2.1.0' },
  { name: '饼图', type: 'CHART_PIE', category: 'CHART', isPublic: true, version: '2.0.0' },
  { name: '仪表盘', type: 'CHART_GAUGE', category: 'CHART', isPublic: true, version: '1.5.0' },
  { name: '指标卡片', type: 'METRIC_CARD', category: 'UI', isPublic: true, version: '1.4.0' },
  { name: '文本标签', type: 'TEXT', category: 'UI', isPublic: true, version: '1.0.0' },
  { name: '数据表格', type: 'TABLE', category: 'UI', isPublic: true, version: '1.2.0' },
  { name: '图片', type: 'IMAGE', category: 'MEDIA', isPublic: true, version: '1.0.0' },
  { name: '视频流', type: 'VIDEO', category: 'MEDIA', isPublic: false, version: '1.1.0' },
  { name: '面板容器', type: 'PANEL', category: 'UI', isPublic: true, version: '1.3.0' },
];

export const mockComponents: ComponentDetail[] = COMPONENT_SEED.map((seed, i) => ({
  id: nextId('comp'),
  name: seed.name,
  componentType: seed.type,
  category: seed.category,
  modelUrl: null,
  thumbnailUrl: null,
  isPublic: seed.isPublic,
  version: seed.version,
  creatorId: i % 2 === 0 ? 'u_1' : 'u_2',
  createdAt: '2025-05-10T08:00:00.000Z',
  updatedAt: '2025-08-12T10:00:00.000Z',
  description: `${seed.name}组件，用于数字孪生场景快速搭建`,
  configSchema: { props: [] },
  sourceCode: null,
}));

export function toComponentListItem(detail: ComponentDetail): ComponentListItem {
  const { description, configSchema, sourceCode, updatedAt, ...rest } = detail;
  void description;
  void configSchema;
  void sourceCode;
  return { ...rest, updatedAt };
}

/* ---------------- 模板 ---------------- */
export const mockTemplates: TemplateListItem[] = [
  {
    id: nextId('tpl'),
    name: '园区总览模板',
    description: '宏观园区总览大屏骨架',
    category: '园区',
    coverImage: null,
    isPublic: true,
    creatorId: 'u_1',
    createdAt: '2025-06-01T08:00:00.000Z',
    updatedAt: '2025-07-01T10:00:00.000Z',
  },
  {
    id: nextId('tpl'),
    name: '变电站监控模板',
    description: '变电站实时监测大屏',
    category: '能源',
    coverImage: null,
    isPublic: true,
    creatorId: 'u_2',
    createdAt: '2025-06-10T08:00:00.000Z',
    updatedAt: '2025-07-12T10:00:00.000Z',
  },
  {
    id: nextId('tpl'),
    name: '产线看板模板',
    description: '微观产线运行看板',
    category: '制造',
    coverImage: null,
    isPublic: false,
    creatorId: 'u_1',
    createdAt: '2025-06-20T08:00:00.000Z',
    updatedAt: '2025-07-20T10:00:00.000Z',
  },
];

export function buildTemplateDetail(item: TemplateListItem): TemplateDetail {
  return {
    ...item,
    templateData: { config: {}, components: [], layout: { version: '1.0.0', nodes: [], events: [] } },
  };
}

/* ---------------- 3D 模型资产 ---------------- */
export const mockModelAssets: ModelAssetItem[] = [
  {
    id: nextId('asset'),
    assetName: '变电站主变压器',
    assetType: 'GLB',
    fileId: nextId('file'),
    url: 'https://cdn.example.com/models/transformer.glb',
    thumbnailUrl: null,
    polygonCount: 184200,
    textureCount: 6,
    creatorId: 'u_1',
    createdAt: '2025-07-01T08:00:00.000Z',
    updatedAt: '2025-07-01T08:00:00.000Z',
  },
  {
    id: nextId('asset'),
    assetName: '风机模型',
    assetType: 'GLTF',
    fileId: nextId('file'),
    url: 'https://cdn.example.com/models/turbine.gltf',
    thumbnailUrl: null,
    polygonCount: 96200,
    textureCount: 4,
    creatorId: 'u_2',
    createdAt: '2025-07-05T08:00:00.000Z',
    updatedAt: '2025-07-05T08:00:00.000Z',
  },
  {
    id: nextId('asset'),
    assetName: '园区楼宇',
    assetType: 'FBX',
    fileId: nextId('file'),
    url: 'https://cdn.example.com/models/building.fbx',
    thumbnailUrl: null,
    polygonCount: 320100,
    textureCount: 9,
    creatorId: 'u_1',
    createdAt: '2025-07-10T08:00:00.000Z',
    updatedAt: '2025-07-10T08:00:00.000Z',
  },
  {
    id: nextId('asset'),
    assetName: '管廊倾斜摄影',
    assetType: '3DTILES',
    fileId: nextId('file'),
    url: 'https://cdn.example.com/tiles/pipe/tileset.json',
    thumbnailUrl: null,
    polygonCount: null,
    textureCount: null,
    creatorId: 'u_3',
    createdAt: '2025-07-15T08:00:00.000Z',
    updatedAt: '2025-07-15T08:00:00.000Z',
  },
];

/* ---------------- 数据源 ---------------- */
function buildDataSource(name: string, type: DataSourceType | string): DataSourceItem {
  return {
    id: nextId('ds'),
    name,
    type,
    config: { host: '127.0.0.1', port: 5432, database: 'digital_twin' },
    status: 1,
    testResult: null,
    creatorId: 'u_1',
    createdAt: '2025-06-01T08:00:00.000Z',
    updatedAt: '2025-08-01T08:00:00.000Z',
  };
}
export const mockDataSources: DataSourceItem[] = [
  buildDataSource('园区 Postgres', 'PG'),
  buildDataSource('生产 MySQL', 'MYSQL'),
  buildDataSource('实时 HTTP 网关', 'HTTP'),
  buildDataSource('设备 WebSocket', 'WEBSOCKET'),
  buildDataSource('MQTT 接入', 'MQTT'),
];

/* ---------------- 设备 ---------------- */
function buildDevice(code: string, name: string, type: string, protocol: DeviceProtocol | string): DeviceItem {
  return {
    id: nextId('dev'),
    deviceCode: code,
    deviceName: name,
    deviceType: type,
    protocol,
    connectionConfig: { endpoint: 'tcp://127.0.0.1:1883' },
    status: 1,
    lastOnlineAt: '2025-09-08T08:00:00.000Z',
    createdAt: '2025-06-01T08:00:00.000Z',
    updatedAt: '2025-08-01T08:00:00.000Z',
  };
}
export const mockDevices: DeviceItem[] = [
  buildDevice('DEV-TR-001', '主变压器温度传感器', '传感器', 'MQTT'),
  buildDevice('DEV-TR-002', 'GIS 局放监测', '监测装置', 'MQTT'),
  buildDevice('DEV-PD-001', '产线PLC', '控制器', 'OPC-UA'),
  buildDevice('DEV-PD-002', '机械臂', '执行器', 'MODBUS'),
  buildDevice('DEV-WT-001', '风机变流器', '变流器', 'MQTT'),
  buildDevice('DEV-WT-002', '风速仪', '传感器', 'HTTP'),
  buildDevice('DEV-DC-001', '机柜温湿度', '传感器', 'MQTT'),
  buildDevice('DEV-MP-001', '泵站软启柜', '控制器', 'MODBUS'),
];

/* ---------------- 用户 ---------------- */
function buildUser(username: string, realName: string, roleCode: string): UserItem {
  return {
    id: nextId('user'),
    tenantId: 'tenant_1',
    username,
    realName,
    email: `${username}@example.com`,
    phone: '13800000000',
    avatar: null,
    status: 1,
    roles: [{ id: nextId('role'), roleCode, roleName: roleCode }],
    lastLoginAt: '2025-09-08T08:00:00.000Z',
    createdAt: '2025-01-01T08:00:00.000Z',
    updatedAt: '2025-08-01T08:00:00.000Z',
  };
}
export const mockUsers: UserItem[] = [
  buildUser('admin', '系统管理员', 'SUPER_ADMIN'),
  buildUser('dev_zhang', '张工', 'DEVELOPER'),
  buildUser('dev_li', '李工', 'DEVELOPER'),
  buildUser('viewer_wang', '王工', 'VIEWER'),
  buildUser('tenant_admin', '租户管理员', 'TENANT_ADMIN'),
];

/* ---------------- 角色与权限树 ---------------- */
export const mockRoles: RoleItem[] = [
  {
    id: nextId('role'),
    tenantId: 'tenant_1',
    roleCode: 'SUPER_ADMIN',
    roleName: '超级管理员',
    description: '全部权限',
    isSystem: true,
    permissionIds: [],
    createdAt: '2025-01-01T08:00:00.000Z',
    updatedAt: '2025-01-01T08:00:00.000Z',
  },
  {
    id: nextId('role'),
    tenantId: 'tenant_1',
    roleCode: 'DEVELOPER',
    roleName: '开发者',
    description: '场景与组件开发',
    isSystem: false,
    permissionIds: [],
    createdAt: '2025-01-01T08:00:00.000Z',
    updatedAt: '2025-01-01T08:00:00.000Z',
  },
  {
    id: nextId('role'),
    tenantId: 'tenant_1',
    roleCode: 'VIEWER',
    roleName: '访客',
    description: '只读',
    isSystem: false,
    permissionIds: [],
    createdAt: '2025-01-01T08:00:00.000Z',
    updatedAt: '2025-01-01T08:00:00.000Z',
  },
];

export const mockPermissionTree: PermissionNode[] = [
  {
    id: 'p_scene',
    permissionCode: 'scene',
    permissionName: '场景管理',
    resourceType: 'MENU',
    parentId: null,
    path: '/scenes',
    sortOrder: 1,
    children: [
      { id: 'p_scene_view', permissionCode: 'scene:view', permissionName: '查看场景', resourceType: 'BUTTON', parentId: 'p_scene', path: null, sortOrder: 1 },
      { id: 'p_scene_create', permissionCode: 'scene:create', permissionName: '新建场景', resourceType: 'BUTTON', parentId: 'p_scene', path: null, sortOrder: 2 },
      { id: 'p_scene_edit', permissionCode: 'scene:edit', permissionName: '编辑场景', resourceType: 'BUTTON', parentId: 'p_scene', path: null, sortOrder: 3 },
      { id: 'p_scene_delete', permissionCode: 'scene:delete', permissionName: '删除场景', resourceType: 'BUTTON', parentId: 'p_scene', path: null, sortOrder: 4 },
      { id: 'p_scene_publish', permissionCode: 'scene:publish', permissionName: '发布场景', resourceType: 'BUTTON', parentId: 'p_scene', path: null, sortOrder: 5 },
    ],
  },
  {
    id: 'p_component',
    permissionCode: 'component',
    permissionName: '资产与组件',
    resourceType: 'MENU',
    parentId: null,
    path: '/components',
    sortOrder: 2,
    children: [
      { id: 'p_component_view', permissionCode: 'component:view', permissionName: '查看组件', resourceType: 'BUTTON', parentId: 'p_component', path: null, sortOrder: 1 },
      { id: 'p_component_manage', permissionCode: 'component:manage', permissionName: '组件管理', resourceType: 'BUTTON', parentId: 'p_component', path: null, sortOrder: 2 },
      { id: 'p_file_upload', permissionCode: 'file:upload', permissionName: '上传文件', resourceType: 'BUTTON', parentId: 'p_component', path: null, sortOrder: 3 },
      { id: 'p_file_delete', permissionCode: 'file:delete', permissionName: '删除文件', resourceType: 'BUTTON', parentId: 'p_component', path: null, sortOrder: 4 },
    ],
  },
  {
    id: 'p_datasource',
    permissionCode: 'datasource',
    permissionName: '数据接入',
    resourceType: 'MENU',
    parentId: null,
    path: '/data-sources',
    sortOrder: 3,
    children: [
      { id: 'p_datasource_view', permissionCode: 'datasource:view', permissionName: '查看数据源', resourceType: 'BUTTON', parentId: 'p_datasource', path: null, sortOrder: 1 },
      { id: 'p_datasource_manage', permissionCode: 'datasource:manage', permissionName: '数据源管理', resourceType: 'BUTTON', parentId: 'p_datasource', path: null, sortOrder: 2 },
    ],
  },
  {
    id: 'p_system',
    permissionCode: 'system',
    permissionName: '系统管理',
    resourceType: 'MENU',
    parentId: null,
    path: '/system/users',
    sortOrder: 4,
    children: [
      { id: 'p_system_user', permissionCode: 'system:user:manage', permissionName: '用户管理', resourceType: 'BUTTON', parentId: 'p_system', path: null, sortOrder: 1 },
      { id: 'p_system_role', permissionCode: 'system:role:manage', permissionName: '角色管理', resourceType: 'BUTTON', parentId: 'p_system', path: null, sortOrder: 2 },
      { id: 'p_system_log', permissionCode: 'system:log:view', permissionName: '日志查看', resourceType: 'BUTTON', parentId: 'p_system', path: null, sortOrder: 3 },
    ],
  },
];

/* ---------------- 操作日志 ---------------- */
const LOG_MODULES = ['场景管理', '组件管理', '数据源', '系统管理', '文件'];
const LOG_ACTIONS = ['查询', '创建', '更新', '删除', '发布'];
export const mockOperationLogs: OperationLogItem[] = Array.from({ length: 24 }, (_, i) => ({
  id: nextId('log'),
  userId: 'u_1',
  username: i % 2 === 0 ? 'admin' : 'dev_zhang',
  module: LOG_MODULES[i % LOG_MODULES.length],
  action: LOG_ACTIONS[i % LOG_ACTIONS.length],
  requestMethod: 'POST',
  requestUrl: '/api/v1/scenes',
  requestParams: null,
  responseStatus: 200,
  responseTime: 30 + (i % 50),
  ipAddress: '192.168.1.' + (10 + (i % 50)),
  userAgent: 'Mozilla/5.0',
  createdAt: new Date(Date.now() - i * 3600 * 1000).toISOString(),
}));

/* ---------------- 健康状态 ---------------- */
export const mockHealth = {
  status: 'ok' as const,
  uptime: 86400,
  version: '1.0.0',
  dependencies: {
    postgres: { status: 'up' as const, latency: 12 },
    redis: { status: 'up' as const, latency: 3 },
    minio: { status: 'up' as const, latency: 8 },
  },
  timestamp: new Date().toISOString(),
};

/* ---------------- 分页工具 ---------------- */
export function paginate<T>(list: T[], page = 1, limit = 20): PageResult<T> {
  const start = (page - 1) * limit;
  return {
    total: list.length,
    page,
    limit,
    dataList: list.slice(start, start + limit),
  };
}

export { SceneStatus };
