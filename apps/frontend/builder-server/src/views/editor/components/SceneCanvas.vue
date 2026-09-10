<script setup lang="ts">
/**
 * 核心画布：三维层 + 2D 覆盖层 + 交互层，三层叠加。
 * - 三维层：TwinViewer.create 创建，深监听 engineConfig 防抖下发给 applyConfig；
 *   components 变化做增量 diff（add/update/remove）。
 * - 2D 覆盖层：WidgetCanvasLayer 按 node.rect 渲染（容器随 canvas 尺寸与缩放变换）。
 * - 交互层：SelectionOverlay、AlignGuides、CanvasRuler、网格背景、框选矩形。
 * 画布支持：Ctrl+滚轮以鼠标为中心缩放、空格/中键平移、拖拽空白框选 2D 节点。
 *
 * 注意：TwinViewer 实例保存在组件内（shallowRef），绝不放进 Pinia，避免响应式代理污染 WebGL 对象。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { TwinViewer } from '@dt/rendering-engine';
import type { SceneComponentInstance, PerfStats } from '@dt/shared-types';
import { useEditorStore } from '@/stores/editor';
import { storeToRefs } from 'pinia';
import { useToast } from '@/composables/useToast';
import {
  useCanvasDrop,
  useCanvasPan,
  screenToCanvas,
  type LibraryDragPayload,
  type Point,
} from '@/composables/useEditorDnd';
import { deepClone, debounce, clamp } from '@/views/editor/utils/object';
import WidgetCanvasLayer, { type GuideLine } from './WidgetCanvasLayer.vue';
import SelectionOverlay from './SelectionOverlay.vue';
import AlignGuides from './AlignGuides.vue';
import CanvasRuler from './CanvasRuler.vue';

const store = useEditorStore();
const toast = useToast();
const {
  engineConfig,
  components,
  canvasScale,
  canvasOffset,
  showGrid,
  showRuler,
  perfStats,
  page,
} = storeToRefs(store);

const rootRef = ref<HTMLElement | null>(null);
const threeRef = ref<HTMLElement | null>(null);
const viewer = shallowRef<TwinViewer | null>(null);
const spaceDown = ref(false);
const boxRect = ref<{ x: number; y: number; w: number; h: number } | null>(null);
const guides = ref<GuideLine[]>([]);
const containerSize = ref({ width: 0, height: 0 });

// 实体签名表，用于增量 diff
const entitySigs = new Map<string, string>();

function entitySig(c: SceneComponentInstance): string {
  return JSON.stringify({
    p: c.position,
    cfg: c.componentConfig,
    v: c.visible,
    l: c.layerId,
    t: c.componentType,
  });
}

function reconcileEntities(): void {
  const v = viewer.value;
  if (!v) return;
  const current = new Map(store.components.map((c) => [c.id, c]));
  for (const id of [...entitySigs.keys()]) {
    if (!current.has(id)) {
      v.removeEntity(id);
      entitySigs.delete(id);
    }
  }
  for (const c of store.components) {
    const s = entitySig(c);
    const existed = entitySigs.has(c.id);
    if (!existed || entitySigs.get(c.id) !== s) {
      if (existed) v.updateEntity(c.id, deepClone(c));
      else void v.addEntity(deepClone(c));
      entitySigs.set(c.id, s);
    }
  }
}

// -------------------------------------------------------------- 引擎事件
function onPick(res: { entityId?: string }): void {
  if (res.entityId) store.selectNodes([res.entityId]);
  else store.clearSelection();
}
function onStats(s: PerfStats): void {
  store.perfStats = s;
}
function onDegrade(): void {
  toast.warning('渲染性能不足，已自动降级以保证流畅');
}

// -------------------------------------------------------------- 配置监听（防抖 300ms）
const applyConfigDebounced = debounce(() => {
  const v = viewer.value;
  if (!v) return;
  void v.applyConfig(deepClone(store.engineConfig));
}, 300);

// -------------------------------------------------------------- 生命周期
let resizeObserver: ResizeObserver | null = null;

onMounted(async () => {
  await nextTick();
  if (!threeRef.value || !rootRef.value) return;
  measure();
  try {
    viewer.value = await TwinViewer.create({
      container: threeRef.value,
      config: deepClone(store.engineConfig),
    });
  } catch (err) {
    toast.error('三维引擎初始化失败');
    return;
  }
  viewer.value.on('click', onPick);
  viewer.value.on('stats', onStats);
  viewer.value.on('degrade', onDegrade);
  viewer.value.on('camera-change', (v) => store.setCurrentCamera(v));

  // 首次把已有组件与配置下发
  reconcileEntities();
  void viewer.value.applyConfig(deepClone(store.engineConfig));

  resizeObserver = new ResizeObserver(() => {
    measure();
    viewer.value?.resize();
  });
  resizeObserver.observe(rootRef.value);

  // 滚轮缩放（非 passive，以便 preventDefault）
  rootRef.value.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onSpaceDown);
  window.addEventListener('keyup', onSpaceUp);
});

onBeforeUnmount(() => {
  rootRef.value?.removeEventListener('wheel', onWheel);
  window.removeEventListener('keydown', onSpaceDown);
  window.removeEventListener('keyup', onSpaceUp);
  resizeObserver?.disconnect();
  viewer.value?.destroy();
  viewer.value = null;
});

watch(engineConfig, applyConfigDebounced, { deep: true });
watch(components, reconcileEntities, { deep: true });

function measure(): void {
  if (!rootRef.value) return;
  const r = rootRef.value.getBoundingClientRect();
  containerSize.value = { width: r.width, height: r.height };
}

// -------------------------------------------------------------- 缩放 / 平移 / 框选
function onWheel(e: WheelEvent): void {
  if (!e.ctrlKey) return; // 仅 Ctrl + 滚轮缩放
  e.preventDefault();
  const rect = rootRef.value!.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const old = store.canvasScale;
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  const next = clamp(old * factor, 0.1, 4);
  const wx = (mx - store.canvasOffset.x) / old;
  const wy = (my - store.canvasOffset.y) / old;
  store.setCanvasOffset(mx - wx * next, my - wy * next);
  store.setCanvasScale(next);
}

const pan = useCanvasPan({
  onPan: (dx, dy) => {
    store.setCanvasOffset(store.canvasOffset.x + dx, store.canvasOffset.y + dy);
  },
});

function onRootMouseDown(e: MouseEvent): void {
  // 中键或空格 + 左键：平移
  if (e.button === 1 || (spaceDown.value && e.button === 0)) {
    e.preventDefault();
    pan.startPan(e);
    return;
  }
  if (e.button !== 0) return;
  const rect = rootRef.value!.getBoundingClientRect();
  const startX = e.clientX - rect.left;
  const startY = e.clientY - rect.top;
  let moved = false;
  const move = (ev: MouseEvent) => {
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (Math.abs(x - startX) > 2 || Math.abs(y - startY) > 2) moved = true;
    boxRect.value = {
      x: Math.min(startX, x),
      y: Math.min(startY, y),
      w: Math.abs(x - startX),
      h: Math.abs(y - startY),
    };
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    const r = boxRect.value;
    boxRect.value = null;
    if (moved && r) selectInBox(r, rect);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

function selectInBox(r: { x: number; y: number; w: number; h: number }, rect: DOMRect): void {
  const a = screenToCanvas(r.x, r.y, rect, store.canvasScale, store.canvasOffset);
  const b = screenToCanvas(r.x + r.w, r.y + r.h, rect, store.canvasScale, store.canvasOffset);
  const ids: string[] = [];
  for (const n of store.page.nodes) {
    const nr = n.rect;
    if (nr.x < b.x && nr.x + nr.width > a.x && nr.y < b.y && nr.y + nr.height > a.y) ids.push(n.id);
  }
  store.selectNodes(ids);
}

function onSpaceDown(e: KeyboardEvent): void {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (e.code === 'Space') {
    spaceDown.value = true;
    e.preventDefault();
  }
}
function onSpaceUp(e: KeyboardEvent): void {
  if (e.code === 'Space') spaceDown.value = false;
}

// -------------------------------------------------------------- 拖放（库 → 画布）
const drop = useCanvasDrop(rootRef, {
  getScale: () => store.canvasScale,
  getOffset: () => store.canvasOffset,
  onDrop: (point: Point, payload: LibraryDragPayload) => {
    if (payload.widgetType) {
      store.addWidget(payload.widgetType, point);
    } else if (payload.componentId) {
      // 三维组件落到画布：屏幕点转地理坐标较复杂，这里以默认地理锚点添加
      void store.add3DComponent(payload.componentId);
    }
  },
});

// -------------------------------------------------------------- 样式
const canvasW = computed(() => engineConfig.value.canvas?.width ?? 1920);
const canvasH = computed(() => engineConfig.value.canvas?.height ?? 1080);

const surfaceStyle = computed<Record<string, string>>(() => ({
  position: 'absolute',
  left: '0',
  top: '0',
  width: `${canvasW.value}px`,
  height: `${canvasH.value}px`,
  transform: `translate(${canvasOffset.value.x}px, ${canvasOffset.value.y}px) scale(${canvasScale.value})`,
  transformOrigin: '0 0',
  pointerEvents: 'none',
}));

const boxStyle = computed<Record<string, string>>(() =>
  boxRect.value
    ? {
        position: 'absolute',
        left: `${boxRect.value.x}px`,
        top: `${boxRect.value.y}px`,
        width: `${boxRect.value.w}px`,
        height: `${boxRect.value.h}px`,
      }
    : {},
);
</script>

<template>
  <div ref="rootRef" class="scene-canvas" @mousedown="onRootMouseDown" @dragover="drop.onDragOver" @dragleave="drop.onDragLeave" @drop="drop.onDrop">
    <!-- 三维层 -->
    <div ref="threeRef" class="three-layer" />

    <!-- 2D 设计表面（随画布尺寸与缩放变换） -->
    <div class="design-surface" :class="{ 'show-grid': showGrid }" :style="surfaceStyle">
      <WidgetCanvasLayer @update:guides="(g) => (guides = g)" />
      <SelectionOverlay :scale="canvasScale" />
    </div>

    <!-- 屏幕空间叠层 -->
    <CanvasRuler
      v-if="showRuler"
      :scale="canvasScale"
      :offset-x="canvasOffset.x"
      :offset-y="canvasOffset.y"
      :width="containerSize.width"
      :height="containerSize.height"
      :canvas-width="canvasW"
      :canvas-height="canvasH"
    />
    <AlignGuides
      :guides="guides"
      :scale="canvasScale"
      :offset-x="canvasOffset.x"
      :offset-y="canvasOffset.y"
      :width="containerSize.width"
      :height="containerSize.height"
    />
    <div v-if="boxRect" class="box-select" :style="boxStyle" />

    <!-- 缩放提示 -->
    <div class="canvas-hint">Ctrl + 滚轮缩放 · 空格拖拽平移 · 拖拽空白框选</div>
  </div>
</template>

<style scoped>
.scene-canvas {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #0b1220;
  cursor: default;
}
.three-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.design-surface {
  position: absolute;
  z-index: 1;
}
.design-surface.show-grid {
  background-image: linear-gradient(to right, rgba(0, 234, 255, 0.08) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0, 234, 255, 0.08) 1px, transparent 1px);
  background-size: 8px 8px;
}
.box-select {
  position: absolute;
  border: 1px solid #00eaff;
  background: rgba(0, 234, 255, 0.12);
  z-index: 6;
  pointer-events: none;
}
.canvas-hint {
  position: absolute;
  right: 12px;
  bottom: 10px;
  font-size: 11px;
  color: rgba(207, 232, 255, 0.5);
  z-index: 6;
  pointer-events: none;
  user-select: none;
}
</style>
