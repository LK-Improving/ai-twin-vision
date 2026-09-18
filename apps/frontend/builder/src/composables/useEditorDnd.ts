/**
 * 编辑器拖拽与缩放交互 composable 集合。
 *
 * 包含：
 * - 组件库 → 画布拖放（HTML5 drag/drop，携带 JSON 负载）
 * - 画布内节点拖动（mousedown → mousemove → mouseup）
 * - 八向缩放手柄（含 shift 等比、alt 从中心、网格吸附、边界吸附对齐线）
 * - 画布平移（空格 / 中键）
 *
 * 所有坐标都按 canvasScale 与 canvasOffset 反算，保证缩放/平移后落点准确。
 */
import { ref, type Ref } from 'vue';
import { clamp, snapToGrid } from '@/views/editor/utils/object';

/** 组件库拖拽负载（dataTransfer 中携带的 JSON） */
export interface LibraryDragPayload {
  source: 'library';
  /** 2D 组件类型（WidgetNode.type） */
  widgetType?: string;
  /** 三维组件实例对应的 biz_component.id */
  componentId?: string;
}

const DRAG_MIME = 'application/x-dt-widget';
const GRID = 8;
const MIN_SIZE = 8;

/** 序列化拖拽负载 */
export function encodeDragPayload(p: LibraryDragPayload): string {
  return JSON.stringify(p);
}

/** 从 drag 事件里解析负载，失败返回 null */
export function parseDragPayload(e: DragEvent): LibraryDragPayload | null {
  const raw =
    e.dataTransfer?.getData(DRAG_MIME) ||
    e.dataTransfer?.getData('text/plain') ||
    '';
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as LibraryDragPayload;
    return obj && obj.source === 'library' ? obj : null;
  } catch {
    return null;
  }
}

export interface Point {
  x: number;
  y: number;
}

/**
 * 屏幕坐标 → 画布设计坐标。
 * 画布内层容器变换：translate(offset) scale(scale)，transform-origin: 0 0。
 */
export function screenToCanvas(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  scale: number,
  offset: Point,
): Point {
  return {
    x: (clientX - containerRect.left - offset.x) / scale,
    y: (clientY - containerRect.top - offset.y) / scale,
  };
}

/** 画布拖放：把库组件拖到画布上 */
export function useCanvasDrop(
  containerRef: Ref<HTMLElement | null>,
  opts: {
    getScale: () => number;
    getOffset: () => Point;
    onDrop: (point: Point, payload: LibraryDragPayload) => void;
  },
) {
  const isOver = ref(false);

  function onDragOver(e: DragEvent): void {
    // 必须阻止默认行为才能触发 drop
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    isOver.value = true;
  }

  function onDragLeave(e: DragEvent): void {
    // 仅当真正离开容器时关闭高亮
    if (containerRef.value && !containerRef.value.contains(e.relatedTarget as Node)) {
      isOver.value = false;
    }
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault();
    isOver.value = false;
    const payload = parseDragPayload(e);
    const el = containerRef.value;
    if (!payload || !el) return;
    const rect = el.getBoundingClientRect();
    const point = screenToCanvas(
      e.clientX,
      e.clientY,
      rect,
      opts.getScale(),
      opts.getOffset(),
    );
    opts.onDrop(point, payload);
  }

  return { isOver, onDragOver, onDragLeave, onDrop };
}

export interface DragItem {
  id: string;
  rect: { x: number; y: number; width: number; height: number };
}

/**
 * 节点拖动。startDrag 记录初始状态，window 监听 mousemove/up。
 * 支持网格吸附（8px）与方向键由调用方处理。
 */
export function useNodeDrag(opts: {
  getScale: () => number;
  snap?: boolean;
  onMove: (id: string, rect: Partial<DragItem['rect']>) => void;
  onEnd: (ids: string[]) => void;
}) {
  const dragging = ref(false);

  function startDrag(e: MouseEvent, items: DragItem[]): void {
    if (items.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragging.value = true;
    const scale = opts.getScale();
    const startX = e.clientX;
    const startY = e.clientY;
    const init = items.map((it) => ({ id: it.id, rect: { ...it.rect } }));

    function onMove(ev: MouseEvent): void {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      for (const it of init) {
        let nx = it.rect.x + dx;
        let ny = it.rect.y + dy;
        if (opts.snap) {
          nx = snapToGrid(nx, GRID);
          ny = snapToGrid(ny, GRID);
        }
        opts.onMove(it.id, { x: nx, y: ny });
      }
    }

    function onUp(): void {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      dragging.value = false;
      opts.onEnd(init.map((i) => i.id));
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return { dragging, startDrag };
}

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/**
 * 八向缩放。startResize 记录初始矩形，按住时：
 * - shift：等比（仅角手柄生效）
 * - alt：以中心为锚点对称缩放
 * - 网格吸附：松手前对坐标做 8px 吸附
 */
export function useNodeResize(opts: {
  getScale: () => number;
  snap?: boolean;
  onResize: (id: string, rect: { x: number; y: number; width: number; height: number }) => void;
  onEnd: (id: string) => void;
}) {
  const resizing = ref(false);

  function startResize(e: MouseEvent, id: string, handle: ResizeHandle, initRect: DragItem['rect'], aspect?: number): void {
    e.preventDefault();
    e.stopPropagation();
    resizing.value = true;
    const scale = opts.getScale();
    const startX = e.clientX;
    const startY = e.clientY;
    const init = { ...initRect };
    const right = init.x + init.width;
    const bottom = init.y + init.height;
    const useAspect = !!aspect && (handle === 'ne' || handle === 'nw' || handle === 'se' || handle === 'sw');
    const fromCenter = e.altKey;

    function compute(ev: MouseEvent): { x: number; y: number; width: number; height: number } {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
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

      // 最小尺寸保护：负值时翻转回正并修正原点
      if (width < MIN_SIZE) {
        x = right - MIN_SIZE;
        width = MIN_SIZE;
      }
      if (height < MIN_SIZE) {
        y = bottom - MIN_SIZE;
        height = MIN_SIZE;
      }

      // 等比：以主方向为基准调整另一方向
      if (useAspect && aspect && aspect > 0) {
        if (handle.includes('e') || handle.includes('w')) {
          height = clamp(width / aspect, MIN_SIZE, Number.MAX_SAFE_INTEGER);
          if (!handle.includes('n')) y = bottom - height;
        } else {
          width = clamp(height * aspect, MIN_SIZE, Number.MAX_SAFE_INTEGER);
          if (!handle.includes('w')) x = right - width;
        }
      }

      if (opts.snap) {
        x = snapToGrid(x, GRID);
        y = snapToGrid(y, GRID);
        width = snapToGrid(width, GRID);
        height = snapToGrid(height, GRID);
      }
      return { x, y, width, height };
    }

    function onMove(ev: MouseEvent): void {
      opts.onResize(id, compute(ev));
    }
    function onUp(): void {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      resizing.value = false;
      opts.onEnd(id);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return { resizing, startResize };
}

/**
 * 画布平移（空格拖拽或中键拖拽）。
 * onPan 返回的是屏幕像素增量，由调用方直接累加到 canvasOffset。
 */
export function useCanvasPan(opts: {
  onPan: (dx: number, dy: number) => void;
  onEnd?: () => void;
}) {
  const panning = ref(false);

  function startPan(e: MouseEvent): void {
    e.preventDefault();
    panning.value = true;
    let startX = e.clientX;
    let startY = e.clientY;
    function onMove(ev: MouseEvent): void {
      opts.onPan(ev.clientX - startX, ev.clientY - startY);
      // 以当前位置为新的起点，保证增量连续
      startX = ev.clientX;
      startY = ev.clientY;
    }
    function onUp(): void {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      panning.value = false;
      opts.onEnd?.();
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return { panning, startPan };
}
