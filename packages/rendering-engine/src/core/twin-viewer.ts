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
      console.warn(`[rendering-engine] MODEL_3D ${entity.id} 缺少模型地址`);
      return;
    }
    const obj = await this.modelLoader.load(url);
    this.applyTransform(obj, entity.instance.position);
    obj.userData.entityId = entity.id;
    this.threeEngine.scene.add(obj);
    entity.threeObject = obj;
    entity.modelUrl = url;
    entity.engine = 'THREE';
    entity.currentDetail = 'HIGH';
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
    let position: Cesium.Cartesian3;
    if (entity.instance.position.cartographic) {
      const c = entity.instance.position.cartographic;
      position = Cesium.Cartesian3.fromDegrees(c.longitude, c.latitude, c.height);
    } else {
      const lng = (cfg.longitude as number) ?? 0;
      const lat = (cfg.latitude as number) ?? 0;
      const h = (cfg.height as number) ?? 0;
      position = Cesium.Cartesian3.fromDegrees(lng, lat, h);
    }
    const label = (cfg.label as string) ?? entity.instance.name ?? '';
    const image = cfg.image as string | undefined;
    const cesiumEntity = viewer.entities.add({
      position,
      id: entity.id,
      label: label
        ? {
            text: label,
            font: '14px sans-serif',
            fillColor: Cesium.Color.fromCssColorString((cfg.color as string) ?? '#ffffff'),
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 2,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -24),
          }
        : undefined,
      billboard: image
        ? {
            image,
            width: (cfg.width as number) ?? 32,
            height: (cfg.height as number) ?? 32,
          }
        : undefined,
    });
    entity.cesiumRef = cesiumEntity;
    entity.engine = 'CESIUM';
    return Promise.resolve();
  }

  private addPathEntity(entity: TwinEntity): Promise<void> {
    const viewer = this.cesiumEngine?.viewer;
    if (!viewer) {
      console.warn('[rendering-engine] Cesium 引擎未启用，无法渲染 PATH');
      return Promise.resolve();
    }
    const cfg = entity.instance.componentConfig;
    const points = (cfg.points as Array<{ longitude: number; latitude: number; height?: number }>) ?? [];
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
    if (this.highlightedId === id) this.clearHighlight();
    if (entity.threeObject && this.threeEngine) {
      this.threeEngine.scene.remove(entity.threeObject);
      if (entity.modelUrl && this.modelLoader) this.modelLoader.unref(entity.modelUrl);
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
      this.flyTo({ longitude: carto.longitude, latitude: carto.latitude, height: carto.height + 300 }, duration);
    }
  }

  getCameraView(): CameraView {
    return this.cesiumEngine?.getCameraView() ?? {
      longitude: 0,
      latitude: 0,
      height: 0,
      heading: 0,
      pitch: 0,
      roll: 0,
    };
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
    const restores: Array<() => void> = [];
    if (entity.billboard) {
      const prev = entity.billboard.color?.getValue(this.placeholderClock());
      restores.push(() => {
        if (prev) entity.billboard!.color = prev as unknown as Cesium.Color;
      });
      entity.billboard.color = css;
    }
    if (entity.label) {
      const prev = entity.label.fillColor?.getValue(this.placeholderClock());
      restores.push(() => {
        if (prev) entity.label!.fillColor = prev as unknown as Cesium.Color;
      });
      entity.label.fillColor = css;
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
    const result = this.lodController?.considerDegrade(this.monitor?.fps ?? 0, this.monitor?.memoryMb ?? 0);
    if (result?.changed) {
      this.bus.emit('degrade', { reason, level: `LEVEL_${result.level}`, detail: 'LOW' });
    }
  }

  getStats(): PerfStats {
    return this.monitor?.getStats() ?? {
      fps: 0,
      memoryMb: 0,
      drawCalls: 0,
      triangles: 0,
      entityCount: this.entityManager.size,
    };
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

  get three(): { scene: THREE.Scene; camera: THREE.Camera; renderer: THREE.WebGLRenderer } | undefined {
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
