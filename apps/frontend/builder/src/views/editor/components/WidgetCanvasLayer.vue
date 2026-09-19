<script setup lang="ts">
/**
 * 2D 大屏覆盖层：按 page.nodes 用 WidgetRenderer 渲染。
 * 每个节点包一层命中区（node-hit），负责选中与拖动；拖动时计算对齐参考线。
 * 设计坐标系下的绝对定位由 WidgetRenderer 决定，本层只提供命中与拖拽交互。
 */
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { WidgetRenderer } from '@dt/widgets';
import { alignRect, type Rect } from '@dt/layout-engine';
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

/**
 * 对齐参考线与吸附：几何计算全部交给 @dt/layout-engine，本处只做「取其它节点 + 类型适配」。
 *
 * 行为一致性说明：useNodeDrag 的 onMove 只交出 { x, y }，因此这里宽高按 0 参与计算，
 * 与上提前完全一致（副作用：中心线/右边等价于左边对齐）。
 * 要拿到完整对齐效果，需把节点当前 rect 的宽高一起传入——已记入迭代清单待办。
 */
function computeGuides(
  draggedId: string,
  rect: Partial<WidgetRect>,
): { snapped: Partial<WidgetRect>; guides: GuideLine[] } {
  const others: Rect[] = page.value.nodes
    .filter((n) => n.id !== draggedId)
    .map((n) => ({ x: n.rect.x, y: n.rect.y, width: n.rect.width, height: n.rect.height }));
  const target: Rect = {
    x: rect.x ?? 0,
    y: rect.y ?? 0,
    width: rect.width ?? 0,
    height: rect.height ?? 0,
  };
  const { snapped, guides } = alignRect(target, others);
  return { snapped: { ...rect, x: snapped.x, y: snapped.y }, guides };
}

function onNodeMouseDown(e: MouseEvent, node: WidgetNode): void {
  if (e.button !== 0) return;
  if (e.ctrlKey || e.metaKey) {
    const set = new Set(selectedIds.value);
    // 多选切换：已选则移除，未选则加入
    if (set.has(node.id)) set.delete(node.id);
    else set.add(node.id);
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

/** 组件名标签文案：没有名字就退化为类型码，保证每个块都有标识 */
function labelText(node: WidgetNode): string {
  return node.name || String(node.type);
}

/** 节点贴画布顶边时标签翻到块内，避免被画布视口裁掉 */
const TOP_EDGE = 22;
</script>

<template>
  <div class="widget-layer">
    <div
      v-for="node in nodes"
      :key="node.id"
      class="node-hit"
      :class="{
        'is-selected': selectedIds.includes(node.id),
        'is-top-edge': node.rect.y < TOP_EDGE,
      }"
      :data-id="node.id"
      :style="hitStyle(node)"
      @mousedown="onNodeMouseDown($event, node)"
    >
      <span class="node-label">{{ labelText(node) }}</span>
      <WidgetRenderer :node="node" fill />
    </div>
  </div>
</template>

<style scoped>
.widget-layer {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
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
/* 组件名标签：贴在块左上角外侧，像剪辑软件里每个片段的标签 */
.node-label {
  position: absolute;
  left: -1px;
  top: -19px;
  max-width: 100%;
  height: 19px;
  padding: 0 7px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(0, 200, 224, 0.34);
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  background: rgba(11, 18, 32, 0.92);
  color: #8fe6f5;
  font-size: 11px;
  line-height: 17px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  user-select: none;
  z-index: 1;
}
/* 贴顶边的节点：标签翻到块内，避免被画布视口裁掉 */
.node-hit.is-top-edge .node-label {
  top: 0;
  border-radius: 4px;
  border-bottom: 1px solid rgba(0, 200, 224, 0.34);
}
.node-hit.is-selected .node-label {
  border-color: rgba(0, 234, 255, 0.75);
  background: rgba(0, 60, 78, 0.95);
  color: #d9f8ff;
}
.node-hit.is-selected.is-top-edge .node-label {
  border-bottom-color: rgba(0, 234, 255, 0.75);
}
</style>
