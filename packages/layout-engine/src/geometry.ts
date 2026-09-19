/**
 * 纯几何原语：数值约束、网格吸附、矩形边线求取。
 * 无副作用、无 DOM 依赖，可单独测试。
 */
import type { Rect, RectEdges } from './types';

/** 数值约束到 [min, max] */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 网格吸附：把值吸附到最近的 grid 整数倍；grid<=0 时原样返回 */
export function snapToGrid(value: number, grid: number): number {
  if (grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

/** 求矩形的六条参考边（左右上下 + 横纵中心） */
export function rectEdges(rect: Rect): RectEdges {
  return {
    left: rect.x,
    cx: rect.x + rect.width / 2,
    right: rect.x + rect.width,
    top: rect.y,
    cy: rect.y + rect.height / 2,
    bottom: rect.y + rect.height,
  };
}

/** 浅拷贝矩形，避免调用方误改入参 */
export function cloneRect(rect: Rect): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/** 按向量平移矩形 */
export function translateRect(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}
