import * as Cesium from 'cesium';
import * as THREE from 'three';
import type {
  EngineConfig,
  SceneComponentInstance,
  CameraView,
  PerfStats,
  Cartographic,
} from '@dt/shared-types';
import { ComponentType, DEFAULT_LOD_CONFIG } from '@dt/shared-types';

import { EventBus } from './event-bus';
import { EntityManager } from './entity-manager';
import type { TwinEntity, HighlightOptions } from '../types';

import { CesiumEngine } from '../cesium/cesium-engine';
import { createTileset } from '../cesium/tileset';
import { ThreeEngine } from '../three/three-engine';
import { ModelLoader } from '../three/model-loader';
import { LodController } from '../three/lod-controller';
import { EffectFactory } from '../three/effects';
import { CoordinateTransform, toCesiumCartesian } from '../fusion/coordinate';
import { CameraSync } from '../fusion/camera-sync';
import { Picker } from '../interaction/picker';
import { RoamController } from '../interaction/roam';
import { PerformanceMonitor } from '../perf/monitor';

import { degToRad, normalizeScale } from '../utils/is';

/** TwinViewer 构造选项（对外签名不可改） */
export interface TwinViewerOptions {
  container: HTMLElement;
  config: EngineConfig;
  cesiumBaseUrl?: string;
  ionToken?: string;
  /** 只读预览模式：禁用编辑态辅助（目前影响拾取外的后续扩展） */
  readonly?: boolean;
}

/** 对外事件名联合（与 index.ts 中导出保持一致） */
export type TwinEventName =
  | 'ready'
  | 'click'
  | 'dblclick'
  | 'hover'
  | 'camera-change'
  | 'entity-added'
  | 'entity-removed'
  | 'stats'
  | 'degrade'
  | 'error';

/** 拾取结果（与 index.ts 中导出保持一致） */
export interface PickResult {
  entityId?: string;
  componentId?: string;
  engine: 'CESIUM' | 'THREE';
  cartographic?: Cartographic;
  screen: { x: number; y: number };
  raw?: unknown;
}

/** 二维大屏组件类型（由 DOM 层渲染，引擎跳过） */
const DOM_COMPONENT_TYPES = new Set<string>([
  ComponentType.CHART_LINE,
  ComponentType.CHART_BAR,
  ComponentType.CHART_PIE,
  ComponentType.CHART_GAUGE,
  ComponentType.TEXT,
  ComponentType.METRIC_CARD,
  ComponentType.TABLE,
  ComponentType.IMAGE,
  ComponentType.VIDEO,
  ComponentType.BUTTON,
  ComponentType.PANEL,
  ComponentType.IFRAME,
]);

/**
 * 双引擎渲染主入口。
 *
 * 编排 Cesium（宏观）/ Three（微观）两大子系统，以及实体注册表、坐标同步、
 * 统一拾取、性能监控、LOD 与特效。所有对外 API 签名见顶部类型定义，不可更改。
 */
export class TwinViewer {
  readonly container: HTMLElement;
  private options: TwinViewerOptions;
  private config: EngineConfig;
  private anchor: Cartographic;

  private cesiumEngine: CesiumEngine | undefined;
  private threeEngine: ThreeEngine | undefined;
  private modelLoader: ModelLoader | undefined;
  private lodController: LodController | undefined;
  private monitor: PerformanceMonitor | undefined;
  private picker: Picker | undefined;
  private roam: RoamController | undefined;
  private cameraSync: CameraSync | undefined;

  private readonly entityManager = new EntityManager();
  private readonly bus = new EventBus();

  private ready = false;
  private running = false;
  private rafId = 0;
  private lastTime = 0;
  private lodAccum = 0;
  private cameraAccum = 0;
  /** 绑定到三维模型的 POI 数量（>0 时才在渲染循环里同步位置） */
  private attachedPoiCount = 0;
  private poiAccum = 0;
  private highlightedId: string | undefined;

  static async create(options: TwinViewerOptions): Promise<TwinViewer> {
    const viewer = new TwinViewer(options);
    await viewer.init();
    return viewer;
  }

  constructor(options: TwinViewerOptions) {
    this.options = options;
    this.container = options.container;
    this.config = options.config;
    // 锚点优先取 threejs.anchor，否则回退到 Cesium 初始视角
    this.anchor = this.config.threejs.anchor ?? { ...this.config.cesium.initialView };
  }

  // ----------------------------------------------------------------- 初始化

  private async init(): Promise<void> {
    try {
      if (this.config.cesium.enabled) {
        this.cesiumEngine = new CesiumEngine({
          container: this.container,
          config: this.config.cesium,
          ionToken: this.options.ionToken,
          cesiumBaseUrl: this.options.cesiumBaseUrl ?? '/cesium/',
        });
        await this.cesiumEngine.init();
      }

      if (this.config.threejs.enabled) {
        this.threeEngine = new ThreeEngine({
          container: this.container,
          config: this.config.threejs,
        });
        this.modelLoader = new ModelLoader({ renderer: this.threeEngine.renderer });
        // 双引擎融合要求 Cesium 已就绪；若 Cesium 关闭则微观场景无地理锚定，跳过相机同步
        if (this.cesiumEngine?.viewer) {
          this.cameraSync = new CameraSync(
            this.cesiumEngine.viewer,
            this.threeEngine.camera,
            this.anchor,
          );
        }
      }

      // LOD 控制器
      this.lodController = new LodController(this.config.threejs.lod ?? DEFAULT_LOD_CONFIG);

      // 性能监控
      this.monitor = new PerformanceMonitor({
        entityCount: () => this.entityManager.size,
        renderer: this.threeEngine?.renderer,
        minFps: this.config.performance?.minFps ?? 0,
        onStats: (stats) => this.bus.emit('stats', stats),
        onDegrade: (reason) => this.handleDegrade(reason),
      });

      // 统一拾取
      if (this.cesiumEngine?.viewer && this.threeEngine) {
        this.picker = new Picker({
          container: this.container,
          threeScene: this.threeEngine.scene,
          threeCamera: this.threeEngine.camera,
          cesiumViewer: this.cesiumEngine.viewer,
          readonly: this.options.readonly,
          getEntityIdByObject: (obj) => this.findEntityRootId(obj),
          getComponentId: (entityId) => this.entityManager.get(entityId)?.instance.componentId,
          onPick: (event, result) => this.bus.emit(event, result),
        });
        this.picker.attach();
      }

      // 路径漫游
      if (this.cesiumEngine?.viewer) {
        this.roam = new RoamController(this.cesiumEngine.viewer, this.anchor);
      }

      this.ready = true;
      this.startLoop();
      this.bus.emit('ready', undefined);
    } catch (err) {
      this.bus.emit('error', { message: 'TwinViewer 初始化失败', error: err });
      throw err;
    }
  }

  // ----------------------------------------------------------- 主渲染循环

  private startLoop(): void {
    this.running = true;
    this.lastTime = performance.now();
    const loop = () => {
      if (!this.running) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;

      // 相机同步 + Three 渲染
      if (this.threeEngine) {
        this.cameraSync?.sync();
        this.threeEngine.render(dt);
      }

      // LOD 切换（约每 200ms 一次，避免逐帧抖动）
      this.lodAccum += dt;
      if (this.lodAccum >= 0.2) {
        this.lodAccum = 0;
        this.updateLod();
      }

      // 绑定在三维模型上的 POI：跟随父模型变换（拖拽/旋转/LOD 换模都能跟上）
      if (this.attachedPoiCount > 0) {
        this.poiAccum += dt;
        if (this.poiAccum >= 0.1) {
          this.poiAccum = 0;
          this.syncAttachedPois();
        }
      }

      // 性能监控与相机变化事件
      if (this.monitor) this.monitor.tick(dt);
      this.cameraAccum += dt;
      if (this.cameraAccum >= 0.1 && this.cesiumEngine?.viewer) {
        this.cameraAccum = 0;
        this.bus.emit('camera-change', this.getCameraView());
      }

      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  // --------------------------------------------------------------- 实体分派

  /** 添加实体，按 componentType 分派到对应引擎 */
  async addEntity(instance: SceneComponentInstance): Promise<void> {
    if (!this.ready) {
      console.warn('[rendering-engine] addEntity 在 ready 之前调用，已忽略');
      return;
    }
    const type = instance.componentType ?? '';
    const entity: TwinEntity = {
      id: instance.id,
      instance,
      engine: 'THREE',
      layerId: instance.layerId,
      visible: instance.visible ?? true,
    };

    try {
      switch (type) {
        case ComponentType.MODEL_3D:
          await this.addModelEntity(entity);
          break;
        case ComponentType.TILES_3D:
          await this.addTilesEntity(entity);
          break;
        case ComponentType.POI:
          this.addPoiEntity(entity);
          break;
        case ComponentType.PATH:
          this.addPathEntity(entity);
          break;
        case ComponentType.PARTICLE:
          this.addParticleEntity(entity);
          break;
        case ComponentType.TERRAIN:
          console.debug('[rendering-engine] TERRAIN 由全局地形配置渲染，跳过单实体');
          return;
        default:
          if (DOM_COMPONENT_TYPES.has(type)) {
            console.debug(`[rendering-engine] 组件类型 ${type} 由 DOM 层渲染，引擎跳过`);
          } else {
            console.warn(`[rendering-engine] 未知组件类型 ${type}，已忽略`);
          }
          return;
      }
      this.entityManager.register(entity);
      this.applyEntityVisibility(entity);
      // 模型就位后立刻纠正挂在其上的 POI（POI 可能先于模型被添加）
      if (type === ComponentType.MODEL_3D) this.syncAttachedPois(entity.id);
      this.bus.emit('entity-added', { id: entity.id, engine: entity.engine });
    } catch (err) {
      this.bus.emit('error', { message: `实体 ${instance.id} 添加失败`, error: err });
    }
  }

  private async addModelEntity(entity: TwinEntity): Promise<void> {
    if (!this.threeEngine || !this.modelLoader) {
      console.warn('[rendering-engine] Three 引擎未启用，无法渲染 MODEL_3D');
      return;
    }
    const cfg = entity.instance.componentConfig;
    const lod = cfg.lodLevels as Record<string, string> | undefined;
    const single = (cfg.modelUrl ?? cfg.url) as string | undefined;
    let url = single;
    if (lod && (lod.HIGH || lod.MEDIUM)) {
      url = (lod.HIGH ?? lod.MEDIUM) as string;
    }
    if (!url) {
      // 未选择模型时放一个线框占位体：让「已添加但未配置」的三维组件在画布上可见、可点选，
      // 而不是空无一物（选中该组件后在属性面板「选择模型」即可替换为真实模型）。
      console.warn(`[rendering-engine] MODEL_3D ${entity.id} 缺少模型地址，已用占位体代替`);
      this.addPlaceholder(entity, 40);
      return;
    }
    let obj: THREE.Object3D;
    try {
      obj = await this.modelLoader.load(url);
    } catch (err) {
      // 加载失败（404 / 解析异常）时不要留白：降级为占位体并上报，便于在控制台定位问题。
      console.warn(
        `[rendering-engine] MODEL_3D ${entity.id} 模型加载失败，已用占位体代替：${url}`,
        err,
      );
      this.bus.emit('error', { message: `模型加载失败：${url}`, error: err });
      this.addPlaceholder(entity, 40);
      return;
    }
    this.applyTransform(obj, entity.instance.position);
    obj.userData.entityId = entity.id;
    this.threeEngine.scene.add(obj);
    entity.threeObject = obj;
    entity.modelUrl = url;
    entity.engine = 'THREE';
    entity.currentDetail = 'HIGH';
  }

  /**
   * 未选择模型时的占位体：线框立方体 + 地面参考环。
   * 目的：让「已添加但未配置 modelUrl」的三维组件在画布上可见、可点选，
   * 而不是加进去却一片空白（选中后到属性面板「选择模型」即可换成真实模型）。
   * 注意不写 entity.modelUrl，因此不会被 ModelLoader 的引用计数误释放。
   */
  private addPlaceholder(entity: TwinEntity, size: number): void {
    if (!this.threeEngine) return;
    const group = new THREE.Group();
    group.name = `placeholder:${entity.id}`;

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshBasicMaterial({
        color: 0x00eaff,
        wireframe: true,
        transparent: true,
        opacity: 0.85,
      }),
    );
    box.position.y = size / 2;
    group.add(box);

    // 地面圆环：便于判断占位体的落点与朝向
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(size * 0.62, size * 0.72, 32),
      new THREE.MeshBasicMaterial({
        color: 0x00eaff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    group.add(ring);

    group.userData.entityId = entity.id;
    group.userData.placeholder = true;

    this.applyTransform(group, entity.instance.position);
    this.threeEngine.scene.add(group);
    entity.threeObject = group;
    entity.engine = 'THREE';
    entity.currentDetail = 'HIGH';
  }

  /** 释放占位体的几何体与材质（真实模型由 ModelLoader 引用计数统一托管，无需在此释放） */
  private disposePlaceholder(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }

  private async addTilesEntity(entity: TwinEntity): Promise<void> {
    if (!this.cesiumEngine?.viewer) {
      console.warn('[rendering-engine] Cesium 引擎未启用，无法渲染 TILES_3D');
      return;
    }
    const cfg = entity.instance.componentConfig;
    const url = cfg.url as string | undefined;
    if (!url) {
      console.warn(`[rendering-engine] TILES_3D ${entity.id} 缺少 url`);
      return;
    }
    const tileset = await createTileset({
      id: entity.id,
      name: entity.instance.name ?? entity.id,
      url,
      show: true,
      maximumScreenSpaceError: cfg.maximumScreenSpaceError as number | undefined,
      heightOffset: cfg.heightOffset as number | undefined,
      colorBlendMode: cfg.colorBlendMode as 'HIGHLIGHT' | 'REPLACE' | 'MIX' | undefined,
      style: cfg.style as Record<string, unknown> | undefined,
    });
    if (tileset) {
      this.cesiumEngine.viewer.scene.primitives.add(tileset);
      entity.cesiumRef = tileset;
      entity.engine = 'CESIUM';
    }
  }

  private addPoiEntity(entity: TwinEntity): Promise<void> {
    const viewer = this.cesiumEngine?.viewer;
    if (!viewer) {
      console.warn('[rendering-engine] Cesium 引擎未启用，无法渲染 POI');
      return Promise.resolve();
    }
    const cfg = entity.instance.componentConfig;
    // 未显式绑定模型时，尝试自动吸附：落在模型包围盒内的标注自动跟随该模型
    this.tryAutoBindPoi(entity);
    // 优先：绑定到三维模型（parentId + localOffset），位置由模型当前变换实时解算，
    // 这样模型被拖动/旋转时标注会跟着走，而不是钉在绝对经纬度上。
    const attached = this.resolveAttachedPoi(entity);
    let position: Cesium.Cartesian3;
    if (attached) {
      entity.instance.position.cartographic = attached;
      position = Cesium.Cartesian3.fromDegrees(
        attached.longitude,
        attached.latitude,
        attached.height,
      );
      this.attachedPoiCount += 1;
    } else if (entity.instance.position.cartographic) {
      const c = entity.instance.position.cartographic;
      position = Cesium.Cartesian3.fromDegrees(c.longitude, c.latitude, c.height);
    } else {
      const lng = (cfg.longitude as number) ?? 0;
      const lat = (cfg.latitude as number) ?? 0;
      const h = (cfg.height as number) ?? 0;
      position = Cesium.Cartesian3.fromDegrees(lng, lat, h);
    }

    const label = (cfg.label as string) ?? entity.instance.name ?? '';
    const colorCss = (cfg.color as string) ?? '#00eaff';
    // 程序化生成发光定位针（针尖精确对齐到坐标点），不再依赖场景里粗糙的 SVG
    const pinCanvas = this.makePoiPinCanvas(colorCss);
    const w = Math.max(Number(cfg.width ?? 34), 30);
    const h = Math.round((w * 96) / 72); // 保持 72x96 画布比例
    const baseColor = Cesium.Color.fromCssColorString(colorCss);
    const PERIOD = 2000;
    const phase = () => (performance.now() % PERIOD) / PERIOD;

    const cesiumEntity = viewer.entities.add({
      position,
      id: entity.id,
      // 定位针：针尖朝下的发光水滴，始终压在模型/地形之上不被遮挡
      billboard: {
        image: pinCanvas,
        width: w,
        height: h,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: cfg.scaleByDistance
          ? new Cesium.NearFarScalar(600, 1.15, 4500, 0.55)
          : undefined,
      },
      // 文字气泡：带半透明底，压在定位针上方，保证任何背景下都清晰可读
      label: label
        ? {
            text: label,
            font: '600 15px "Microsoft YaHei", "PingFang SC", sans-serif',
            fillColor: Cesium.Color.WHITE,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineColor: Cesium.Color.fromCssColorString('#03101f'),
            outlineWidth: 3,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -(h + 6)),
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString('#04121f').withAlpha(0.8),
            backgroundPadding: new Cesium.Cartesian2(10, 5),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: cfg.scaleByDistance
              ? new Cesium.NearFarScalar(600, 1.0, 4500, 0.7)
              : undefined,
          }
        : undefined,
      // 脉冲环：以锚点为圆心向外扩散并淡出，与标注共用 position，自动跟随模型
      point: {
        pixelSize: new Cesium.CallbackProperty(() => 8 + phase() * 40, false),
        color: new Cesium.CallbackProperty(() => baseColor.withAlpha((1 - phase()) * 0.5), false),
        outlineColor: new Cesium.CallbackProperty(
          () => baseColor.withAlpha((1 - phase()) * 0.9),
          false,
        ),
        outlineWidth: new Cesium.CallbackProperty(() => phase() * 5, false),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    entity.cesiumRef = cesiumEntity;
    entity.engine = 'CESIUM';
    return Promise.resolve();
  }

  /**
   * 程序化生成发光定位针（canvas）。
   * 形状为针尖朝下的水滴：针尖固定在画布底部，配合 billboard 的
   * verticalOrigin=BOTTOM 即可让针尖精确落在坐标点上。
   */
  private makePoiPinCanvas(colorCss: string): HTMLCanvasElement {
    const W = 72;
    const H = 96;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const cx = W / 2;
    const tipY = H - 6;
    const headCy = 38;
    const headR = 22;
    const col = colorCss || '#00eaff';

    ctx.clearRect(0, 0, W, H);
    // 外发光主体
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(cx, tipY);
    ctx.quadraticCurveTo(cx - headR - 4, headCy + 10, cx - headR, headCy);
    ctx.arc(cx, headCy, headR, Math.PI, 0, true);
    ctx.quadraticCurveTo(cx + headR + 4, headCy + 10, cx, tipY);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
    // 白色描边
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    // 内圈高光点
    ctx.beginPath();
    ctx.arc(cx, headCy, headR - 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    return canvas;
  }

  /**
   * 读取 POI 的「跟随模型」配置。
   * componentConfig.parentId 指向 MODEL_3D 实体，localOffset 是模型自身局部坐标（glTF：Y 轴朝上）中的偏移。
   */
  private attachedPoiConfig(entity: TwinEntity): { parentId: string; local: THREE.Vector3 } | null {
    const cfg = entity.instance.componentConfig;
    const parentId = cfg.parentId as string | undefined;
    const off = cfg.localOffset as { x?: number; y?: number; z?: number } | undefined;
    if (!parentId || !off) return null;
    return { parentId, local: new THREE.Vector3(off.x ?? 0, off.y ?? 0, off.z ?? 0) };
  }

  /**
   * 自动吸附：若标注既没有显式绑定、又落在某个三维模型的包围盒内，
   * 就按「模型局部偏移」把它绑定到该模型，之后模型移动标注自动跟随。
   * 手动摆放的标注（编辑器中在地图上打点）走的正是这条路径，无需额外配置。
   */
  private tryAutoBindPoi(entity: TwinEntity): void {
    const cfg = entity.instance.componentConfig;
    if (cfg.parentId && cfg.localOffset) return;
    const carto = entity.instance.position.cartographic;
    if (!carto) return;
    const world = CoordinateTransform.wgs84ToLocal(carto, this.anchor);
    let best: { id: string; local: THREE.Vector3; d: number } | null = null;
    for (const model of this.entityManager.list()) {
      if ((model.instance.componentType ?? '') !== ComponentType.MODEL_3D) continue;
      const obj = model.threeObject;
      if (!obj) continue;
      obj.updateMatrixWorld(true);
      const local = obj.worldToLocal(world.clone());
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) continue;
      // 楼顶标注通常略高于模型包围盒，纵向放宽一些再判断
      box.expandByScalar(30);
      if (!box.containsPoint(local)) continue;
      if (!best || local.length() < best.d) best = { id: model.id, local, d: local.length() };
    }
    if (!best) return;
    cfg.parentId = best.id;
    cfg.localOffset = { x: best.local.x, y: best.local.y, z: best.local.z };
    console.debug(`[rendering-engine] POI ${entity.id} 自动绑定到模型 ${best.id}`);
  }

  /** 用父模型当前的世界变换解算 POI 的经纬高（模型被拖动/旋转/缩放后依然正确） */
  private resolveAttachedPoi(entity: TwinEntity): Cartographic | null {
    const attached = this.attachedPoiConfig(entity);
    if (!attached) return null;
    const parent = this.entityManager.get(attached.parentId);
    const obj = parent?.threeObject;
    if (!obj) return null;
    obj.updateMatrixWorld(true);
    const world = obj.localToWorld(attached.local.clone());
    return CoordinateTransform.localToWgs84(world, this.anchor);
  }

  /** 同步绑定型 POI 的位置；不传 parentId 时同步全部 */
  private syncAttachedPois(parentId?: string): void {
    if (!this.cesiumEngine?.viewer) return;
    for (const poi of this.entityManager.list()) {
      if ((poi.instance.componentType ?? '') !== ComponentType.POI) continue;
      const attached = this.attachedPoiConfig(poi);
      if (!attached) continue;
      if (parentId && attached.parentId !== parentId) continue;
      const carto = this.resolveAttachedPoi(poi);
      if (!carto) continue;
      poi.instance.position.cartographic = carto;
      const cesiumEntity = poi.cesiumRef as Cesium.Entity | undefined;
      if (cesiumEntity) {
        cesiumEntity.position = new Cesium.ConstantPositionProperty(
          Cesium.Cartesian3.fromDegrees(carto.longitude, carto.latitude, carto.height),
        );
      }
    }
  }

  private addPathEntity(entity: TwinEntity): Promise<void> {
    const viewer = this.cesiumEngine?.viewer;
    if (!viewer) {
      console.warn('[rendering-engine] Cesium 引擎未启用，无法渲染 PATH');
      return Promise.resolve();
    }
    const cfg = entity.instance.componentConfig;
    const points =
      (cfg.points as Array<{ longitude: number; latitude: number; height?: number }>) ?? [];
    if (points.length < 2) {
      console.warn(`[rendering-engine] PATH ${entity.id} 途经点不足`);
      return Promise.resolve();
    }
    const positions = points.map((p) =>
      Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude, p.height ?? 0),
    );
    const color = Cesium.Color.fromCssColorString((cfg.color as string) ?? '#00eaff');
    const cesiumEntity = viewer.entities.add({
      id: entity.id,
      polyline: {
        positions,
        width: (cfg.width as number) ?? 4,
        material: new Cesium.ColorMaterialProperty(color),
        clampToGround: !!cfg.clampToGround,
      },
    });
    entity.cesiumRef = cesiumEntity;
    entity.engine = 'CESIUM';
    return Promise.resolve();
  }

  private addParticleEntity(entity: TwinEntity): void {
    if (!this.threeEngine) {
      console.warn('[rendering-engine] Three 引擎未启用，无法渲染 PARTICLE');
      return;
    }
    const cfg = entity.instance.componentConfig;
    const kind = (cfg.effect as string) ?? 'rain';
    let effectId = '';
    if (kind === 'snow') {
      effectId = this.threeEngine.effects.addSnow({
        count: cfg.count as number | undefined,
        area: cfg.area as number | undefined,
      });
    } else if (kind === 'fog') {
      effectId = this.threeEngine.effects.addFog({ density: (cfg.density as number) ?? 0.0008 });
    } else {
      effectId = this.threeEngine.effects.addRain({
        count: cfg.count as number | undefined,
        area: cfg.area as number | undefined,
      });
    }
    entity.effectId = effectId;
    entity.engine = 'THREE';
  }

  // ------------------------------------------------------------- 坐标/变换

  /** 把 Transform 应用到 Three 对象（ENU 局部坐标定位） */
  private applyTransform(obj: THREE.Object3D, transform: SceneComponentInstance['position']): void {
    let pos: THREE.Vector3;
    if (transform.cartographic) {
      pos = CoordinateTransform.wgs84ToLocal(transform.cartographic, this.anchor);
    } else if (transform.position) {
      pos = new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z);
    } else {
      pos = new THREE.Vector3(0, 0, 0);
    }
    obj.position.copy(pos);

    if (transform.rotation) {
      obj.rotation.set(
        degToRad(transform.rotation.x),
        degToRad(transform.rotation.y),
        degToRad(transform.rotation.z),
      );
    }
    const s = normalizeScale(transform.scale, 1);
    obj.scale.set(s.x, s.y, s.z);
  }

  private updateLod(): void {
    if (!this.lodController || !this.threeEngine) return;
    const camPos = this.threeEngine.camera.position;
    for (const entity of this.entityManager.byEngine('THREE')) {
      const lod = entity.instance.componentConfig.lodLevels as Record<string, string> | undefined;
      if (!lod || !entity.threeObject) continue;
      const dist = camPos.distanceTo(entity.threeObject.position);
      const detail = this.lodController.resolve(dist);
      if (detail === 'HIDDEN') {
        entity.threeObject.visible = false;
        entity.currentDetail = 'HIDDEN';
        continue;
      }
      entity.threeObject.visible = true;
      if (entity.currentDetail === detail) continue;
      const url = lod[detail];
      if (!url) continue;
      entity.currentDetail = detail;
      void this.swapModel(entity, url);
    }
  }

  private async swapModel(entity: TwinEntity, url: string): Promise<void> {
    if (entity.swapping || !this.threeEngine || !this.modelLoader) return;
    entity.swapping = true;
    try {
      const obj = await this.modelLoader.load(url);
      this.applyTransform(obj, entity.instance.position);
      obj.userData.entityId = entity.id;
      if (entity.threeObject) {
        this.threeEngine.scene.remove(entity.threeObject);
        if (entity.modelUrl) this.modelLoader.unref(entity.modelUrl);
      }
      this.threeEngine.scene.add(obj);
      entity.threeObject = obj;
      entity.modelUrl = url;
      if (this.highlightedId === entity.id) {
        this.threeEngine.setOutlineTarget([obj]);
      }
    } finally {
      entity.swapping = false;
    }
  }

  // --------------------------------------------------------------- 可见性

  private applyEntityVisibility(entity: TwinEntity): void {
    const visible = entity.visible;
    if (entity.threeObject) entity.threeObject.visible = visible;
    if (entity.cesiumRef && typeof (entity.cesiumRef as Cesium.Entity).show === 'boolean') {
      (entity.cesiumRef as Cesium.Entity).show = visible;
    }
  }

  setEntityVisible(id: string, visible: boolean): void {
    const entity = this.entityManager.get(id);
    if (!entity) return;
    entity.visible = visible;
    this.applyEntityVisibility(entity);
  }

  setLayerVisible(layerId: string, visible: boolean): void {
    for (const entity of this.entityManager.byLayer(layerId)) {
      entity.visible = visible;
      this.applyEntityVisibility(entity);
    }
    // 影像/3D Tiles 图层（按配置 id 管理）
    this.cesiumEngine?.setImageryVisible(layerId, visible);
    this.cesiumEngine?.setTilesetVisible(layerId, visible);
  }

  // ----------------------------------------------------------- 更新/删除

  async updateEntity(id: string, patch: Partial<SceneComponentInstance>): Promise<void> {
    const existing = this.entityManager.get(id);
    if (!existing) {
      console.warn(`[rendering-engine] updateEntity 找不到实体 ${id}`);
      return;
    }
    const merged: SceneComponentInstance = {
      ...existing.instance,
      ...patch,
      position: { ...existing.instance.position, ...(patch.position ?? {}) },
      componentConfig: {
        ...existing.instance.componentConfig,
        ...(patch.componentConfig ?? {}),
      },
    };
    this.removeEntity(id);
    await this.addEntity(merged);
  }

  removeEntity(id: string): void {
    const entity = this.entityManager.remove(id);
    if (!entity) return;
    if (
      (entity.instance.componentType ?? '') === ComponentType.POI &&
      this.attachedPoiConfig(entity)
    ) {
      this.attachedPoiCount = Math.max(0, this.attachedPoiCount - 1);
    }
    if (this.highlightedId === id) this.clearHighlight();
    if (entity.threeObject && this.threeEngine) {
      this.threeEngine.scene.remove(entity.threeObject);
      if (entity.modelUrl && this.modelLoader) this.modelLoader.unref(entity.modelUrl);
      // 占位体是自己 new 出来的几何体/材质，必须手动释放；真实模型交给 ModelLoader 管理
      else if (entity.threeObject.userData?.placeholder)
        this.disposePlaceholder(entity.threeObject);
    }
    if (entity.effectId && this.threeEngine) {
      this.threeEngine.effects.remove(entity.effectId);
    }
    if (entity.cesiumRef && this.cesiumEngine?.viewer) {
      const cesiumEntity = entity.cesiumRef as Cesium.Entity;
      if (this.cesiumEngine.viewer.entities.contains(cesiumEntity)) {
        this.cesiumEngine.viewer.entities.remove(cesiumEntity);
      }
      const tileset = entity.cesiumRef as Cesium.Cesium3DTileset;
      if (this.cesiumEngine.viewer.scene.primitives.contains(tileset)) {
        this.cesiumEngine.viewer.scene.primitives.remove(tileset);
      }
    }
    this.bus.emit('entity-removed', { id });
  }

  clearEntities(): void {
    for (const entity of this.entityManager.list()) {
      this.removeEntity(entity.id);
    }
    this.entityManager.clear();
  }

  // ----------------------------------------------------------------- 相机

  flyTo(view: Partial<CameraView>, duration?: number): void {
    this.cesiumEngine?.flyTo(view, duration);
  }

  flyToEntity(id: string, duration = 2): void {
    const entity = this.entityManager.get(id);
    if (!entity || !this.cesiumEngine?.viewer) return;
    if (entity.engine === 'CESIUM' && entity.cesiumRef) {
      this.cesiumEngine.viewer.flyTo(entity.cesiumRef as Cesium.Entity, { duration });
      return;
    }
    if (entity.engine === 'THREE' && entity.threeObject) {
      const carto = CoordinateTransform.localToWgs84(entity.threeObject.position, this.anchor);
      this.flyTo(
        { longitude: carto.longitude, latitude: carto.latitude, height: carto.height + 300 },
        duration,
      );
    }
  }

  getCameraView(): CameraView {
    return (
      this.cesiumEngine?.getCameraView() ?? {
        longitude: 0,
        latitude: 0,
        height: 0,
        heading: 0,
        pitch: 0,
        roll: 0,
      }
    );
  }

  // ----------------------------------------------------------------- 高亮

  highlight(id: string, color = '#ffcc00'): void {
    const entity = this.entityManager.get(id);
    if (!entity) return;
    this.clearHighlight();
    entity.highlightColor = color;
    this.highlightedId = id;

    if (entity.engine === 'THREE' && entity.threeObject && this.threeEngine) {
      this.threeEngine.setOutlineColor(color);
      this.threeEngine.setOutlineTarget([entity.threeObject]);
    } else if (entity.engine === 'CESIUM' && entity.cesiumRef) {
      this.applyCesiumHighlight(entity.cesiumRef as Cesium.Entity, color);
    }
  }

  clearHighlight(): void {
    if (this.threeEngine) this.threeEngine.setOutlineTarget([]);
    if (this.highlightedId) {
      const entity = this.entityManager.get(this.highlightedId);
      if (entity?.cesiumRef && typeof entity.cesiumRef === 'object') {
        this.restoreCesiumHighlight(entity.cesiumRef as Cesium.Entity);
      }
    }
    this.highlightedId = undefined;
  }

  private cesiumRestoreFns = new Map<string, Array<() => void>>();

  private applyCesiumHighlight(entity: Cesium.Entity, color: string): void {
    const css = Cesium.Color.fromCssColorString(color);
    // Cesium 的 color / fillColor 运行时同时接受 Color 与 Property，
    // 但类型声明只写了 Property，这里统一做一次收敛断言。
    const asProperty = (c: Cesium.Color): Cesium.Property => c as unknown as Cesium.Property;
    const restores: Array<() => void> = [];
    if (entity.billboard) {
      const prev = entity.billboard.color?.getValue(this.placeholderClock());
      restores.push(() => {
        if (prev) entity.billboard!.color = asProperty(prev);
      });
      entity.billboard.color = asProperty(css);
    }
    if (entity.label) {
      const prev = entity.label.fillColor?.getValue(this.placeholderClock());
      restores.push(() => {
        if (prev) entity.label!.fillColor = asProperty(prev);
      });
      entity.label.fillColor = asProperty(css);
    }
    if (entity.polyline) {
      const prev = entity.polyline.material;
      restores.push(() => {
        entity.polyline!.material = prev;
      });
      entity.polyline.material = new Cesium.ColorMaterialProperty(css);
    }
    this.cesiumRestoreFns.set(entity.id, restores);
  }

  private restoreCesiumHighlight(entity: Cesium.Entity): void {
    const restores = this.cesiumRestoreFns.get(entity.id);
    if (restores) {
      for (const fn of restores) fn();
      this.cesiumRestoreFns.delete(entity.id);
    }
  }

  /** Cesium 图形的取值需要 IJulianDate，这里给一个固定时刻避免依赖时钟 */
  private placeholderClock(): Cesium.JulianDate {
    return Cesium.JulianDate.fromIso8601('2020-01-01T00:00:00Z');
  }

  // ----------------------------------------------------------------- 拾取

  pick(x: number, y: number): PickResult | null {
    if (!this.picker) return null;
    return this.picker.pickScreen(x, y);
  }

  private findEntityRootId(obj: THREE.Object3D): string | undefined {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (typeof cur.userData.entityId === 'string') return cur.userData.entityId;
      cur = cur.parent;
    }
    return undefined;
  }

  // ----------------------------------------------------------------- 性能

  private handleDegrade(reason: string): void {
    const result = this.lodController?.considerDegrade(
      this.monitor?.fps ?? 0,
      this.monitor?.memoryMb ?? 0,
    );
    if (result?.changed) {
      this.bus.emit('degrade', { reason, level: `LEVEL_${result.level}`, detail: 'LOW' });
    }
  }

  getStats(): PerfStats {
    return (
      this.monitor?.getStats() ?? {
        fps: 0,
        memoryMb: 0,
        drawCalls: 0,
        triangles: 0,
        entityCount: this.entityManager.size,
      }
    );
  }

  // ----------------------------------------------------------------- 截图

  async screenshot(): Promise<string> {
    if (this.threeEngine) this.threeEngine.render(0);
    const cesiumCanvas = this.cesiumEngine?.viewer?.scene.canvas as HTMLCanvasElement | undefined;
    const threeCanvas = this.threeEngine?.renderer.domElement;
    const w = this.container.clientWidth || (cesiumCanvas?.width ?? 1);
    const h = this.container.clientHeight || (cesiumCanvas?.height ?? 1);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('无法创建 2D 画布用于截图合成');
    try {
      if (cesiumCanvas) ctx.drawImage(cesiumCanvas, 0, 0, w, h);
      if (threeCanvas) ctx.drawImage(threeCanvas, 0, 0, w, h);
      return out.toDataURL('image/png');
    } catch (err) {
      // 跨域瓦片可能导致画布污染，回退只导出 Three 层
      if (threeCanvas) return threeCanvas.toDataURL('image/png');
      throw err;
    }
  }

  // ----------------------------------------------------------------- 配置

  async applyConfig(config: EngineConfig): Promise<void> {
    this.config = config;
    this.anchor = config.threejs.anchor ?? { ...config.cesium.initialView };
    this.cameraSync?.setAnchor(this.anchor);
    this.cesiumEngine?.update(config.cesium);
    this.threeEngine?.update(config.threejs);
    this.lodController?.setConfig(config.threejs.lod ?? DEFAULT_LOD_CONFIG);
    // 应用图层可见性
    for (const layer of config.layers) {
      this.setLayerVisible(layer.id, layer.visible);
    }
  }

  // ----------------------------------------------------------------- 杂项

  resize(): void {
    this.threeEngine?.resize();
  }

  on<T = any>(event: TwinEventName, handler: (payload: T) => void): () => void {
    return this.bus.on(event as 'ready', handler as (p: unknown) => void);
  }

  off(event: TwinEventName, handler: (payload: any) => void): void {
    this.bus.off(event as 'ready', handler as (p: unknown) => void);
  }

  destroy(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.picker?.detach();
    this.roam?.stop();
    this.modelLoader?.dispose();
    this.threeEngine?.destroy();
    this.cesiumEngine?.destroy();
    this.bus.clear();
    this.entityManager.clear();
    this.ready = false;
  }

  // ------------------------------------------------------------- 访问器

  get isReady(): boolean {
    return this.ready;
  }

  get cesium(): any | undefined {
    return this.cesiumEngine?.viewer;
  }

  get three():
    { scene: THREE.Scene; camera: THREE.Camera; renderer: THREE.WebGLRenderer } | undefined {
    if (!this.threeEngine) return undefined;
    return {
      scene: this.threeEngine.scene,
      camera: this.threeEngine.camera,
      renderer: this.threeEngine.renderer,
    };
  }

  /** 暴露 EffectFactory（供上层触发告警涟漪等） */
  get effects(): EffectFactory | undefined {
    return this.threeEngine?.effects;
  }

  /** 暴露 RoamController */
  get roamController(): RoamController | undefined {
    return this.roam;
  }
}
