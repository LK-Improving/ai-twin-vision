/**
 * 布局引擎的 Vue 适配层：把纯计算内核接到 DOM 事件上。
 *
 * 职责边界：本层只负责「监听事件 + 单位换算 + 状态标志」，
 * 一切几何结论都来自 core（resizeRect / alignRect / screenToCanvas），
 * 这样内核可以脱离浏览器单测，也便于其他框架复用。
 */
import { ref, type Ref } from 'vue';
import { parseDragPayload } from './drag-payload';
import { snapToGrid } from './geometry';
import { resizeRect, screenToCanvas } from './transform';
import { GRID, type LibraryDragPayload, type Point, type Rect, type ResizeHandle } from './types';

/** 被拖动项：节点 id + 当前矩形 */
export interface DragItem {
  id: string;
  rect: Rect;
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
    opts.onDrop(
      screenToCanvas(
        e.clientX,
        e.clientY,
        { left: rect.left, top: rect.top },
        opts.getScale(),
        opts.getOffset(),
      ),
      payload,
    );
  }

  return { isOver, onDragOver, onDragLeave, onDrop };
}

/**
 * 节点拖动：startDrag 记录初始状态，window 监听 mousemove/up。
 * snap 为真时按 8px 网格吸附位置。
 */
export function useNodeDrag(opts: {
  getScale: () => number;
  snap?: boolean;
  onMove: (id: string, rect: Partial<Rect>) => void;
  onEnd: (ids: string[]) => void;
}) {
  const dragging = ref(false);

  function startDrag(e: MouseEvent, items: DragItem[]): void {
    if (items.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragging.value = true;
    const scale = opts.getScale() || 1;
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

/**
 * 八向缩放：shift 等比（仅角手柄）、alt 以中心对称、可选网格吸附。
 * 计算全部委托给 core.resizeRect。
 */
export function useNodeResize(opts: {
  getScale: () => number;
  snap?: boolean;
  onResize: (id: string, rect: Rect) => void;
  onEnd: (id: string) => void;
}) {
  const resizing = ref(false);

  function startResize(
    e: MouseEvent,
    id: string,
    handle: ResizeHandle,
    initRect: Rect,
    aspect?: number,
  ): void {
    e.preventDefault();
    e.stopPropagation();
    resizing.value = true;
    const scale = opts.getScale() || 1;
    const startX = e.clientX;
    const startY = e.clientY;
    const init = { ...initRect };
    const fromCenter = e.altKey;

    function onMove(ev: MouseEvent): void {
      opts.onResize(
        id,
        resizeRect({
          handle,
          init,
          dx: (ev.clientX - startX) / scale,
          dy: (ev.clientY - startY) / scale,
          fromCenter,
          aspect,
          snap: opts.snap,
        }),
      );
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
 * onPan 给出的是屏幕像素增量，由调用方直接累加到 canvasOffset。
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
