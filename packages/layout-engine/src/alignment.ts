/**
 * 对齐吸附：把被拖动矩形的六条边与其它矩形对齐，命中阈值则吸附并产出参考线。
 *
 * 与编辑器原实现的三点关键行为保持一致（否则会改变手感）：
 * 1. 按固定顺序逐条尝试，后命中的会覆盖先命中的位移；
 * 2. 同轴同位置的参考线去重（`axis:position` 标签，保留 1 位小数）；
 * 3. 只改 x/y，不改 width/height。
 */
import { rectEdges } from './geometry';
import { SNAP_DISTANCE, type AlignResult, type GuideLine, type Rect } from './types';

type Axis = 'x' | 'y';
type EdgeKey = 'left' | 'cx' | 'right' | 'top' | 'cy' | 'bottom';

export interface AlignOptions {
  /** 吸附阈值（画布单位），默认 SNAP_DISTANCE */
  snapDistance?: number;
}

/**
 * @param rect   被拖动矩形
 * @param others 其它矩形（调用方需排除自身）
 */
export function alignRect(rect: Rect, others: Rect[], options: AlignOptions = {}): AlignResult {
  const snap = options.snapDistance ?? SNAP_DISTANCE;
  const guides: GuideLine[] = [];
  if (!others.length) return { snapped: { ...rect }, guides };

  const edges = rectEdges(rect);
  const rw = rect.width;
  const rh = rect.height;
  let nx = rect.x;
  let ny = rect.y;
  const seen = new Set<string>();

  const trySnap = (val: number, target: number, axis: Axis, key: EdgeKey): void => {
    if (Math.abs(val - target) > snap) return;
    const tag = `${axis}:${target.toFixed(1)}`;
    if (!seen.has(tag)) {
      seen.add(tag);
      guides.push({ orientation: axis === 'x' ? 'v' : 'h', position: target });
    }
    if (axis === 'x') nx = target - (key === 'cx' ? rw / 2 : key === 'right' ? rw : 0);
    else ny = target - (key === 'cy' ? rh / 2 : key === 'bottom' ? rh : 0);
  };

  for (const o of others) {
    const oe = rectEdges(o);
    trySnap(edges.left, oe.left, 'x', 'left');
    trySnap(edges.left, oe.cx, 'x', 'left');
    trySnap(edges.left, oe.right, 'x', 'left');
    trySnap(edges.cx, oe.cx, 'x', 'cx');
    trySnap(edges.right, oe.left, 'x', 'right');
    trySnap(edges.right, oe.right, 'x', 'right');
    trySnap(edges.top, oe.top, 'y', 'top');
    trySnap(edges.top, oe.cy, 'y', 'top');
    trySnap(edges.top, oe.bottom, 'y', 'top');
    trySnap(edges.cy, oe.cy, 'y', 'cy');
    trySnap(edges.bottom, oe.bottom, 'y', 'bottom');
  }

  return { snapped: { ...rect, x: nx, y: ny }, guides };
}
