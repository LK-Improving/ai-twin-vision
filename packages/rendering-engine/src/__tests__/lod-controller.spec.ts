import { describe, expect, it } from 'vitest';
import type { LodConfig } from '@dt/shared-types';
import { DETAIL_ORDER, LodController } from '../three/lod-controller';

const base: LodConfig = {
  enabled: true,
  levels: [
    { distance: 100, detail: 'HIGH' },
    { distance: 500, detail: 'MEDIUM' },
    { distance: 2000, detail: 'LOW' },
  ],
  autoDegradeFps: 24,
  autoDegradeMemoryMb: 1024,
};

describe('rendering-engine/LodController', () => {
  it('按距离取层级，边界取等号归入更细的一档', () => {
    const lod = new LodController(base);
    expect(lod.detailForDistance(0)).toBe('HIGH');
    expect(lod.detailForDistance(100)).toBe('HIGH');
    expect(lod.detailForDistance(100.1)).toBe('MEDIUM');
    expect(lod.detailForDistance(500)).toBe('MEDIUM');
    expect(lod.detailForDistance(2001)).toBe('HIDDEN');
  });

  it('levels 乱序配置也必须正确分级（内部按距离排序）', () => {
    const lod = new LodController({
      ...base,
      levels: [
        { distance: 2000, detail: 'LOW' },
        { distance: 100, detail: 'HIGH' },
        { distance: 500, detail: 'MEDIUM' },
      ],
    });
    expect(lod.detailForDistance(300)).toBe('MEDIUM');
  });

  it('关闭 LOD 时恒为 HIGH，且不受降级影响', () => {
    const lod = new LodController({ ...base, enabled: false });
    expect(lod.enabled).toBe(false);
    expect(lod.detailForDistance(99999)).toBe('HIGH');
    expect(lod.resolve(99999)).toBe('HIGH');
    // 关闭时不应累积降级档位
    expect(lod.considerDegrade(1, 99999)).toEqual({ changed: false, level: 0 });
  });

  it('FPS 低于阈值触发降一级，并随降级把远处实体推向更粗档', () => {
    const lod = new LodController(base);
    expect(lod.resolve(1500)).toBe('LOW');

    expect(lod.considerDegrade(20, 512)).toEqual({ changed: true, level: 1 });
    expect(lod.degradeLevel).toBe(1);
    expect(lod.resolve(1500)).toBe('HIDDEN'); // LOW 再降一级到 HIDDEN
    expect(lod.resolve(50)).toBe('MEDIUM'); // HIGH 降一级
  });

  it('显存超阈值同样降级；健康指标不再继续降', () => {
    const lod = new LodController(base);
    expect(lod.considerDegrade(60, 2048).changed).toBe(true);
    expect(lod.considerDegrade(60, 512)).toEqual({ changed: false, level: 1 });
  });

  it('降级档位封顶在最后一档，不会越界', () => {
    const lod = new LodController(base);
    const maxOffset = DETAIL_ORDER.length - 1;
    for (let i = 0; i < 10; i += 1) lod.considerDegrade(1, 99999);
    expect(lod.degradeLevel).toBe(maxOffset);
    expect(lod.resolve(0)).toBe('HIDDEN');
  });

  it('setConfig 重置降级档位（配置变更后重新开始评估）', () => {
    const lod = new LodController(base);
    lod.considerDegrade(1, 99999);
    expect(lod.degradeLevel).toBe(1);
    lod.setConfig({ ...base, autoDegradeFps: undefined });
    expect(lod.degradeLevel).toBe(0);
    // 阈值缺省为 0 表示不启用该项，健康 FPS 也不应降级
    expect(lod.considerDegrade(1, 0)).toEqual({ changed: false, level: 0 });
  });
});
