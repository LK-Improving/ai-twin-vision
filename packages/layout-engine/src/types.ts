/**
 * 布局引擎公共类型：全部为纯数据结构，不依赖 DOM / Vue。
 */

/** 画布设计坐标点 */
export interface Point {
  x: number;
  y: number;
}

/** 画布设计坐标矩形 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 八向缩放手柄 */
export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** 矩形六条参考边 */
export interface RectEdges {
  left: number;
  cx: number;
  right: number;
  top: number;
  cy: number;
  bottom: number;
}

/** 对齐参考线：v 竖线（用 x 定位）/ h 横线（用 y 定位） */
export interface GuideLine {
  orientation: 'v' | 'h';
  position: number;
}

/** 组件库拖拽负载（dataTransfer 中携带的 JSON） */
export interface LibraryDragPayload {
  source: 'library';
  /** 2D 组件类型（WidgetNode.type） */
  widgetType?: string;
  /** 三维组件实例对应的 biz_component.id */
  componentId?: string;
}

/** 对齐吸附计算结果 */
export interface AlignResult {
  /** 吸附后的矩形（未命中任何参考线时与入参一致） */
  snapped: Rect;
  /** 需要绘制的参考线 */
  guides: GuideLine[];
}

/** 网格边长（设计坐标 px） */
export const GRID = 8;
/** 缩放下限，避免翻转与零尺寸 */
export const MIN_SIZE = 8;
/** 对齐吸附阈值（设计坐标 px）：沿用编辑器历史值 5，改大会直接改变拖拽手感 */
export const SNAP_DISTANCE = 5;
