import * as Cesium from 'cesium';
import * as THREE from 'three';
import type { Cartographic } from '@dt/shared-types';

/**
 * 双引擎坐标转换工具。
 *
 * 核心思路：
 * - Cesium 使用 ECEF（地心地固）世界坐标，所有经纬度最终都落在 Cartesian3；
 * - Three.js 微观场景使用「以锚点经纬度为原点的 ENU（东-北-天）局部坐标系」，
 *   这样精细模型可以用米为单位在局部空间里摆放，并随相机同步叠加到 Cesium 之上。
 *
 * ENU 变换矩阵由 Cesium.Transforms.eastNorthUpToFixedFrame 得到（列主序），
 * 由于 THREE.Matrix4.fromArray 同样按列主序解析，可直接复用，无需手动转置。
 */
export class CoordinateTransform {
  /**
   * WGS84（经纬度+高程，角度制）转 ECEF 笛卡尔坐标，以 THREE.Vector3 返回（米）。
   */
  static wgs84ToCartesian(c: Cartographic): THREE.Vector3 {
    const carto = Cesium.Cartesian3.fromDegrees(c.longitude, c.latitude, c.height);
    return new THREE.Vector3(carto.x, carto.y, carto.z);
  }

  /**
   * ECEF 笛卡尔坐标（THREE.Vector3）转 WGS84。
   */
  static cartesianToWgs84(v: THREE.Vector3): Cartographic {
    const carto = Cesium.Cartographic.fromCartesian(new Cesium.Cartesian3(v.x, v.y, v.z));
    return {
      longitude: Cesium.Math.toDegrees(carto.longitude),
      latitude: Cesium.Math.toDegrees(carto.latitude),
      height: carto.height,
    };
  }

  /**
   * 在锚点（经纬度+高程）处构造 ENU → ECEF 的 4x4 变换矩阵（列主序，THREE.Matrix4）。
   * 该矩阵把一个「东(x)/北(y)/天(z)方向、单位为米」的局部坐标点映射到世界坐标。
   */
  static enuMatrixAt(anchor: Cartographic): THREE.Matrix4 {
    const origin = Cesium.Cartesian3.fromDegrees(anchor.longitude, anchor.latitude, anchor.height);
    // eastNorthUpToFixedFrame 产出列主序数组，与 THREE.Matrix4.fromArray 默认一致
    const m = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
    const arr = Cesium.Matrix4.toArray(m);
    return new THREE.Matrix4().fromArray(arr);
  }

  /**
   * 局部 ENU 坐标 → WGS84（带入锚点）。局部坐标单位：米，x=东 y=北 z=天。
   */
  static localToWgs84(local: THREE.Vector3, anchor: Cartographic): Cartographic {
    const enu = CoordinateTransform.enuMatrixAt(anchor);
    const world = local.clone().applyMatrix4(enu);
    return CoordinateTransform.cartesianToWgs84(world);
  }

  /**
   * WGS84 → 局部 ENU 坐标（带入锚点）。返回以米为单位的东/北/天偏移。
   */
  static wgs84ToLocal(c: Cartographic, anchor: Cartographic): THREE.Vector3 {
    const enu = CoordinateTransform.enuMatrixAt(anchor);
    const inv = enu.clone().invert();
    const world = CoordinateTransform.wgs84ToCartesian(c);
    // 作为点（w=1）参与仿射变换
    return world.applyMatrix4(inv);
  }

  /**
   * 从 ENU 变换矩阵中提取仅含旋转部分的 3x3 矩阵（用于把方向向量从世界转到局部）。
   */
  static enuRotation(anchor: Cartographic): THREE.Matrix3 {
    const enu = CoordinateTransform.enuMatrixAt(anchor);
    return new THREE.Matrix3().setFromMatrix4(enu);
  }
}

/** 把 THREE.Vector3 转成 Cesium.Cartesian3（用于相机/实体定位） */
export function toCesiumCartesian(v: THREE.Vector3): Cesium.Cartesian3 {
  return new Cesium.Cartesian3(v.x, v.y, v.z);
}
