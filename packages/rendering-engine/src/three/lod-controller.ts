import type { LodConfig } from '@dt/shared-types';

/** 细节层级（由精到粗） */
export type LodDetail = 'HIGH' | 'MEDIUM' | 'LOW' | 'HIDDEN';

/** 细节由精到粗的固定顺序，用于按降级偏移平移层级 */
const DETAIL_ORDER: LodDetail[] = ['HIGH', 'MEDIUM', 'LOW', 'HIDDEN'];

/** 将基础层级平移 offset 个「更粗」的档位（HIDDEN 不再变化） */
function shiftDetail(base: LodDetail, offset: number): LodDetail {
  const idx = DETAIL_ORDER.indexOf(base);
  if (idx < 0) return base;
  const next = Math.min(DETAIL_ORDER.length - 1, idx + Math.max(0, offset));
  return DETAIL_ORDER[next];
}

/**
 * LOD（多细节层次）控制器。
 *
 * - 按相机到实体的距离选择 HIGH/MEDIUM/LOW/HIDDEN；
 * - 当 FPS 或显存连续低于阈值时，全局统一降一级（degradeOffset），
 *   从而让更远的实体更早切换为粗模甚至隐藏，缓解性能压力。
 */
export class LodController {
  private config: LodConfig;
  /** 全局降级档位偏移（0=不降级，每降一级 +1） */
  private degradeOffset = 0;

  constructor(config: LodConfig) {
    this.config = config;
  }

  setConfig(config: LodConfig): void {
    this.config = config;
    this.degradeOffset = 0;
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  /** 当前降级档位 */
  get degradeLevel(): number {
    return this.degradeOffset;
  }

  /** 按距离返回基础细节层级 */
  detailForDistance(distance: number): LodDetail {
    if (!this.config.enabled) return 'HIGH';
    const levels = [...this.config.levels].sort((a, b) => a.distance - b.distance);
    for (const lv of levels) {
      if (distance <= lv.distance) return lv.detail;
    }
    return 'HIDDEN';
  }

  /**
   * 根据 FPS / 显存评估是否应继续降级。
   * 返回是否发生降级变化，以及当前降级层级（用于 emit 'degrade'）。
   */
  considerDegrade(fps: number, memoryMb: number): { changed: boolean; level: number } {
    const maxOffset = DETAIL_ORDER.length - 1;
    if (!this.config.enabled || this.degradeOffset >= maxOffset) {
      return { changed: false, level: this.degradeOffset };
    }
    const fpsTh = this.config.autoDegradeFps ?? 0;
    const memTh = this.config.autoDegradeMemoryMb ?? 0;
    const fpsBad = fpsTh > 0 && fps < fpsTh;
    const memBad = memTh > 0 && memoryMb > memTh;
    if (fpsBad || memBad) {
      this.degradeOffset += 1;
      return { changed: true, level: this.degradeOffset };
    }
    return { changed: false, level: this.degradeOffset };
  }

  /** 综合「距离 + 全局降级」得到最终细节层级 */
  resolve(distance: number): LodDetail {
    const base = this.detailForDistance(distance);
    if (!this.config.enabled || this.degradeOffset <= 0) return base;
    return shiftDetail(base, this.degradeOffset);
  }
}

export { DETAIL_ORDER };
