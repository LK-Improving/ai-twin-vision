import * as Cesium from 'cesium';
import * as THREE from 'three';
import type { Cartographic } from '@dt/shared-types';
import { CoordinateTransform } from './coordinate';

/**
 * 相机同步器：每帧把 Cesium 相机参数映射到 Three 相机。
 *
 * 原理：
 * - Three 场景处于以锚点为原点的 ENU 局部空间，因此先把 Cesium 世界坐标（ECEF）
 *   经 ENU 逆矩阵换算到局部坐标，得到 Three 相机位置；
 * - 相机的方向/上方向向量只受 ENU 旋转（3x3）影响，换算后通过 lookAt 设置朝向；
 * - 透视参数（fov / aspect / near / far）取自 Cesium 当前 PerspectiveFrustum，
 *   保证两个视锥在叠加后视角一致。
 */
export class CameraSync {
  private readonly viewer: Cesium.Viewer;
  private readonly threeCamera: THREE.PerspectiveCamera;
  private anchor: Cartographic;
  private readonly enuInv = new THREE.Matrix4();
  private readonly enuRotInv = new THREE.Matrix3();

  constructor(viewer: Cesium.Viewer, threeCamera: THREE.PerspectiveCamera, anchor: Cartographic) {
    this.viewer = viewer;
    this.threeCamera = threeCamera;
    this.anchor = anchor;
    this.recompute();
  }

  /** 锚点变化时重算 ENU 逆矩阵 */
  setAnchor(anchor: Cartographic): void {
    this.anchor = anchor;
    this.recompute();
  }

  private recompute(): void {
    const enu = CoordinateTransform.enuMatrixAt(this.anchor);
    this.enuInv.copy(enu).invert();
    this.enuRotInv.setFromMatrix4(this.enuInv);
  }

  /** 执行一次同步 */
  sync(): void {
    const cam = this.viewer.camera;
    const pos = cam.positionWC;
    const dir = cam.directionWC;
    const up = cam.upWC;

    // 世界 → 局部坐标点
    const localPos = new THREE.Vector3(pos.x, pos.y, pos.z).applyMatrix4(this.enuInv);
    // 方向向量只做旋转（w=0）
    const localDir = new THREE.Vector3(dir.x, dir.y, dir.z)
      .applyMatrix3(this.enuRotInv)
      .normalize();
    const localUp = new THREE.Vector3(up.x, up.y, up.z)
      .applyMatrix3(this.enuRotInv)
      .normalize();

    this.threeCamera.position.copy(localPos);
    this.threeCamera.up.copy(localUp);
    const target = localPos.clone().add(localDir);
    this.threeCamera.lookAt(target);

    // 投影矩阵对齐：Cesium 的 frustum.fov 为竖直方向弧度
    // 基类型 Frustum 不含 fov，这里按透视视锥断言（Cesium 默认相机为 PerspectiveFrustum）
    const frustum = cam.frustum as unknown as Cesium.PerspectiveFrustum;
    if (frustum && typeof frustum.fov === 'number') {
      this.threeCamera.fov = Cesium.Math.toDegrees(frustum.fov);
      this.threeCamera.aspect = frustum.aspectRatio || this.threeCamera.aspect || 1;
      this.threeCamera.near = frustum.near ?? this.threeCamera.near;
      this.threeCamera.far = frustum.far ?? this.threeCamera.far;
      this.threeCamera.updateProjectionMatrix();
    }
  }
}
