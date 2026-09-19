import { describe, expect, it } from 'vitest';
import {
  alignRect,
  parseDragPayload,
  rectEdges,
  resizeRect,
  screenToCanvas,
  snapToGrid,
} from '../core';

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('layout-engine/transform', () => {
  it('屏幕坐标按 offset 与 scale 反算为画布坐标', () => {
    expect(screenToCanvas(300, 200, { left: 100, top: 50 }, 2, { x: 20, y: 10 })).toEqual({
      x: 90,
      y: 70,
    });
  });

  it('scale 为 0 时按 1 处理，不产生 Infinity', () => {
    const p = screenToCanvas(10, 10, { left: 0, top: 0 }, 0, { x: 0, y: 0 });
    expect(Number.isFinite(p.x)).toBe(true);
  });

  it('east 手柄只增宽度，west 手柄同时移动原点', () => {
    const init = rect(100, 100, 200, 100);
    expect(resizeRect({ handle: 'e', init, dx: 30, dy: 0 })).toEqual({
      x: 100,
      y: 100,
      width: 230,
      height: 100,
    });
    expect(resizeRect({ handle: 'w', init, dx: 30, dy: 0 })).toEqual({
      x: 130,
      y: 100,
      width: 170,
      height: 100,
    });
  });

  it('se 角手柄在 alt 下以中心对称缩放', () => {
    const init = rect(100, 100, 200, 100);
    const out = resizeRect({ handle: 'se', init, dx: 20, dy: 10, fromCenter: true });
    expect(out).toEqual({ x: 80, y: 90, width: 240, height: 120 });
  });

  it('拖过头导致负尺寸时翻转回最小值并保持原右/下边界', () => {
    const init = rect(100, 100, 50, 50);
    const out = resizeRect({ handle: 'w', init, dx: 500, dy: 0 });
    expect(out.width).toBe(8);
    expect(out.x).toBe(142);
  });

  it('shift 等比仅对角手柄生效，边手柄保持单向', () => {
    const corner = resizeRect({
      handle: 'se',
      init: rect(0, 0, 200, 100),
      dx: 100,
      dy: 0,
      aspect: 2,
    });
    expect(corner.width / corner.height).toBeCloseTo(2, 5);
    const edge = resizeRect({ handle: 'e', init: rect(0, 0, 200, 100), dx: 100, dy: 0, aspect: 2 });
    expect(edge.height).toBe(100);
  });

  it('snap 时坐标与尺寸都吸附到网格', () => {
    const out = resizeRect({ handle: 'e', init: rect(10, 10, 33, 21), dx: 5, dy: 0, snap: true });
    expect(out).toEqual({ x: 8, y: 8, width: 40, height: 24 });
  });
});

describe('layout-engine/alignment', () => {
  it('无其它节点时不吸附、不产出参考线', () => {
    const r = rect(10, 10, 50, 50);
    expect(alignRect(r, [])).toEqual({ snapped: r, guides: [] });
  });

  it('左边缘 4px 内吸附到目标并产出一条竖参考线', () => {
    const res = alignRect(rect(96, 500, 40, 20), [rect(100, 100, 200, 100)]);
    expect(res.snapped.x).toBe(100);
    expect(res.snapped.y).toBe(500);
    expect(res.guides).toEqual([{ orientation: 'v', position: 100 }]);
  });

  it('超出阈值则不吸附', () => {
    const res = alignRect(rect(80, 500, 40, 20), [rect(100, 100, 200, 100)]);
    expect(res.snapped.x).toBe(80);
    expect(res.guides).toEqual([]);
  });

  it('顶边落入目标中心线阈值内时，直接对齐到中心线', () => {
    const res = alignRect(rect(500, 148, 40, 20), [rect(0, 100, 200, 100)]);
    expect(res.snapped.y).toBe(150);
    expect(res.snapped.x).toBe(500);
    expect(res.guides).toEqual([{ orientation: 'h', position: 150 }]);
  });

  it('中心线对中心线吸附时按半高回退，只改 y 不改尺寸', () => {
    const res = alignRect(rect(500, 141, 40, 20), [rect(0, 100, 200, 100)]);
    expect(res.snapped).toEqual({ x: 500, y: 140, width: 40, height: 20 });
    expect(res.guides).toEqual([{ orientation: 'h', position: 150 }]);
  });

  it('同轴同位置的重复参考线只保留一条', () => {
    const res = alignRect(rect(100, 500, 40, 20), [
      rect(100, 100, 200, 100),
      rect(100, 400, 50, 50),
    ]);
    expect(res.guides.filter((g) => g.orientation === 'v' && g.position === 100)).toHaveLength(1);
  });

  it('rectEdges 覆盖六条边', () => {
    expect(rectEdges(rect(10, 20, 100, 40))).toEqual({
      left: 10,
      cx: 60,
      right: 110,
      top: 20,
      cy: 40,
      bottom: 60,
    });
  });
});

describe('layout-engine/drag-payload', () => {
  it('只接受本平台 source=library 的负载', () => {
    const good = {
      dataTransfer: { getData: () => JSON.stringify({ source: 'library', widgetType: 'CHART' }) },
    };
    expect(parseDragPayload(good)).toEqual({ source: 'library', widgetType: 'CHART' });
    expect(parseDragPayload({ dataTransfer: { getData: () => '{"source":"other"}' } })).toBeNull();
    expect(parseDragPayload({ dataTransfer: { getData: () => 'not-json' } })).toBeNull();
    expect(parseDragPayload({})).toBeNull();
  });
});

describe('layout-engine/geometry', () => {
  it('grid<=0 时 snapToGrid 原样返回', () => {
    expect(snapToGrid(37.2, 0)).toBe(37.2);
    expect(snapToGrid(37.2, 8)).toBe(40);
  });
});
