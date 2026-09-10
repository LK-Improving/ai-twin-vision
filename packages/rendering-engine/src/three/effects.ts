import * as THREE from 'three';

/** 已实现的环境/告警特效类型 */
export type EffectType = 'rain' | 'snow' | 'fog' | 'blink' | 'ripple';

/** 单个活动的特效，由工厂统一 update / dispose */
interface ActiveEffect {
  id: string;
  type: EffectType;
  update: (dt: number) => void;
  dispose: () => void;
}

export interface RainOptions {
  /** 粒子数量 */
  count?: number;
  /** 水平铺开范围（米，相对局部坐标原点 ±area） */
  area?: number;
  /** 雨幕高度（米） */
  height?: number;
  /** 下落速度系数 */
  speed?: number;
  color?: string;
  size?: number;
}

export interface SnowOptions {
  count?: number;
  area?: number;
  height?: number;
  speed?: number;
  color?: string;
  size?: number;
}

export interface FogOptions {
  density?: number;
  color?: string;
}

export interface RippleOptions {
  color?: string;
  /** 扩散到的最大半径（米） */
  maxRadius?: number;
  duration?: number;
}

/**
 * 特效工厂。
 *
 * 环境类：雨、雪（粒子系统）、雾（场景指数雾）。
 * 告警类：闪烁（对目标模型自发光做正弦调制）、涟漪（地表扩散圆环）。
 *
 * 所有带动画的特效在每帧通过 update(dt) 推进；remove / clear 负责从场景摘除并释放。
 */
export class EffectFactory {
  private readonly scene: THREE.Scene;
  private readonly effects = new Map<string, ActiveEffect>();
  private seq = 1;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** 推进全部动画特效，dt 为秒 */
  update(dt: number): void {
    for (const e of this.effects.values()) {
      e.update(dt);
    }
  }

  /** 雨 */
  addRain(opts: RainOptions = {}): string {
    const count = opts.count ?? 8000;
    const area = opts.area ?? 1500;
    const height = opts.height ?? 1200;
    const speed = opts.speed ?? 800;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * area;
      positions[i * 3 + 1] = Math.random() * height;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * area;
      speeds[i] = speed * (0.6 + Math.random() * 0.6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: new THREE.Color(opts.color ?? '#9fc7ff'),
      size: opts.size ?? 3,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.scene.add(points);

    const id = this.genId('rain');
    const effect: ActiveEffect = {
      id,
      type: 'rain',
      update: (dt: number) => {
        const arr = geometry.getAttribute('position') as THREE.BufferAttribute;
        const a = arr.array as Float32Array;
        for (let i = 0; i < count; i++) {
          a[i * 3 + 1] -= speeds[i] * dt;
          if (a[i * 3 + 1] < 0) {
            a[i * 3 + 1] = height;
            a[i * 3] = (Math.random() * 2 - 1) * area;
            a[i * 3 + 2] = (Math.random() * 2 - 1) * area;
          }
        }
        arr.needsUpdate = true;
      },
      dispose: () => {
        this.scene.remove(points);
        geometry.dispose();
        material.dispose();
      },
    };
    this.effects.set(id, effect);
    return id;
  }

  /** 雪 */
  addSnow(opts: SnowOptions = {}): string {
    const count = opts.count ?? 5000;
    const area = opts.area ?? 1500;
    const height = opts.height ?? 1200;
    const speed = opts.speed ?? 120;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * area;
      positions[i * 3 + 1] = Math.random() * height;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * area;
      speeds[i] = speed * (0.5 + Math.random());
      phases[i] = Math.random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: new THREE.Color(opts.color ?? '#ffffff'),
      size: opts.size ?? 5,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.scene.add(points);

    const id = this.genId('snow');
    let t = 0;
    const effect: ActiveEffect = {
      id,
      type: 'snow',
      update: (dt: number) => {
        t += dt;
        const arr = geometry.getAttribute('position') as THREE.BufferAttribute;
        const a = arr.array as Float32Array;
        for (let i = 0; i < count; i++) {
          a[i * 3 + 1] -= speeds[i] * dt;
          a[i * 3] += Math.sin(t + phases[i]) * 8 * dt;
          if (a[i * 3 + 1] < 0) {
            a[i * 3 + 1] = height;
            a[i * 3] = (Math.random() * 2 - 1) * area;
            a[i * 3 + 2] = (Math.random() * 2 - 1) * area;
          }
        }
        arr.needsUpdate = true;
      },
      dispose: () => {
        this.scene.remove(points);
        geometry.dispose();
        material.dispose();
      },
    };
    this.effects.set(id, effect);
    return id;
  }

  /** 雾（指数雾，作用于整个局部场景） */
  addFog(opts: FogOptions = {}): string {
    const color = new THREE.Color(opts.color ?? '#0b1220');
    const density = opts.density ?? 0.0008;
    const prev = this.scene.fog;
    this.scene.fog = new THREE.FogExp2(color.getHex(), density);
    const id = this.genId('fog');
    const effect: ActiveEffect = {
      id,
      type: 'fog',
      update: () => {
        // 静态雾无需逐帧更新
      },
      dispose: () => {
        // 仅在当前雾仍是本特效设置时恢复
        if (this.scene.fog && (this.scene.fog as THREE.FogExp2).isFogExp2) {
          this.scene.fog = prev;
        }
      },
    };
    this.effects.set(id, effect);
    return id;
  }

  /** 告警闪烁：对目标模型的自发光做正弦调制 */
  addBlink(target: THREE.Object3D, color = '#ff3b30'): string {
    const records: Array<{
      mat: THREE.MeshStandardMaterial;
      base: number;
    }> = [];
    target.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (mat && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        const std = mat as THREE.MeshStandardMaterial;
        std.emissive = new THREE.Color(color);
        records.push({ mat: std, base: 0 });
      }
    });
    const id = this.genId('blink');
    let t = 0;
    const effect: ActiveEffect = {
      id,
      type: 'blink',
      update: (dt: number) => {
        t += dt;
        const intensity = 0.5 + 0.5 * Math.sin(t * 6);
        for (const r of records) {
          r.mat.emissiveIntensity = intensity * 1.5;
        }
      },
      dispose: () => {
        for (const r of records) {
          r.mat.emissiveIntensity = r.base;
        }
      },
    };
    this.effects.set(id, effect);
    return id;
  }

  /** 告警涟漪：在局部坐标处生成扩散圆环 */
  addRipple(position: THREE.Vector3, opts: RippleOptions = {}): string {
    const maxRadius = opts.maxRadius ?? 200;
    const duration = opts.duration ?? 2;
    const geometry = new THREE.RingGeometry(0.8, 1, 48);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(opts.color ?? '#ffcc00'),
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    // 使圆环平铺在 XZ 平面（法线朝上）
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(position);
    this.scene.add(mesh);

    const id = this.genId('ripple');
    let t = 0;
    const effect: ActiveEffect = {
      id,
      type: 'ripple',
      update: (dt: number) => {
        t += dt;
        const k = t / duration;
        if (k >= 1) {
          // 单次涟漪播放完毕，自动移除
          this.remove(id);
          return;
        }
        const radius = maxRadius * k;
        mesh.scale.set(radius, radius, radius);
        material.opacity = 0.9 * (1 - k);
      },
      dispose: () => {
        this.scene.remove(mesh);
        geometry.dispose();
        material.dispose();
      },
    };
    this.effects.set(id, effect);
    return id;
  }

  /** 移除某个特效并释放资源 */
  remove(id: string): void {
    const e = this.effects.get(id);
    if (!e) return;
    e.dispose();
    this.effects.delete(id);
  }

  /** 清空全部特效 */
  clear(): void {
    for (const e of this.effects.values()) {
      e.dispose();
    }
    this.effects.clear();
  }

  /** 当前活动特效数量 */
  get size(): number {
    return this.effects.size;
  }

  private genId(prefix: string): string {
    return `${prefix}-${this.seq++}`;
  }
}
