import * as Cesium from 'cesium';
import type {
  CesiumConfig,
  CameraView,
  Cartographic,
  ImageryLayerConfig,
  TilesetConfig,
} from '@dt/shared-types';
import { createImageryLayer } from './imagery';
import { createTileset } from './tileset';

export interface CesiumEngineOptions {
  container: HTMLElement;
  config: CesiumConfig;
  ionToken?: string;
  cesiumBaseUrl: string;
}

/**
 * Cesium 宏观引擎封装。
 * 负责 Viewer 创建、影像/地形/3D Tiles 加载、场景开关与相机控制。
 */
export class CesiumEngine {
  viewer: Cesium.Viewer | undefined;
  private readonly opts: CesiumEngineOptions;
  private config: CesiumConfig;
  /** 影像图层 id → Cesium 图层 映射，用于按配置切换可见性 */
  private readonly imageryMap = new Map<string, Cesium.ImageryLayer>();
  /** 3D Tiles id → 图层 映射 */
  private readonly tilesetMap = new Map<string, Cesium.Cesium3DTileset>();

  constructor(opts: CesiumEngineOptions) {
    this.opts = opts;
    this.config = opts.config;
  }

  async init(): Promise<Cesium.Viewer> {
    // 在任何 Cesium 资源加载前设置静态资源基址（Worker/Asset 等）
    (window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = this.opts.cesiumBaseUrl;
    if (this.opts.ionToken) {
      Cesium.Ion.defaultAccessToken = this.opts.ionToken;
    }

    const viewer = new Cesium.Viewer(this.opts.container, {
      // 关闭默认影像与各类 UI 控件，自行接管
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      creditContainer: document.createElement('div'),
    });
    this.viewer = viewer;

    this.applySceneOptions();
    await this.applyImagery();
    await this.applyTerrain();
    await this.applyTilesets();
    this.applyEnvironment();
    this.flyToInitial();

    return viewer;
  }

  /** 场景基础开关 */
  private applySceneOptions(): void {
    const viewer = this.viewer;
    if (!viewer) return;
    const scene = viewer.scene;
    const s = this.config.scene ?? {};
    if (s.globeShow !== undefined) scene.globe.show = s.globeShow;
    if (s.skyAtmosphere !== undefined && scene.skyAtmosphere) {
      scene.skyAtmosphere.show = s.skyAtmosphere;
    }
    if (s.fxaa !== undefined && scene.postProcessStages.fxaa) {
      scene.postProcessStages.fxaa.enabled = s.fxaa;
    }
    if (s.depthTestAgainstTerrain !== undefined) {
      scene.globe.depthTestAgainstTerrain = s.depthTestAgainstTerrain;
    }
    if (s.maximumScreenSpaceError !== undefined) {
      scene.globe.maximumScreenSpaceError = s.maximumScreenSpaceError;
    }
    // 星空盒 / 太阳 / 月亮：做「空白画布」时必须与地球一起关，否则画布上会残留星空背景。
    if (s.skyBox !== undefined && scene.skyBox) scene.skyBox.show = s.skyBox;
    if (s.sun !== undefined && scene.sun) scene.sun.show = s.sun;
    if (s.moon !== undefined && scene.moon) scene.moon.show = s.moon;
    // 地球隐藏时把场景底色设为透明，露出容器背景（纯 2D 大屏的「空白画布」观感）
    if (s.globeShow === false) {
      scene.backgroundColor = Cesium.Color.TRANSPARENT;
    } else if (s.globeShow === true) {
      scene.backgroundColor = Cesium.Color.BLACK;
    }
  }

  /** 添加全部影像图层 */
  private async applyImagery(): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;
    for (const layerCfg of this.config.imageryLayers) {
      const layer = await createImageryLayer(layerCfg, this.opts.ionToken);
      if (layer) {
        viewer.imageryLayers.add(layer);
        this.imageryMap.set(layerCfg.id, layer);
      }
    }
  }

  /** 地形（可选） */
  private async applyTerrain(): Promise<void> {
    const viewer = this.viewer;
    const terrain = this.config.terrain;
    if (!viewer || !terrain?.enabled || !terrain.url) return;
    try {
      const provider = await Cesium.CesiumTerrainProvider.fromUrl(terrain.url, {
        requestVertexNormals: terrain.requestVertexNormals ?? false,
        requestWaterMask: terrain.requestWaterMask ?? false,
      });
      viewer.terrainProvider = provider;
      if (terrain.exaggeration && Number.isFinite(terrain.exaggeration)) {
        (viewer.scene.globe as unknown as { verticalExaggeration?: number }).verticalExaggeration =
          terrain.exaggeration;
      }
    } catch (err) {
      console.error('[rendering-engine] 地形加载失败:', err);
    }
  }

  /** 3D Tiles（倾斜摄影 / BIM） */
  private async applyTilesets(): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;
    for (const t of this.config.tilesets) {
      const tileset = await createTileset(t);
      if (tileset) {
        viewer.scene.primitives.add(tileset);
        this.tilesetMap.set(t.id, tileset);
      }
    }
  }

  /** 环境特效：雾 / 雨 / 雪 / 光照时间 */
  private applyEnvironment(): void {
    const viewer = this.viewer;
    const env = this.config.environment;
    if (!viewer || !env) return;
    const scene = viewer.scene;

    if (env.fog !== undefined && scene.fog) {
      scene.fog.enabled = env.fog > 0;
      scene.fog.density = env.fog * 0.0006;
    }
    // Scene.rain / Scene.snow 属于部分版本才有的运行时特效属性，类型声明未覆盖
    const withWeather = scene as unknown as {
      rain?: { intensity: number };
      snow?: { intensity: number };
    };
    if (env.rain !== undefined && withWeather.rain) {
      withWeather.rain.intensity = env.rain;
    }
    if (env.snow !== undefined && withWeather.snow) {
      withWeather.snow.intensity = env.snow;
    }
    if (env.enableLighting) {
      scene.globe.enableLighting = true;
    }
    if (env.lightingTime) {
      try {
        viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(env.lightingTime);
      } catch {
        // 时间格式非法时忽略，使用默认时间
      }
    }
  }

  /** 飞到初始视角 */
  private flyToInitial(): void {
    const viewer = this.viewer;
    if (!viewer) return;
    const v = this.config.initialView;
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(v.longitude, v.latitude, v.height),
      orientation: {
        heading: Cesium.Math.toRadians(v.heading),
        pitch: Cesium.Math.toRadians(v.pitch),
        roll: Cesium.Math.toRadians(v.roll),
      },
    });
  }

  /** 读取当前相机视角 */
  getCameraView(): CameraView {
    const viewer = this.viewer;
    if (!viewer) {
      return { longitude: 0, latitude: 0, height: 0, heading: 0, pitch: 0, roll: 0 };
    }
    const carto = viewer.camera.positionCartographic;
    return {
      longitude: Cesium.Math.toDegrees(carto.longitude),
      latitude: Cesium.Math.toDegrees(carto.latitude),
      height: carto.height,
      heading: Cesium.Math.toDegrees(viewer.camera.heading),
      pitch: Cesium.Math.toDegrees(viewer.camera.pitch),
      roll: Cesium.Math.toDegrees(viewer.camera.roll),
    };
  }

  /** 飞到指定视角 */
  flyTo(view: Partial<CameraView>, duration?: number): void {
    const viewer = this.viewer;
    if (!viewer) return;
    const cur = this.getCameraView();
    const target: CameraView = { ...cur, ...view };
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(target.longitude, target.latitude, target.height),
      orientation: {
        heading: Cesium.Math.toRadians(target.heading),
        pitch: Cesium.Math.toRadians(target.pitch),
        roll: Cesium.Math.toRadians(target.roll),
      },
      duration: duration ?? 2,
    });
  }

  /** 按影像图层配置 id 切换可见性 */
  setImageryVisible(id: string, visible: boolean): void {
    const layer = this.imageryMap.get(id);
    if (layer) layer.show = visible;
  }

  /** 按 3D Tiles 配置 id 切换可见性 */
  setTilesetVisible(id: string, visible: boolean): void {
    const tileset = this.tilesetMap.get(id);
    if (tileset) tileset.show = visible;
  }

  /** 当前相机在指定屏幕像素处的地理坐标（用于拾取落点） */
  pickCartographic(x: number, y: number): Cartographic | undefined {
    const viewer = this.viewer;
    if (!viewer) return undefined;
    const cartesian = viewer.scene.pickPosition(new Cesium.Cartesian2(x, y));
    if (!cartesian) return undefined;
    const carto = Cesium.Cartographic.fromCartesian(cartesian);
    return {
      longitude: Cesium.Math.toDegrees(carto.longitude),
      latitude: Cesium.Math.toDegrees(carto.latitude),
      height: carto.height,
    };
  }

  /**
   * 运行时更新配置（仅覆盖已提供的部分）。
   * 除场景开关与环境外，额外协调影像/3D Tiles 图层：
   * 修复「在编辑器删除底图（天地图等）后仍出现在地球上」的问题——
   * 此前只有 init() 会 applyImagery，运行期 applyConfig 从不移除已加图层。
   */
  update(config: CesiumConfig): void {
    this.config = config;
    this.applySceneOptions();
    this.applyEnvironment();
    void this.syncImagery(config.imageryLayers);
    void this.syncTilesets(config.tilesets);
  }

  /**
   * 按最新配置协调影像图层：新增、移除、切换可见性与透明度。
   * 是「删除/隐藏底图即时生效」的关键。
   */
  async syncImagery(configs: ImageryLayerConfig[]): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;
    const desiredIds = new Set(configs.map((c) => c.id));
    // 1) 移除配置中已不存在的图层（用户点了删除）
    for (const [id, layer] of this.imageryMap) {
      if (!desiredIds.has(id)) {
        viewer.imageryLayers.remove(layer);
        this.imageryMap.delete(id);
      }
    }
    // 2) 新增或更新仍在配置中的图层
    for (const cfg of configs) {
      const existing = this.imageryMap.get(cfg.id);
      if (existing) {
        existing.show = cfg.show;
        existing.alpha = cfg.alpha ?? 1;
        existing.brightness = cfg.brightness ?? 1;
      } else if (cfg.show) {
        // 仅当 show=true 才创建（createImageryLayer 对 show=false 会返回 undefined）
        const layer = await createImageryLayer(cfg, this.opts.ionToken);
        if (layer) {
          viewer.imageryLayers.add(layer);
          this.imageryMap.set(cfg.id, layer);
        }
      }
    }
  }

  /**
   * 按最新配置协调 3D Tiles 图层：移除已删除的、新增 show=true 的。
   * 与 syncImagery 同属「图层增删运行期生效」修复。
   */
  async syncTilesets(configs: TilesetConfig[]): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;
    const desiredIds = new Set(configs.map((c) => c.id));
    for (const [id, tileset] of this.tilesetMap) {
      if (!desiredIds.has(id)) {
        viewer.scene.primitives.remove(tileset);
        this.tilesetMap.delete(id);
      }
    }
    for (const cfg of configs) {
      if (this.tilesetMap.has(cfg.id) || !cfg.show) continue;
      const tileset = await createTileset(cfg);
      if (tileset) {
        viewer.scene.primitives.add(tileset);
        this.tilesetMap.set(cfg.id, tileset);
      }
    }
  }

  /** 释放 Viewer（必须在 destroy 时调用） */
  destroy(): void {
    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.destroy();
    }
    this.viewer = undefined;
    this.imageryMap.clear();
    this.tilesetMap.clear();
  }
}
