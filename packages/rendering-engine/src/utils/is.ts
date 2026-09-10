/**
 * 小型类型判断工具集合。
 * 全部为纯函数，无副作用，供双引擎内部复用。
 */

/** 是否为 null 或 undefined */
export function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/** 是否为普通对象（不含 null / 数组 / 函数） */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** 是否为有限数字 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 数组安全判断 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** 字符串非空判断 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** 把可能为 Vector3Like 的缩放值归一化为三元组 */
export function normalizeScale(
  scale: number | { x: number; y: number; z: number } | undefined,
  fallback = 1,
): { x: number; y: number; z: number } {
  if (isNil(scale)) return { x: fallback, y: fallback, z: fallback };
  if (typeof scale === 'number') return { x: scale, y: scale, z: scale };
  return {
    x: isNumber(scale.x) ? scale.x : fallback,
    y: isNumber(scale.y) ? scale.y : fallback,
    z: isNumber(scale.z) ? scale.z : fallback,
  };
}

/** 角度（度）转弧度 */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 将可能为字符串的数字解析为 number，失败返回 fallback */
export function toNumber(value: unknown, fallback = 0): number {
  if (isNumber(value)) return value;
  if (isNonEmptyString(value)) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
