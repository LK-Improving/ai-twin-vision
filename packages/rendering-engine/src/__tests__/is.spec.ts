import { describe, expect, it } from 'vitest';
import {
  degToRad,
  isArray,
  isNil,
  isNonEmptyString,
  isNumber,
  isPlainObject,
  normalizeScale,
  toNumber,
} from '../utils/is';

describe('rendering-engine/utils/is', () => {
  it('isNil 只认 null 与 undefined（0 / 空串不算）', () => {
    expect(isNil(null)).toBe(true);
    expect(isNil(undefined)).toBe(true);
    // 0 与 '' 是合法配置值，误判会让 scale=0 被当成缺省
    expect(isNil(0)).toBe(false);
    expect(isNil('')).toBe(false);
    expect(isNil(false)).toBe(false);
  });

  it('isPlainObject 排除数组、实例与 null', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(() => 1)).toBe(false);
  });

  it('isNumber 拒绝 NaN 与 Infinity', () => {
    expect(isNumber(1.5)).toBe(true);
    expect(isNumber(NaN)).toBe(false);
    expect(isNumber(Infinity)).toBe(false);
    expect(isNumber('3')).toBe(false);
  });

  it('isNonEmptyString 把全空白视为空', () => {
    expect(isNonEmptyString('a')).toBe(true);
    expect(isNonEmptyString('   ')).toBe(false);
    expect(isNonEmptyString(1)).toBe(false);
  });

  it('isArray / degToRad 基本行为', () => {
    expect(isArray([])).toBe(true);
    expect(isArray({ length: 0 })).toBe(false);
    expect(degToRad(180)).toBeCloseTo(Math.PI, 10);
    expect(degToRad(0)).toBe(0);
  });
});

describe('rendering-engine/utils/normalizeScale', () => {
  it('数字缩放展开为等比三元组', () => {
    expect(normalizeScale(2)).toEqual({ x: 2, y: 2, z: 2 });
    // scale=0 必须保留（隐藏语义），不能被 fallback 覆盖
    expect(normalizeScale(0)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('缺省与非法分量按 fallback 补齐', () => {
    expect(normalizeScale(undefined)).toEqual({ x: 1, y: 1, z: 1 });
    expect(normalizeScale(undefined, 3)).toEqual({ x: 3, y: 3, z: 3 });
    expect(normalizeScale({ x: 2, y: NaN as number, z: 4 }, 1)).toEqual({ x: 2, y: 1, z: 4 });
  });

  it('toNumber 只在可解析为有限数时生效', () => {
    expect(toNumber('42')).toBe(42);
    expect(toNumber(3.5)).toBe(3.5);
    expect(toNumber('abc', -1)).toBe(-1);
    expect(toNumber('', 7)).toBe(7);
    expect(toNumber(null, 0)).toBe(0);
  });
});
