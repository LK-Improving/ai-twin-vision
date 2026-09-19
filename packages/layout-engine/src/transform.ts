/**
 * 坐标换算与缩放计算（纯函数，无 DOM / 无 Vue）。
 *
 * 说明：入参 dx/dy 一律为「画布设计坐标」增量，屏幕像素 → 画布单位的除法由调用方
 * （Vue 适配层）完成，保证内核可脱离浏览器测试。
 */
import { clamp, snapToGrid } from './geometry';
import { GRID, MIN_SIZE, type Point, type Rect, type ResizeHandle } from './types';

/** 画布容器左上角（屏幕坐标），刻意用结构化类型而非 DOMRect，便于测试与 SSR */
export interface ContainerOrigin {
  left: number;
  top: number;
}

/**
 * 屏幕坐标 → 画布设计坐标。
 * 画布内层容器变换约定为 `translate(offset) scale(scale)`，transform-origin: 0 0。
 */
export function screenToCanvas(
  clientX: number,
  clientY: number,
  container: ContainerOrigin,
  scale: number,
  offset: Point,
): Point {
  const safeScale = scale || 1;
  return {
    x: (clientX - container.left - offset.x) / safeScale,
    y: (clientY - container.top - offset.y) / safeScale,
  };
}

/** 屏幕像素增量 → 画布单位增量 */
export function screenDeltaToCanvas(dx: number, dy: number, scale: number): Point {
  const safeScale = scale || 1;
  return { x: dx / safeScale, y: dy / safeScale };
}

export interface ResizeParams {
  /** 拖动手柄方向 */
  handle: ResizeHandle;
  /** 起手时的矩形 */
  init: Rect;
  /** 画布单位增量 */
  dx: number;
  dy: number;
  /** alt：以中心为锚点对称缩放 */
  fromCenter?: boolean;
  /** shift：等比缩放（仅角手柄生效），传宽/高比 */
  aspect?: number;
  /** 是否按网格吸附坐标与尺寸 */
  snap?: boolean;
  grid?: number;
  /** 最小尺寸保护，默认 MIN_SIZE */
  minSize?: number;
}

/**
 * 八向缩放计算。
 * 与编辑器既有实现逐行等价：先按手柄推边，再做最小尺寸保护（负尺寸翻转回正），
 * 最后应用等比约束与网格吸附。
 */
export function resizeRect(params: ResizeParams): Rect {
  const { handle, init, dx, dy, fromCenter = false, aspect, snap, minSize = MIN_SIZE } = params;
  const grid = params.grid ?? GRID;

  const right = init.x + init.width;
  const bottom = init.y + init.height;
  let x = init.x;
  let y = init.y;
  let width = init.width;
  let height = init.height;

  if (handle.includes('w')) {
    if (fromCenter) width = init.width - 2 * dx;
    else {
      x = init.x + dx;
      width = right - x;
    }
  }
  if (handle.includes('e')) {
    if (fromCenter) {
      x = init.x - dx;
      width = init.width + 2 * dx;
    } else {
      width = init.width + dx;
    }
  }
  if (handle.includes('n')) {
    if (fromCenter) height = init.height - 2 * dy;
    else {
      y = init.y + dy;
      height = bottom - y;
    }
  }
  if (handle.includes('s')) {
    if (fromCenter) {
      y = init.y - dy;
      height = init.height + 2 * dy;
    } else {
      height = init.height + dy;
    }
  }

  // 最小尺寸保护：负值或过小时翻转回正并修正原点
  if (width < minSize) {
    x = right - minSize;
    width = minSize;
  }
  if (height < minSize) {
    y = bottom - minSize;
    height = minSize;
  }

  const isCorner = handle === 'ne' || handle === 'nw' || handle === 'se' || handle === 'sw';
  if (aspect && isCorner && aspect > 0) {
    if (handle.includes('e') || handle.includes('w')) {
      height = clamp(width / aspect, minSize, Number.MAX_SAFE_INTEGER);
      if (!handle.includes('n')) y = bottom - height;
    } else {
      width = clamp(height * aspect, minSize, Number.MAX_SAFE_INTEGER);
      if (!handle.includes('w')) x = right - width;
    }
  }

  if (snap) {
    x = snapToGrid(x, grid);
    y = snapToGrid(y, grid);
    width = snapToGrid(width, grid);
    height = snapToGrid(height, grid);
  }

  return { x, y, width, height };
}
