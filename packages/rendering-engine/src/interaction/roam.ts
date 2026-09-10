import * as Cesium from 'cesium';
import * as THREE from 'three';
import type { Cartographic } from '@dt/shared-types';
import { CoordinateTransform, toCesiumCartesian } from '../fusion/coordinate';

export interface RoamStartOptions {
  /** 漫游速度（米/秒） */
  speed?: number;
  /** 第一人称（贴地视角）/ 第三人称（俯视跟随） */
  firstPerson?: boolean;
  /** 是否循环 */
  loop?: boolean;
}

/**
 * 路径漫游控制器。
 *
 * 给定一串途经点（WGS84），先在局部 ENU 空间用 Catmull-Rom 曲线插值，
 * 再逐帧把曲线上的点映射回世界坐标驱动 Cesium 相机（heading 由切线方向推算），
 * 因为 Three 相机同步自 Cesium，微观模型会自然跟随。
 */
export class RoamController {
  private readonly viewer: Cesium.Viewer;
  private readonly anchor: Cartographic;
  private points: THREE.Vector3[] = [];
  private curve: THREE.CatmullRomCurve3 | undefined;
  private totalLength = 0;
  private t = 0;
  private playing = false;
  private speed = 50;
  private firstPerson = true;
  private loop = true;
  private lastTime = 0;
  private rafId = 0;

  constructor(viewer: Cesium.Viewer, anchor: Cartographic) {
    this.viewer = viewer;
    this.anchor = anchor;
  }

  /** 设置途经点（经纬度） */
  setWaypoints(waypoints: Cartographic[]): void {
    if (waypoints.length < 2) {
      console.warn('[rendering-engine] 漫游途经点至少需要 2 个');
      return;
    }
    this.points = waypoints.map((w) => CoordinateTransform.wgs84ToLocal(w, this.anchor));
    this.curve = new THREE.CatmullRomCurve3(this.points, this.loop, 'catmullrom', 0.5);
    this.totalLength = this.curve.getLength() || 1;
    this.t = 0;
  }

  /** 开始漫游 */
  start(options?: RoamStartOptions): void {
    if (!this.curve) {
      console.warn('[rendering-engine] 尚未设置漫游途经点');
      return;
    }
    if (options?.speed !== undefined) this.speed = options.speed;
    if (options?.firstPerson !== undefined) this.firstPerson = options.firstPerson;
    if (options?.loop !== undefined) this.loop = options.loop;
    this.playing = true;
    this.lastTime = performance.now();
    this.loopTick();
  }

  /** 暂停 */
  pause(): void {
    this.playing = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  /** 继续 */
  resume(): void {
    if (this.playing || !this.curve) return;
    this.playing = true;
    this.lastTime = performance.now();
    this.loopTick();
  }

  /** 停止并复位 */
  stop(): void {
    this.playing = false;
    this.t = 0;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  private loopTick = (): void => {
    if (!this.playing || !this.curve) return;
    const now = performance.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    this.t += (this.speed * dt) / this.totalLength;
    if (this.t >= 1) {
      if (this.loop) {
        this.t = this.t % 1;
      } else {
        this.t = 1;
        this.playing = false;
      }
    }
    this.apply();

    if (this.playing) {
      this.rafId = requestAnimationFrame(this.loopTick);
    }
  };

  private apply(): void {
    if (!this.curve) return;
    const pos = this.curve.getPointAt(Math.min(1, Math.max(0, this.t)));
    const aheadT = Math.min(1, this.t + 0.01);
    const ahead = this.curve.getPointAt(aheadT);

    const enu = CoordinateTransform.enuMatrixAt(this.anchor);
    const worldPos = pos.clone().applyMatrix4(enu);
    const worldAhead = ahead.clone().applyMatrix4(enu);

    const cesiumPos = toCesiumCartesian(worldPos);
    const dir = worldAhead.sub(worldPos);
    if (dir.lengthSq() > 1e-9) dir.normalize();
    // ENU 局部下 x=东 y=北，heading 为从北顺时针角度
    const heading = Math.atan2(dir.x, dir.y);
    const pitch = this.firstPerson ? -0.1 : -0.45;

    this.viewer.camera.setView({
      destination: cesiumPos,
      orientation: {
        heading,
        pitch,
        roll: 0,
      },
    });
  }
}
