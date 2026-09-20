import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUndoRedo } from './useUndoRedo';

/**
 * 撤销/重做栈是编辑器的主干，且「同 mergeKey 在时间窗内合并」直接决定
 * 拖拽一次是回退一步还是一百步 —— 这类语义最容易在改手感时被改坏。
 *
 * 时间用受控的 Date.now 桩，避免依赖真实时钟造成偶发失败。
 */

let nowMs = 1_000_000;
beforeEach(() => {
  nowMs = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const advance = (ms: number): void => {
  nowMs += ms;
};

interface State {
  x: number;
  items: string[];
}

describe('useUndoRedo', () => {
  it('初始只有基线，不可撤销', () => {
    const h = useUndoRedo<State>({ x: 0, items: [] });
    expect(h.canUndo.value).toBe(false);
    expect(h.canRedo.value).toBe(false);
    expect(h.undo()).toBeUndefined();
  });

  it('push 后撤销回到前一个状态，重做再回来', () => {
    const h = useUndoRedo<State>({ x: 0, items: [] });
    h.push({ x: 1, items: ['a'] });
    expect(h.canUndo.value).toBe(true);
    expect(h.undo()).toEqual({ x: 0, items: [] });
    expect(h.canRedo.value).toBe(true);
    expect(h.redo()).toEqual({ x: 1, items: ['a'] });
    expect(h.redo()).toBeUndefined();
  });

  it('快照与外部对象解耦（push 后再改原对象不影响历史）', () => {
    const src: State = { x: 1, items: ['a'] };
    const h = useUndoRedo<State>({ x: 0, items: [] });
    h.push(src);
    src.items.push('mutated');
    src.x = 999;
    expect(h.undo()).toEqual({ x: 0, items: [] });
    // 取回来的快照也是克隆，改它不会污染栈
    const restored = h.redo() as State;
    expect(restored).toEqual({ x: 1, items: ['a'] });
    restored.x = -1;
    expect(h.undo()).toEqual({ x: 0, items: [] });
    expect(h.redo()).toEqual({ x: 1, items: ['a'] });
  });

  it('同 mergeKey 在合并窗内只占一步（拖拽不该产生上百条历史）', () => {
    const h = useUndoRedo<State>({ x: 0, items: [] }, { mergeWindowMs: 600 });
    h.push({ x: 1, items: [] }, 'move:1');
    advance(100);
    h.push({ x: 2, items: [] }, 'move:1');
    advance(100);
    h.push({ x: 30, items: [] }, 'move:1');

    // 三次拖拽合并成一条：撤销一次直接回到拖拽前
    expect(h.undo()).toEqual({ x: 0, items: [] });
    expect(h.canUndo.value).toBe(false);
    expect(h.redo()).toEqual({ x: 30, items: [] });
  });

  it('超出合并窗或换 mergeKey 则各自成为独立一步', () => {
    const h = useUndoRedo<State>({ x: 0, items: [] }, { mergeWindowMs: 600 });
    h.push({ x: 1, items: [] }, 'move:1');
    advance(601);
    h.push({ x: 2, items: [] }, 'move:1'); // 超窗 → 独立一步：[base,1,2]
    expect(h.undo()).toEqual({ x: 1, items: [] });

    // 撤销后开新操作：redo 分支应被截断（与下方「已知缺陷」形成对照）
    h.push({ x: 3, items: [] }, 'resize:1');
    expect(h.canRedo.value).toBe(false);
    expect(h.redo()).toBeUndefined();
    expect(h.undo()).toEqual({ x: 1, items: [] });
    expect(h.undo()).toEqual({ x: 0, items: [] });
  });

  it('无 mergeKey 的连续 push 永不合并', () => {
    const h = useUndoRedo<State>({ x: 0, items: [] });
    h.push({ x: 1, items: [] });
    h.push({ x: 2, items: [] });
    h.push({ x: 3, items: [] });
    expect(h.undo()).toEqual({ x: 2, items: [] });
    expect(h.undo()).toEqual({ x: 1, items: [] });
    expect(h.undo()).toEqual({ x: 0, items: [] });
  });

  it('撤销后另起一次操作会丢弃 redo 分支', () => {
    const h = useUndoRedo<State>({ x: 0, items: [] });
    h.push({ x: 1, items: [] });
    h.push({ x: 2, items: [] });
    h.undo();
    h.push({ x: 9, items: [] });
    expect(h.canRedo.value).toBe(false);
    expect(h.redo()).toBeUndefined();
    expect(h.undo()).toEqual({ x: 1, items: [] });
  });

  it('超过 limit 时丢掉最旧快照，且索引仍指向最新', () => {
    const h = useUndoRedo<State>({ x: 0, items: [] }, { limit: 3 });
    h.push({ x: 1, items: [] });
    h.push({ x: 2, items: [] });
    h.push({ x: 3, items: [] }); // 此时 [base,1,2,3] 超上限 → 淘汰 base，栈为 [1,2,3]
    expect(h.undo()).toEqual({ x: 2, items: [] });
    expect(h.undo()).toEqual({ x: 1, items: [] });
    // 基线已被挤出，再无可撤销（但 redo 分支仍在）
    expect(h.undo()).toBeUndefined();
    expect(h.canRedo.value).toBe(true);
    expect(h.redo()).toEqual({ x: 2, items: [] });
  });

  it('reset 清空历史并以新基线起算；clear 回到初始基线', () => {
    const h = useUndoRedo<State>({ x: 0, items: [] });
    h.push({ x: 1, items: [] });
    h.reset({ x: 100, items: ['z'] });
    expect(h.canUndo.value).toBe(false);
    expect(h.undo()).toBeUndefined();

    h.push({ x: 101, items: [] });
    h.clear();
    expect(h.canUndo.value).toBe(false);
    expect(h.redo()).toBeUndefined();
  });
});

/**
 * 迭代 5.2 修正的回归测试。
 *
 * 原行为（已修）：合并分支没有限制在栈顶，撤销到中途后紧跟一次同 mergeKey
 * 且在窗内的 push，会走「覆盖当前 index」分支 —— 把历史里的旧快照改写掉，
 * 而且 redo 分支不截断，表现为「回退一步把上一步的旧状态替掉了」。
 * 下面两条分别钉住「新分支必须另起一步 + 截断 redo」与「栈顶合并仍生效」。
 */
describe('useUndoRedo · 撤销到中途后开新分支', () => {
  it('即使 mergeKey 相同且未超窗，也必须另起一步并截断 redo 分支', () => {
    const h = useUndoRedo<State>({ x: 0, items: [] }, { mergeWindowMs: 600 });
    h.push({ x: 1, items: [] }, 'move:1');
    h.push({ x: 2, items: [] }, 'move:1'); // 栈顶合并 → [base, 2]
    h.push({ x: 5, items: [] }, 'other'); // [base, 2, 5]
    expect(h.undo()).toEqual({ x: 2, items: [] }); // 回到 index=1（非栈顶）

    advance(10);
    h.push({ x: 7, items: [] }, 'other'); // 同 key + 窗内，但非栈顶 → 不得合并

    // 刚发生新操作：redo 分支已被截断（旧的 5 不再可重做）
    expect(h.canRedo.value).toBe(false);
    expect(h.redo()).toBeUndefined();
    // 历史槽位未被改写：回退仍能看到原来的 2
    expect(h.undo()).toEqual({ x: 2, items: [] });
    expect(h.redo()).toEqual({ x: 7, items: [] });
  });

  it('连续回退多步后开新操作，每一步仍按预期堆叠', () => {
    const h = useUndoRedo<State>({ x: 0, items: [] }, { mergeWindowMs: 600 });
    h.push({ x: 1, items: [] });
    h.push({ x: 2, items: [] });
    h.push({ x: 3, items: [] });
    h.undo();
    h.undo();
    h.undo(); // 三步全退 → 回基线
    expect(h.canUndo.value).toBe(false);

    h.push({ x: 9, items: [] });
    expect(h.canRedo.value).toBe(false);
    expect(h.undo()).toEqual({ x: 0, items: [] });
    expect(h.redo()).toEqual({ x: 9, items: [] });
  });
});
