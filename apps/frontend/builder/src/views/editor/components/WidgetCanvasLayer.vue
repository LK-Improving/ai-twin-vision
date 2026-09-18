<script setup lang="ts">
/**
 * 2D 大屏覆盖层：按 page.nodes 用 WidgetRenderer 渲染。
 * 每个节点包一层命中区（node-hit），负责选中与拖动；拖动时计算对齐参考线。
 * 设计坐标系下的绝对定位由 WidgetRenderer 决定，本层只提供命中与拖拽交互。
 */
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { WidgetRenderer } from '@dt/widgets';
import { useEditorStore } from '@/stores/editor';
import { useNodeDrag, type DragItem } from '@/composables/useEditorDnd';
import type { WidgetNode, WidgetRect } from '@dt/shared-types';

const store = useEditorStore();
const { page, canvasScale, selectedIds } = storeToRefs(store);

const emit = defineEmits<{ 'update:guides': [guides: GuideLine[]] }>();

export interface GuideLine {
  orientation: 'v' | 'h';
  /** 设计坐标系下的位置 */
  position: number;
}

const SNAP = 5;

/** 顶层 2D 节点 */
const nodes = computed(() => page.value.nodes);

const drag = useNodeDrag({
  getScale: () => canvasScale.value,
  snap: true,
  onMove: (id: string, rect: Partial<DragItem['rect']>) => {
    // 计算对齐参考线并对齐吸附
    const { snapped, guides } = computeGuides(id, rect);
    store.moveNode(id, snapped);
    emit('update:guides', guides);
  },
  onEnd: (ids: string[]) => {
    store.commitDrag(ids.join(','));
    emit('update:guides', []);
  },
});

/** 计算与其它节点的边缘/中心对齐参考线，并做吸附 */
function computeGuides(
  draggedId: string,
  rect: Partial<WidgetRect>,
): { snapped: Partial<WidgetRect>; guides: GuideLine[] } {
  const others = page.value.nodes.filter((n) => n.id !== draggedId);
  if (!others.length) return { snapped: rect, guides: [] };
  const rx = rect.x ?? 0;
  const ry = rect.y ?? 0;
  const rw = rect.width ?? 0;
  const rh = rect.height ?? 0;
  const edges = {
    left: rx,
    cx: rx + rw / 2,
    right: rx + rw,
    top: ry,
    cy: ry + rh / 2,
    bottom: ry + rh,
  };
  const guideSet = new Set<string>();
  const guides: GuideLine[] = [];
  let nx = rx;
  let ny = ry;
  const trySnap = (val: number, target: number, axis: 'x' | 'y', key: 'left' | 'cx' | 'right' | 'top' | 'cy' | 'bottom') => {
    if (Math.abs(val - target) <= SNAP) {
      const tag = `${axis}:${target.toFixed(1)}`;
      if (!guideSet.has(tag)) {
        guideSet.add(tag);
        guides.push({ orientation: axis === 'x' ? 'v' : 'h', position: target });
      }
      if (axis === 'x') nx = target - (key === 'cx' ? rw / 2 : key === 'right' ? rw : 0);
      else ny = target - (key === 'cy' ? rh / 2 : key === 'bottom' ? rh : 0);
    }
  };
  for (const o of others) {
    const ox = o.rect.x;
    const oy = o.rect.y;
    const ow = o.rect.width;
    const oh = o.rect.height;
    const oe = { left: ox, cx: ox + ow / 2, right: ox + ow, top: oy, cy: oy + oh / 2, bottom: oy + oh };
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

function onNodeMouseDown(e: MouseEvent, node: WidgetNode): void {
  if (e.button !== 0) return;
  if (e.ctrlKey || e.metaKey) {
    const set = new Set(selectedIds.value);
    set.has(node.id) ? set.delete(node.id) : set.add(node.id);
    store.selectNodes([...set]);
  } else if (!selectedIds.value.includes(node.id)) {
    store.selectNodes([node.id]);
  }
  if (node.locked) {
    e.stopPropagation();
    return;
  }
  const items: DragItem[] = store.selectedWrappers
    .filter((w) => w.kind === '2D')
    .map((w) => ({ id: w.id, rect: { ...(w.data as WidgetNode).rect } }));
  drag.startDrag(e, items);
}

function hitStyle(node: WidgetNode): Record<string, string> {
  const r = node.rect;
  return {
    position: 'absolute',
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    pointerEvents: node.visible === false ? 'none' : 'auto',
    cursor: node.locked ? 'not-allowed' : 'move',
    display: node.visible === false ? 'none' : 'block',
  };
}
</script>

<template>
  <div class="widget-layer">
    <div
      v-for="node in nodes"
      :key="node.id"
      class="node-hit"
      :class="{ 'is-selected': selectedIds.includes(node.id) }"
      :data-id="node.id"
      :style="hitStyle(node)"
      @mousedown="onNodeMouseDown($event, node)"
    >
      <WidgetRenderer :node="node" />
    </div>
  </div>
</template>

<style scoped>
.widget-layer {
  position: absolute;
  inset: 0;
}
.node-hit {
  /* 命中区捕获交互，内部组件本身不拦截指针 */
}
.node-hit :deep(.dt-widget) {
  pointer-events: none;
}
.node-hit.is-selected {
  outline: 1px dashed rgba(0, 184, 217, 0.6);
  outline-offset: 1px;
}
</style>
