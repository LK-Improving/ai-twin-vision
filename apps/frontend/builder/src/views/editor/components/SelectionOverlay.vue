<script setup lang="ts">
/**
 * 选中框与八向缩放/旋转手柄。
 * - 单选 2D 节点：显示缩放手柄 + 旋转手柄。
 * - 多选：显示包围盒（无手柄）。
 * 位于设计表面内，使用设计坐标；手柄尺寸按 1/scale 反缩放保持视觉恒定。
 */
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useEditorStore } from '@/stores/editor';
import { useNodeResize, type ResizeHandle } from '@/composables/useEditorDnd';
import type { WidgetNode, WidgetRect } from '@dt/shared-types';

const props = defineProps<{ scale: number }>();
const store = useEditorStore();
const { selectedWrappers, canvasScale, canvasOffset, page } = storeToRefs(store);

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** 仅 2D 选中项 */
const twoD = computed(() => selectedWrappers.value.filter((w) => w.kind === '2D') as Array<{ id: string; data: WidgetNode }>);

const single = computed(() => (twoD.value.length === 1 ? twoD.value[0] : null));
const multi = computed(() => (twoD.value.length > 1 ? twoD.value : null));

/** 多选包围盒 */
const bounds = computed(() => {
  if (!multi.value) return null;
  const rects = multi.value.map((w) => w.data.rect);
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
});

const resize = useNodeResize({
  getScale: () => canvasScale.value,
  snap: true,
  onResize: (id: string, rect: WidgetRect) => {
    store.moveNode(id, rect);
  },
  onEnd: (id: string) => {
    store.commitDrag(id);
  },
});

function handleStyle(handle: ResizeHandle, r: WidgetRect): Record<string, string> {
  const size = 9 / props.scale;
  const half = size / 2;
  const pts: Record<ResizeHandle, [number, number]> = {
    nw: [r.x, r.y],
    n: [r.x + r.width / 2, r.y],
    ne: [r.x + r.width, r.y],
    e: [r.x + r.width, r.y + r.height / 2],
    se: [r.x + r.width, r.y + r.height],
    s: [r.x + r.width / 2, r.y + r.height],
    sw: [r.x, r.y + r.height],
    w: [r.x, r.y + r.height / 2],
  };
  const [x, y] = pts[handle];
  return {
    position: 'absolute',
    left: `${x - half}px`,
    top: `${y - half}px`,
    width: `${size}px`,
    height: `${size}px`,
  };
}

function onResizeDown(e: MouseEvent, handle: ResizeHandle, r: WidgetRect): void {
  const aspect = r.width && r.height ? r.width / r.height : undefined;
  resize.startResize(e, single.value!.id, handle, { ...r }, aspect);
}

// -------------------------------------------------------------- 旋转
const rotating = { active: false, cx: 0, cy: 0, id: '', startAngle: 0, startRotate: 0 };
function onRotateDown(e: MouseEvent, r: WidgetRect): void {
  e.preventDefault();
  e.stopPropagation();
  const root = (e.currentTarget as HTMLElement).closest('.design-surface') as HTMLElement | null;
  const off = root ? root.getBoundingClientRect() : null;
  const baseX = off ? off.left : 0;
  const baseY = off ? off.top : 0;
  const cx = baseX + canvasOffset.value.x + (r.x + r.width / 2) * canvasScale.value;
  const cy = baseY + canvasOffset.value.y + (r.y + r.height / 2) * canvasScale.value;
  rotating.active = true;
  rotating.cx = cx;
  rotating.cy = cy;
  rotating.id = single.value!.id;
  rotating.startRotate = r.rotate ?? 0;
  rotating.startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
  window.addEventListener('mousemove', onRotateMove);
  window.addEventListener('mouseup', onRotateUp);
}
function onRotateMove(ev: MouseEvent): void {
  if (!rotating.active) return;
  const ang = Math.atan2(ev.clientY - rotating.cy, ev.clientX - rotating.cx) * (180 / Math.PI);
  const next = rotating.startRotate + (ang - rotating.startAngle);
  const node = findNode(rotating.id);
  if (node) store.updateNode(rotating.id, { rect: { ...node.rect, rotate: Math.round(next) } }, `rotate:${rotating.id}`);
}
function onRotateUp(): void {
  rotating.active = false;
  store.commitDrag(rotating.id);
  window.removeEventListener('mousemove', onRotateMove);
  window.removeEventListener('mouseup', onRotateUp);
}
function findNode(id: string): WidgetNode | null {
  for (const n of page.value.nodes) {
    const r = traverse(n, id);
    if (r) return r;
  }
  return null;
}
function traverse(node: WidgetNode, id: string): WidgetNode | null {
  if (node.id === id) return node;
  if (node.children) for (const c of node.children) {
    const r = traverse(c, id);
    if (r) return r;
  }
  return null;
}

const rotateHandleStyle = computed(() => {
  if (!single.value) return {};
  const r = single.value.data.rect;
  const size = 12 / props.scale;
  return {
    position: 'absolute',
    left: `${r.x + r.width / 2 - size / 2}px`,
    top: `${r.y - 24 / props.scale}px`,
    width: `${size}px`,
    height: `${size}px`,
  } as Record<string, string>;
});
</script>

<template>
  <div class="selection-overlay">
    <!-- 多选包围盒 -->
    <div
      v-if="bounds"
      class="multi-box"
      :style="{ left: bounds.x + 'px', top: bounds.y + 'px', width: bounds.width + 'px', height: bounds.height + 'px' }"
    />

    <!-- 单选手柄 -->
    <template v-if="single">
      <div
        class="sel-box"
        :style="{ left: single.data.rect.x + 'px', top: single.data.rect.y + 'px', width: single.data.rect.width + 'px', height: single.data.rect.height + 'px' }"
      >
        <div
          v-for="h in HANDLES"
          :key="h"
          class="handle"
          :class="'h-' + h"
          :style="handleStyle(h, single.data.rect)"
          @mousedown="onResizeDown($event, h, single.data.rect)"
        />
        <div class="rotate-line" :style="{ left: single.data.rect.width / 2 + 'px' }" />
        <div class="rotate-handle" :style="rotateHandleStyle" @mousedown="onRotateDown($event, single.data.rect)">
          <svg viewBox="0 0 24 24" :width="10 / scale" :height="10 / scale" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 3v9m0 0l-3-3m3 3l3-3" />
          </svg>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.selection-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.multi-box {
  position: absolute;
  border: 1px dashed #00b8d9;
  pointer-events: none;
}
.sel-box {
  position: absolute;
  border: 1px solid #00b8d9;
  pointer-events: none;
}
.handle {
  position: absolute;
  background: #fff;
  border: 1px solid #00b8d9;
  border-radius: 2px;
  pointer-events: auto;
  cursor: nwse-resize;
}
.handle.h-n,
.handle.h-s {
  cursor: ns-resize;
}
.handle.h-e,
.handle.h-w {
  cursor: ew-resize;
}
.handle.h-ne,
.handle.h-sw {
  cursor: nesw-resize;
}
.rotate-line {
  position: absolute;
  top: -24px;
  width: 1px;
  height: 24px;
  background: #00b8d9;
  pointer-events: none;
}
.rotate-handle {
  position: absolute;
  background: #fff;
  border: 1px solid #00b8d9;
  border-radius: 50%;
  color: #00b8d9;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  cursor: grab;
}
</style>
