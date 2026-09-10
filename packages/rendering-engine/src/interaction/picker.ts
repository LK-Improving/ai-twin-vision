import * as Cesium from 'cesium';
import * as THREE from 'three';
import type { PickResult } from '../core/twin-viewer';

export interface PickerOptions {
  container: HTMLElement;
  threeScene: THREE.Scene;
  threeCamera: THREE.PerspectiveCamera;
  cesiumViewer: Cesium.Viewer;
  /** 由拾取的 Three 对象向上回溯到实体根节点，读出 entityId */
  getEntityIdByObject: (obj: THREE.Object3D) => string | undefined;
  /** 由 entityId 反查 componentId（可选） */
  getComponentId?: (entityId: string) => string | undefined;
  /** 是否只读预览模式（仍允许拾取高亮信息，但可由上层决定） */
  readonly?: boolean;
  /** 拾取结果回调 */
  onPick: (event: 'click' | 'dblclick' | 'hover', result: PickResult) => void;
}

/**
 * 统一拾取器。
 *
 * 由于 Three 画布 pointer-events:none，所有指针事件都落在容器上。
 * 拾取优先级：Three raycaster → 命中则标记引擎为 THREE；
 * 否则回退 Cesium scene.pick（Entity/Cesium3DTilesetFeature 等）。
 * 同时给出该屏幕点的地理坐标（pickPosition）。
 */
export class Picker {
  private readonly opts: PickerOptions;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly boundHandlers: Array<[string, EventListener]> = [];

  constructor(opts: PickerOptions) {
    this.opts = opts;
  }

  /** 绑定容器事件 */
  attach(): void {
    this.add('click', this.handleClick);
    this.add('dblclick', this.handleDblClick);
    this.add('pointermove', this.handleMove);
  }

  /** 解绑（destroy 时调用） */
  detach(): void {
    for (const [type, handler] of this.boundHandlers) {
      this.opts.container.removeEventListener(type, handler);
    }
    this.boundHandlers.length = 0;
  }

  private add(type: string, fn: (e: Event) => void): void {
    const handler = fn as EventListener;
    this.opts.container.addEventListener(type, handler);
    this.boundHandlers.push([type, handler]);
  }

  private handleClick = (e: Event): void => {
    const r = this.pickAt(e as PointerEvent);
    if (r) this.opts.onPick('click', r);
  };

  private handleDblClick = (e: Event): void => {
    const r = this.pickAt(e as PointerEvent);
    if (r) this.opts.onPick('dblclick', r);
  };

  private handleMove = (e: Event): void => {
    const r = this.pickAt(e as PointerEvent);
    if (r) this.opts.onPick('hover', r);
  };

  /** 在容器局部坐标 (x,y) 处执行拾取 */
  pickAt(e: PointerEvent): PickResult | null {
    const rect = this.opts.container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return this.pickScreen(x, y);
  }

  /** 直接以容器局部像素坐标拾取（供编程调用，如截图后自动拾取） */
  pickScreen(x: number, y: number): PickResult | null {
    const rect = this.opts.container.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;

    // 1) Three raycaster 优先
    let entityId: string | undefined;
    let engine: PickResult['engine'] = 'CESIUM';
    this.ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.opts.threeCamera);
    const hits = this.raycaster.intersectObjects(this.opts.threeScene.children, true);
    if (hits.length > 0) {
      const root = this.findEntityRoot(hits[0].object);
      if (root) {
        entityId = root.userData.entityId as string | undefined;
        engine = 'THREE';
      }
    }

    // 2) 回退 Cesium 拾取
    if (!entityId) {
      const cesiumHit = this.opts.cesiumViewer.scene.pick(
        new Cesium.Cartesian2(x, y),
      ) as { id?: { id?: string } } | undefined;
      if (cesiumHit && cesiumHit.id && typeof cesiumHit.id.id === 'string') {
        entityId = cesiumHit.id.id;
        engine = 'CESIUM';
      }
    }

    // 3) 地理坐标（指向地形/模型表面；指向天空时为 undefined）
    const carto = this.pickCartographic(x, y);

    const componentId = entityId ? this.opts.getComponentId?.(entityId) : undefined;

    return {
      entityId,
      componentId,
      engine,
      cartographic: carto ?? undefined,
      screen: { x, y },
      raw: undefined,
    };
  }

  /** 向上回溯找到带 entityId 的实体根对象 */
  private findEntityRoot(obj: THREE.Object3D | null): THREE.Object3D | undefined {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur.userData && typeof cur.userData.entityId === 'string') return cur;
      cur = cur.parent;
    }
    return undefined;
  }

  /** 屏幕点 → 地理坐标 */
  private pickCartographic(x: number, y: number) {
    try {
      const cartesian = this.opts.cesiumViewer.scene.pickPosition(
        new Cesium.Cartesian2(x, y),
      );
      if (!cartesian) return null;
      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      return {
        longitude: Cesium.Math.toDegrees(carto.longitude),
        latitude: Cesium.Math.toDegrees(carto.latitude),
        height: carto.height,
      };
    } catch {
      return null;
    }
  }
}
