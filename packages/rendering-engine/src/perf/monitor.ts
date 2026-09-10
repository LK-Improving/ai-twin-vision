import type * as THREE from 'three';
import type { PerfStats } from '@dt/shared-types';

export interface PerformanceMonitorOptions {
  /** 实时实体数量（由 EntityManager 提供） */
  entityCount: () => number;
  /** Three 渲染器，用于读取 drawCalls / triangles */
  renderer?: THREE.WebGLRenderer;
  /** 低于该 FPS 连续若干采样触发降级回调（0 表示不触发） */
  minFps?: number;
  /** 连续低于阈值的采样次数阈值 */
  degradeStreak?: number;
  /** 统计信息每秒回调 */
  onStats?: (stats: PerfStats) => void;
  /** 降级回调（reason 描述触发原因） */
  onDegrade?: (reason: string) => void;
}

/**
 * 性能监控器。
 *
 * - FPS：用每帧时间差做滑动累计，约每 0.5s 刷新一次；
 * - 内存：读取 performance.memory（Chrome 专有，其它浏览器回退 0）；
 * - 绘制调用 / 三角面：读取 renderer.info.render；
 * - 低于 minFps 连续 degradeStreak 次时触发 onDegrade。
 * 全部计算在 tick(dt) 中完成，由主 rAF 驱动。
 */
export class PerformanceMonitor {
  fps = 60;
  private readonly entityCount: () => number;
  private readonly renderer?: THREE.WebGLRenderer;
  private readonly minFps: number;
  private readonly degradeStreak: number;
  private readonly onStats?: (stats: PerfStats) => void;
  private readonly onDegrade?: (reason: string) => void;

  private frames = 0;
  private accTime = 0;
  private statsAccTime = 0;
  private lowStreak = 0;

  constructor(opts: PerformanceMonitorOptions) {
    this.entityCount = opts.entityCount;
    this.renderer = opts.renderer;
    this.minFps = opts.minFps ?? 0;
    this.degradeStreak = opts.degradeStreak ?? 3;
    this.onStats = opts.onStats;
    this.onDegrade = opts.onDegrade;
  }

  /** 每帧调用，dt 为秒 */
  tick(dt: number): void {
    this.frames += 1;
    this.accTime += dt;
    this.statsAccTime += dt;

    if (this.accTime >= 0.5) {
      this.fps = this.frames / this.accTime;
      this.frames = 0;
      this.accTime = 0;

      // 降级判定
      if (this.minFps > 0 && this.fps < this.minFps) {
        this.lowStreak += 1;
        if (this.lowStreak >= this.degradeStreak) {
          this.lowStreak = 0;
          this.onDegrade?.(`fps<${this.minFps} (current ${this.fps.toFixed(1)})`);
        }
      } else {
        this.lowStreak = 0;
      }
    }

    // 每秒推送一次统计
    if (this.statsAccTime >= 1) {
      this.statsAccTime = 0;
      this.onStats?.(this.getStats());
    }
  }

  /** 读取当前内存占用（MB） */
  get memoryMb(): number {
    const perf = performance as unknown as { memory?: { usedJSHeapSize: number } };
    if (perf.memory && perf.memory.usedJSHeapSize) {
      return perf.memory.usedJSHeapSize / (1024 * 1024);
    }
    return 0;
  }

  /** 聚合当前一帧性能快照 */
  getStats(): PerfStats {
    const info = this.renderer?.info.render;
    return {
      fps: Math.round(this.fps * 10) / 10,
      memoryMb: Math.round(this.memoryMb * 10) / 10,
      drawCalls: info?.calls ?? 0,
      triangles: info?.triangles ?? 0,
      entityCount: this.entityCount(),
    };
  }
}
