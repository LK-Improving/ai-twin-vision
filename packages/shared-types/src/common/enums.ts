/** 通用启用/禁用状态 */
export enum CommonStatus {
  DISABLED = 0,
  ENABLED = 1,
}

/** 场景状态：0-草稿，1-已发布（对应 biz_scene.status） */
export enum SceneStatus {
  DRAFT = 0,
  PUBLISHED = 1,
  ARCHIVED = 2,
}

/** 场景状态的对外字符串表示（API 契约使用） */
export const SCENE_STATUS_TEXT: Record<SceneStatus, 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'> = {
  [SceneStatus.DRAFT]: 'DRAFT',
  [SceneStatus.PUBLISHED]: 'PUBLISHED',
  [SceneStatus.ARCHIVED]: 'ARCHIVED',
};

/** 场景类型：宏观 GIS / 微观精细 / 双引擎融合 */
export enum SceneType {
  MACRO = 'MACRO',
  MICRO = 'MICRO',
  HYBRID = 'HYBRID',
}

/** 低代码组件类型 */
export enum ComponentType {
  // 三维类
  MODEL_3D = 'MODEL_3D',
  TILES_3D = 'TILES_3D',
  TERRAIN = 'TERRAIN',
  POI = 'POI',
  PATH = 'PATH',
  PARTICLE = 'PARTICLE',
  // 二维图表类
  CHART_LINE = 'CHART_LINE',
  CHART_BAR = 'CHART_BAR',
  CHART_PIE = 'CHART_PIE',
  CHART_GAUGE = 'CHART_GAUGE',
  // UI 类
  TEXT = 'TEXT',
  METRIC_CARD = 'METRIC_CARD',
  TABLE = 'TABLE',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  BUTTON = 'BUTTON',
  PANEL = 'PANEL',
  IFRAME = 'IFRAME',
  // 新增：可复用科技大屏组件
  NAV_TABS = 'NAV_TABS',
  ALERT_LIST = 'ALERT_LIST',
  POI_MARKER = 'POI_MARKER',
  TOP_BAR = 'TOP_BAR',
  PROGRESS_LIST = 'PROGRESS_LIST',
  STAT_BLOCK = 'STAT_BLOCK',
}

/** 组件所属大类 */
export enum ComponentCategory {
  SCENE_3D = 'SCENE_3D',
  CHART = 'CHART',
  UI = 'UI',
  MEDIA = 'MEDIA',
  CUSTOM = 'CUSTOM',
}

/** 数据源类型（biz_data_source.type） */
export enum DataSourceType {
  PG = 'PG',
  MYSQL = 'MYSQL',
  HTTP = 'HTTP',
  WEBSOCKET = 'WEBSOCKET',
  MQTT = 'MQTT',
  OPC_UA = 'OPC-UA',
  MODBUS = 'MODBUS',
  STATIC = 'STATIC',
}

/** IoT 协议 */
export enum DeviceProtocol {
  MQTT = 'MQTT',
  OPC_UA = 'OPC-UA',
  MODBUS = 'MODBUS',
  HTTP = 'HTTP',
}

/** 在线状态 */
export enum OnlineStatus {
  OFFLINE = 0,
  ONLINE = 1,
}

/** 告警级别 */
export enum AlertLevel {
  INFO = 1,
  WARNING = 2,
  MAJOR = 3,
  CRITICAL = 4,
}

/** 存储类型 */
export enum StorageType {
  LOCAL = 'LOCAL',
  S3 = 'S3',
}

/** 3D 资产格式 */
export enum ModelAssetType {
  GLTF = 'GLTF',
  GLB = 'GLB',
  FBX = 'FBX',
  OBJ = 'OBJ',
  TILES_3D = '3DTILES',
}

/** 权限资源类型 */
export enum ResourceType {
  MENU = 'MENU',
  BUTTON = 'BUTTON',
  API = 'API',
}

/** 内置角色编码 */
export enum RoleCode {
  SUPER_ADMIN = 'SUPER_ADMIN',
  TENANT_ADMIN = 'TENANT_ADMIN',
  DEVELOPER = 'DEVELOPER',
  VIEWER = 'VIEWER',
}

/** 权限编码常量（与 sys_permission.permission_code 对应） */
export const Permissions = {
  SCENE_VIEW: 'scene:view',
  SCENE_CREATE: 'scene:create',
  SCENE_EDIT: 'scene:edit',
  SCENE_DELETE: 'scene:delete',
  SCENE_PUBLISH: 'scene:publish',
  AI_SCENE_GENERATE: 'ai:scene:generate',
  COMPONENT_VIEW: 'component:view',
  COMPONENT_MANAGE: 'component:manage',
  DATASOURCE_VIEW: 'datasource:view',
  DATASOURCE_MANAGE: 'datasource:manage',
  DEVICE_VIEW: 'device:view',
  DEVICE_MANAGE: 'device:manage',
  FILE_UPLOAD: 'file:upload',
  FILE_DELETE: 'file:delete',
  SYSTEM_USER_MANAGE: 'system:user:manage',
  SYSTEM_ROLE_MANAGE: 'system:role:manage',
  SYSTEM_LOG_VIEW: 'system:log:view',
} as const;

export type PermissionCode = (typeof Permissions)[keyof typeof Permissions];
