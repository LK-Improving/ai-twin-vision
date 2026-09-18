/**
 * 通用泛型撤销/重做栈。
 *
 * 用法：
 *   const history = useUndoRedo<MyState>(initial, { limit: 50, mergeWindowMs: 600 });
 *   history.push(currentState, 'move:1');   // 连续拖拽用相同 mergeKey 合并为一条
 *   const prev = history.undo();            // 返回需要恢复的快照，或 undefined
 *   const next = history.redo();
 *
 * 设计要点：
 * - 栈中存放的是「状态快照」，index 指向当前状态。
 * - push 时截断 index 之后的 redo 分支，再追加新状态。
 * - 同 mergeKey 且在时间窗内的连续 push 会「原地替换」当前状态，从而把
 *   连续拖拽折叠成一条可撤销记录（松手后整段拖拽一步撤销）。
 */
import { computed, ref, type ComputedRef } from 'vue';
import { deepClone } from '@/views/editor/utils/object';

export interface UndoRedoOptions {
  /** 栈深度上限，默认 50 */
  limit?: number;
  /** 合并时间窗（毫秒），默认 500 */
  mergeWindowMs?: number;
}

export interface UndoRedoApi<T> {
  /** 压入一个新快照；mergeKey 相同且落在时间窗内则合并为同一条 */
  push: (snapshot: T, mergeKey?: string) => void;
  /** 撤销，返回应恢复到的快照；已是栈底返回 undefined */
  undo: () => T | undefined;
  /** 重做，返回新快照；已是栈顶返回 undefined */
  redo: () => T | undefined;
  canUndo: ComputedRef<boolean>;
  canRedo: ComputedRef<boolean>;
  /** 以新快照重置整条历史（仅保留该基线） */
  reset: (snapshot: T) => void;
  /** 清空历史，回退到初始基线 */
  clear: () => void;
}

export function useUndoRedo<T>(initial: T, options: UndoRedoOptions = {}): UndoRedoApi<T> {
  const limit = options.limit ?? 50;
  const mergeWindowMs = options.mergeWindowMs ?? 500;

  // 初始基线做一份深拷贝，避免外部对象被栈引用污染
  const baseline = deepClone(initial);
  const stack = ref<T[]>([baseline]) as unknown as { value: T[] };
  const index = ref(0);
  const lastMergeKey = ref<string | null>(null);
  const lastPushAt = ref(0);

  function push(snapshot: T, mergeKey?: string): void {
    const snap = deepClone(snapshot);
    const now = Date.now();
    const canMerge =
      mergeKey != null &&
      mergeKey === lastMergeKey.value &&
      now - lastPushAt.value <= mergeWindowMs;

    if (canMerge) {
      // 连续操作：直接覆盖当前 index 指向的快照（最新态），不增加记录数
      stack.value[index.value] = snap;
    } else {
      // 丢弃当前 index 之后的 redo 分支
      const truncated = stack.value.slice(0, index.value + 1);
      truncated.push(snap);
      // 超过深度上限时丢弃最旧的快照，并保持 index 指向栈顶
      if (truncated.length > limit) {
        truncated.shift();
      }
      stack.value = truncated;
      index.value = stack.value.length - 1;
    }
    lastMergeKey.value = mergeKey ?? null;
    lastPushAt.value = now;
  }

  function undo(): T | undefined {
    if (index.value <= 0) return undefined;
    index.value -= 1;
    return deepClone(stack.value[index.value]);
  }

  function redo(): T | undefined {
    if (index.value >= stack.value.length - 1) return undefined;
    index.value += 1;
    return deepClone(stack.value[index.value]);
  }

  function reset(snapshot: T): void {
    stack.value = [deepClone(snapshot)];
    index.value = 0;
    lastMergeKey.value = null;
    lastPushAt.value = 0;
  }

  function clear(): void {
    reset(baseline);
  }

  const canUndo = computed(() => index.value > 0);
  const canRedo = computed(() => index.value < stack.value.length - 1);

  return { push, undo, redo, canUndo, canRedo, reset, clear };
}
