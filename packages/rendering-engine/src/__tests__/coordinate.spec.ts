import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CoordinateTransform, toCesiumCartesian } from '../fusion/coordinate';

/**
 * 双引擎坐标融合的地基：Cesium 用 ECEF（米，地心固连），Three 微观场景用锚点处的 ENU 局部系。
 * 这里锁的是「可逆性」与「朝向约定」—— 一旦 x/y/z 与东/北/天的对应关系被改反，
 * 现象是模型贴地位置整体镜像或东西南北颠倒，肉眼排查极其昂贵。
 */

const WGS84_A = 6378137; // 赤道半径
const WGS84_B = 6356752.314245; // 极半径
const anchor = { longitude: 116.4074, latitude: 39.9042, height: 45 };

describe('CoordinateTransform · WGS84 ↔ ECEF', () => {
  it('本初子午线与赤道交点落在赤道半径上', () => {
    const v = CoordinateTransform.wgs84ToCartesian({ longitude: 0, latitude: 0, height: 0 });
    expect(v.x).toBeCloseTo(WGS84_A, 3);
    expect(v.y).toBeCloseTo(0, 3);
    expect(v.z).toBeCloseTo(0, 3);
  });

  it('北极点落在极半径上', () => {
    const v = CoordinateTransform.wgs84ToCartesian({ longitude: 0, latitude: 90, height: 0 });
    expect(v.x).toBeCloseTo(0, 3);
    expect(v.y).toBeCloseTo(0, 3);
    expect(v.z).toBeCloseTo(WGS84_B, 2);
  });

  it('经纬高往返一致（编辑器存 WGS84、渲染走 ECEF 的前提）', () => {
    const back = CoordinateTransform.cartesianToWgs84(CoordinateTransform.wgs84ToCartesian(anchor));
    expect(back.longitude).toBeCloseTo(anchor.longitude, 8);
    expect(back.latitude).toBeCloseTo(anchor.latitude, 8);
    expect(back.height).toBeCloseTo(anchor.height, 2);
  });

  it('toCesiumCartesian 仅做载体转换，不改变数值', () => {
    const v = new THREE.Vector3(1, 2, 3);
    const c = toCesiumCartesian(v);
    expect([c.x, c.y, c.z]).toEqual([1, 2, 3]);
  });
});

describe('CoordinateTransform · 锚点 ENU 局部系', () => {
  it('锚点处 ENU 矩阵的平移分量就是该点的 ECEF 坐标', () => {
    const e = CoordinateTransform.enuMatrixAt(anchor).elements;
    const world = CoordinateTransform.wgs84ToCartesian(anchor);
    expect([e[12], e[13], e[14]]).toEqual([world.x, world.y, world.z]);
  });

  it('ENU 旋转部分为右手正交基（行列式为 1，不会镜像模型）', () => {
    const m = CoordinateTransform.enuRotation(anchor).elements;
    const [a, b, c, d, e, f, g, h, i] = m;
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    expect(det).toBeCloseTo(1, 6);
    // 列向量单位化
    expect(Math.hypot(a, b, c)).toBeCloseTo(1, 6);
    expect(Math.hypot(d, e, f)).toBeCloseTo(1, 6);
  });

  it('局部 +x 是东、+y 是北、+z 是天（朝向约定的硬钉）', () => {
    const equator = { longitude: 0, latitude: 0, height: 0 };
    const east = CoordinateTransform.localToWgs84(new THREE.Vector3(1000, 0, 0), equator);
    const north = CoordinateTransform.localToWgs84(new THREE.Vector3(0, 1000, 0), equator);
    const up = CoordinateTransform.localToWgs84(new THREE.Vector3(0, 0, 1000), equator);

    // 赤道处 1° 经度 ≈ 111.32 km
    expect(east.longitude).toBeGreaterThan(0.0089);
    expect(east.longitude).toBeLessThan(0.0091);
    expect(east.latitude).toBeCloseTo(0, 9);
    expect(north.latitude).toBeGreaterThan(0.0089);
    expect(north.longitude).toBeCloseTo(0, 9);
    expect(up.height).toBeCloseTo(1000, 1);
    expect(up.longitude).toBeCloseTo(0, 9);
  });

  it('锚点自身映射到局部原点', () => {
    const local = CoordinateTransform.wgs84ToLocal(anchor, anchor);
    expect([local.x, local.y, local.z]).toEqual([
      expect.closeTo(0, 2),
      expect.closeTo(0, 2),
      expect.closeTo(0, 2),
    ]);
  });

  it('局部 ↔ 经纬度往返误差在亚毫米级（多次变换不得累积漂移）', () => {
    const local = new THREE.Vector3(1234.5, -678.9, 42.3);
    const back = CoordinateTransform.wgs84ToLocal(
      CoordinateTransform.localToWgs84(local, anchor),
      anchor,
    );
    expect(back.x).toBeCloseTo(local.x, 3);
    expect(back.y).toBeCloseTo(local.y, 3);
    // 天向涉及椭球迭代求解，容差单独放宽到厘米级
    expect(back.z).toBeCloseTo(local.z, 1);
  });

  it('远离锚点时误差不随距离爆炸（10 公里量级仍可用）', () => {
    const far = new THREE.Vector3(10_000, 5_000, 0);
    const back = CoordinateTransform.wgs84ToLocal(
      CoordinateTransform.localToWgs84(far, anchor),
      anchor,
    );
    expect(back.x).toBeCloseTo(far.x, 1);
    expect(back.y).toBeCloseTo(far.y, 1);
  });
});
