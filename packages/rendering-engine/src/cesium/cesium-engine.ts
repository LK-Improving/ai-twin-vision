import * as Cesium from 'cesium';
import type { CesiumConfig, CameraView, Cartographic } from '@dt/shared-types';
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

  /** 运行时更新配置（仅覆盖已提供的部分） */
  update(config: CesiumConfig): void {
    this.config = config;
    this.applySceneOptions();
    this.applyEnvironment();
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
