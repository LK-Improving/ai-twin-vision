/**
 * 双引擎（Cesium 宏观 + Three.js 微观）场景配置契约
 * 对应 biz_scene.engine_config (JSONB)
 */

/** 经纬高坐标（WGS84） */
export interface Cartographic {
  longitude: number;
  latitude: number;
  height: number;
}

/** 三维向量 */
export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

/** 空间变换：位置 + 旋转 + 缩放，对应 biz_scene_component.position */
export interface Transform {
  /** 地理位置，宏观场景使用 */
  cartographic?: Cartographic;
  /** 局部坐标，微观场景使用（单位：米） */
  position?: Vector3Like;
  /** 欧拉角（单位：度） */
  rotation?: Vector3Like;
  /** 缩放比例 */
  scale?: Vector3Like | number;
}

/** 相机视角 */
export interface CameraView {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}

/** Cesium 宏观引擎配置 */
export interface CesiumConfig {
  enabled: boolean;
  /** Ion Token，留空则使用离线/自建瓦片 */
  ionToken?: string;
  /** 底图影像图层 */
  imageryLayers: ImageryLayerConfig[];
  /** 地形服务 */
  terrain: {
    enabled: boolean;
    url?: string;
    /** 是否开启地形光照与水面遮罩 */
    requestWaterMask?: boolean;
    requestVertexNormals?: boolean;
    exaggeration?: number;
  };
  /** 3D Tiles 图层（倾斜摄影 / BIM 切片） */
  tilesets: TilesetConfig[];
  /** 初始相机视角 */
  initialView: CameraView;
  /** 场景基础开关 */
  scene?: {
    globeShow?: boolean;
    skyAtmosphere?: boolean;
    fxaa?: boolean;
    /** 深度检测，保证贴地要素不被地形遮挡 */
    depthTestAgainstTerrain?: boolean;
    maximumScreenSpaceError?: number;
    /**
     * 星空盒 / 太阳 / 月亮。
     * 关掉「地球」做纯 2D 大屏设计时，必须连同这几项一起关，
     * 否则画布上仍会残留星空背景，做不到「空白画布」。
     */
    skyBox?: boolean;
    sun?: boolean;
    moon?: boolean;
  };
  /** 环境特效 */
  environment: {
    /** 雨雪雾强度 0-1 */
    rain?: number;
    snow?: number;
    fog?: number;
    /** 时间轴光照 ISO 时间 */
    lightingTime?: string;
    enableLighting?: boolean;
  };
}

/** 影像图层配置 */
export interface ImageryLayerConfig {
  id: string;
  name: string;
  /** WMTS / TMS / XYZ / ARCGIS / SINGLE_TILE */
  provider: 'XYZ' | 'WMTS' | 'TMS' | 'ARCGIS' | 'SINGLE_TILE' | 'ION';
  url?: string;
  /** ION 资源 ID */
  assetId?: number;
  layer?: string;
  style?: string;
  format?: string;
  tileMatrixSetID?: string;
  maximumLevel?: number;
  alpha?: number;
  brightness?: number;
  show: boolean;
}

/** 3D Tiles 配置 */
export interface TilesetConfig {
  id: string;
  name: string;
  url: string;
  show: boolean;
  /** 屏幕空间误差，越大越省性能 */
  maximumScreenSpaceError?: number;
  /** 显存上限 MB */
  cacheBytes?: number;
  /** 高度偏移（米） */
  heightOffset?: number;
  /** 自定义着色 */
  colorBlendMode?: 'HIGHLIGHT' | 'REPLACE' | 'MIX';
  style?: Record<string, unknown>;
}

/** Three.js 微观引擎配置 */
export interface ThreeConfig {
  enabled: boolean;
  /** 渲染器参数 */
  renderer?: {
    antialias?: boolean;
    /** 像素比上限，移动端建议 <= 2 */
    pixelRatioLimit?: number;
    shadowMap?: boolean;
    toneMapping?: 'NONE' | 'LINEAR' | 'REINHARD' | 'CINEON' | 'ACES_FILMIC';
    exposure?: number;
  };
  /** 环境与光照 */
  environment: {
    background?: string;
    /** HDR 环境贴图地址 */
    envMapUrl?: string;
    ambientIntensity?: number;
    directionalIntensity?: number;
    directionalPosition?: Vector3Like;
    /** 色调映射：ACES 电影感 / Reinhard / 线性 */
    toneMapping?: 'ACES_FILMIC' | 'REINHARD' | 'CINEON' | 'LINEAR' | 'NONE';
    /** 曝光强度，配合 toneMapping 使用 */
    exposure?: number;
  };
  /** 后处理特效 */
  postProcessing: {
    bloom?: boolean;
    outline?: boolean;
    ssao?: boolean;
  };
  /** 模型 LOD 策略 */
  lod: LodConfig;
  /** 微观场景在宏观地图上的锚点，用于双引擎坐标同步 */
  anchor?: Cartographic;
}

/** LOD（多细节层次）配置 */
export interface LodConfig {
  enabled: boolean;
  /** 距离阈值（米）→ 使用的模型层级，由近到远 */
  levels: Array<{ distance: number; detail: 'HIGH' | 'MEDIUM' | 'LOW' | 'HIDDEN' }>;
  /** 低于该 FPS 触发自动降级 */
  autoDegradeFps?: number;
  /** 超过该显存（MB）触发降级 */
  autoDegradeMemoryMb?: number;
}

/** 默认 LOD 策略（引擎在配置缺省时回落到此值） */
export const DEFAULT_LOD_CONFIG: LodConfig = {
  enabled: true,
  levels: [
    { distance: 100, detail: 'HIGH' },
    { distance: 500, detail: 'MEDIUM' },
    { distance: 2000, detail: 'LOW' },
    { distance: 10000, detail: 'HIDDEN' },
  ],
  autoDegradeFps: 30,
  autoDegradeMemoryMb: 2048,
};

/**
 * 三维渲染性能指标（详细设计 6.3 三维渲染性能监控）
 * 引擎每秒上报一次，编辑器状态栏与监控告警共用。
 */
export interface PerfStats {
  /** 当前帧率 */
  fps: number;
  /** JS 堆内存占用（MB） */
  memoryMb: number;
  /** 单帧 Draw Call 数量 */
  drawCalls: number;
  /** 三角面数 */
  triangles: number;
  /** 场景实体数量 */
  entityCount: number;
}

/** 图层（用于组件分组管理） */
export interface SceneLayer {
  id: string;
  name: string;
  visible: boolean;
  locked?: boolean;
  sortOrder: number;
  /** 所属引擎 */
  engine: 'CESIUM' | 'THREE' | 'DOM';
  parentId?: string | null;
}

/** 场景引擎总配置 */
export interface EngineConfig {
  cesium: CesiumConfig;
  threejs: ThreeConfig;
  layers: SceneLayer[];
  /** 2D 大屏画布尺寸与适配策略 */
  canvas?: {
    width: number;
    height: number;
    /** 缩放适配：等比 / 铺满 / 自适应宽度 */
    fitMode: 'CONTAIN' | 'FILL' | 'WIDTH';
    background?: string;
  };
  /** 性能预算与降级阈值（详细设计 3.4） */
  performance?: {
    targetFps: number;
    minFps: number;
    maxMemoryMb: number;
    maxDrawCall?: number;
  };
}

/** 默认引擎配置，创建场景时作为初始值 */
export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  cesium: {
    enabled: true,
    imageryLayers: [
      {
        id: 'base-imagery',
        name: '天地图影像',
        provider: 'XYZ',
        url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
        show: true,
        alpha: 1,
        maximumLevel: 18,
      },
    ],
    terrain: { enabled: false },
    tilesets: [],
    initialView: {
      longitude: 116.397428,
      latitude: 39.90923,
      height: 2000,
      heading: 0,
      pitch: -35,
      roll: 0,
    },
    scene: {
      globeShow: true,
      skyAtmosphere: true,
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
      ambientIntensity: 0.6,
      directionalIntensity: 1.2,
      directionalPosition: { x: 50, y: 80, z: 50 },
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
    anchor: { longitude: 116.397428, latitude: 39.90923, height: 0 },
  },
  layers: [
    { id: 'layer-gis', name: 'GIS 图层', visible: true, sortOrder: 0, engine: 'CESIUM' },
    { id: 'layer-model', name: '精细模型', visible: true, sortOrder: 1, engine: 'THREE' },
    { id: 'layer-ui', name: '大屏面板', visible: true, sortOrder: 2, engine: 'DOM' },
  ],
  canvas: { width: 1920, height: 1080, fitMode: 'CONTAIN', background: 'transparent' },
  performance: { targetFps: 60, minFps: 30, maxMemoryMb: 2048, maxDrawCall: 3000 },
};

/** 递归可选（用于只提交局部配置，后端会与默认配置 deepMerge） */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/**
 * 「空白画布」预设：不渲染三维地球 / 星空 / 大气，只留一块无限 2D 设计画布。
 *
 * 使用场景：纯大屏搭建（往画布上摆自己的图表、面板、模型组件），
 * 而不是数字孪生地球大屏。把它作为 scene 创建时的 config 提交即可，
 * 之后随时可以在编辑器里用「地球」开关切回来（影像图层配置不会被删）。
 */
export const BLANK_CANVAS_OVERRIDE: DeepPartial<EngineConfig> = {
  cesium: {
    scene: {
      globeShow: false,
      skyAtmosphere: false,
      skyBox: false,
      sun: false,
      moon: false,
    },
  },
};

/** 判断当前引擎配置是否处于「空白画布」状态（地球不可见） */
export function isBlankCanvas(config: Partial<EngineConfig> | undefined | null): boolean {
  if (!config?.cesium?.scene) return false;
  return config.cesium.scene.globeShow === false;
}
