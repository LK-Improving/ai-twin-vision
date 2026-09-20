import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../core/event-bus';

/**
 * 事件总线是双引擎与业务层的通信中枢，其「隔离 handler 异常」与「订阅可回收」
 * 是承诺过的行为（见类注释），这里逐条钉住。
 */
describe('rendering-engine/EventBus', () => {
  it('按注册顺序同步派发，载荷原样传递', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on('click', () => seen.push('first'));
    bus.on('click', () => seen.push('second'));
    bus.emit('click', { entityId: 'e1' } as never);
    expect(seen).toEqual(['first', 'second']);
  });

  it('on 返回的取消函数确实能退订', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const off = bus.on('click', handler);
    off();
    bus.emit('click', { entityId: 'e1' } as never);
    expect(handler).not.toHaveBeenCalled();
    // 集合清空后事件键位也应回收，避免 size 虚高
    expect(bus.size).toBe(0);
  });

  it('同一 handler 重复注册只会调用一次（Set 语义），off 按引用移除', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('degrade', handler);
    bus.on('degrade', handler);
    bus.emit('degrade', 2 as never);
    expect(handler).toHaveBeenCalledTimes(1);

    bus.off('degrade', handler);
    bus.emit('degrade', 3 as never);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('某个 handler 抛错不影响其它订阅者收到事件', () => {
    const bus = new EventBus();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const survivor = vi.fn();
    bus.on('click', () => {
      throw new Error('boom');
    });
    bus.on('click', survivor);

    expect(() => bus.emit('click', { entityId: 'e2' } as never)).not.toThrow();
    expect(survivor).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('clear 之后 emit 静默失效（destroy 语义）', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('click', handler);
    bus.clear();
    bus.emit('click', { entityId: 'e3' } as never);
    expect(handler).not.toHaveBeenCalled();
    expect(bus.size).toBe(0);
  });

  it('派发过程中退订不会漏派也不会抛迭代异常', () => {
    const bus = new EventBus();
    const second = vi.fn();
    const holder: { off?: () => void } = {};
    holder.off = bus.on('click', () => holder.off?.());
    bus.on('click', second);
    bus.emit('click', { entityId: 'e4' } as never);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
