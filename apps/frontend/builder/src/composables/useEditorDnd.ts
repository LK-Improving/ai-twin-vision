/**
 * 兼容出口：画布拖拽/缩放交互逻辑已上提为 @dt/layout-engine（迭代 1.2）。
 *
 * 保留本文件只为不改动既有 import 路径（SceneCanvas / SelectionOverlay /
 * WidgetCanvasLayer / WidgetLibraryPanel 都从这里取）；新代码请直接依赖
 * '@dt/layout-engine'，其中 core 子入口不含 Vue 依赖。
 */
export {
  encodeDragPayload,
  parseDragPayload,
  screenToCanvas,
  useCanvasDrop,
  useNodeDrag,
  useNodeResize,
  useCanvasPan,
  type DragItem,
  type LibraryDragPayload,
  type Point,
  type ResizeHandle,
} from '@dt/layout-engine';
