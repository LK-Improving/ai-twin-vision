/**
 * 编辑器专用小工具：深拷贝、深合并、ID 生成、数值约束等。
 * 不依赖 lodash，全部自己实现，避免引入额外体积。
 */

/**
 * 结构化深拷贝。
 * 优先使用浏览器/Node 内置的 structuredClone；遇到不可结构化克隆的对象
 * （含函数、DOM 节点等）时回退到 JSON 序列化方案。
 */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  // structuredClone 无法克隆函数、Symbol、DOM 等，需兜底
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // 继续走 JSON 兜底
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 深合并对象：递归合并嵌套普通对象；数组与原始值直接覆盖。
 * target 不会被修改，返回新的对象。
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  patch: Partial<T> | Record<string, unknown>,
): T {
  const out: Record<string, unknown> = { ...target };
  for (const key of Object.keys(patch)) {
    const pv = (patch as Record<string, unknown>)[key];
    const tv = (target as Record<string, unknown>)[key];
    const isObj = (v: unknown): v is Record<string, unknown> =>
      !!v && typeof v === 'object' && !Array.isArray(v);
    if (isObj(pv) && isObj(tv)) {
      out[key] = deepMerge(tv, pv);
    } else {
      out[key] = pv;
    }
  }
  return out as T;
}

/** 将 patch 浅合并进 target（target 会被原地修改，用于响应式对象高效更新） */
export function assignMerge<T extends Record<string, unknown>>(target: T, patch: Partial<T>): void {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  for (const key of Object.keys(patch)) {
    const pv = (patch as Record<string, unknown>)[key];
    const tv = (target as Record<string, unknown>)[key];
    if (isObj(pv) && isObj(tv)) {
      assignMerge(tv, pv);
    } else if (pv !== undefined) {
      (target as Record<string, unknown>)[key] = pv;
    }
  }
}

/** 单调递增序号，避免纯随机造成冲突 */
let _seq = 0;

/** 生成带前缀的唯一 ID（时间基数 + 自增序号，足够编辑期唯一） */
export function uid(prefix = 'n'): string {
  _seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${_seq.toString(36)}`;
}

/** 数值约束到 [min, max] */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 网格吸附：把值吸附到最近的 grid 整数倍 */
export function snapToGrid(value: number, grid: number): number {
  if (grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

/** 两点距离 */
export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** 防抖：在 wait 毫秒内的连续调用只触发最后一次 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** 是否近似相等（用于浮点比较，容差 1e-6） */
export function approxEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps;
}
