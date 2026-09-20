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
  // 首次进入（尚未缩放/平移过）：有内容则适配内容包围盒，空画布则回到 100% + 原点在左上角。
  // 注意不要再按 1920×1080 硬缩 —— 这是无限画布，空白场景被缩到 75% 只会让人误判画布尺寸。
  if (store.canvasScale === 1 && store.canvasOffset.x === 0 && store.canvasOffset.y === 0) {
    store.fitScreen(containerSize.value.width, containerSize.value.height);
  }
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
  // Ctrl + 滚轮：以鼠标位置为中心缩放
  if (e.ctrlKey) {
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
    return;
  }
  // 普通滚轮：平移画布（Shift 横向）——无限画布的标准手感
  e.preventDefault();
  const dx = e.shiftKey ? -e.deltaY : -e.deltaX;
  const dy = e.shiftKey ? 0 : -e.deltaY;
  store.setCanvasOffset(store.canvasOffset.x + dx, store.canvasOffset.y + dy);
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
  // 用 DOM 命中区（.node-hit）的屏幕矩形直接与选框做交集判定。
  // 组件显示位置 = 命中区位置，二者天然一致；不再经过「屏幕↔设计坐标」换算，
  // 彻底避免缩放/平移/容器偏移带来的错位。boxRect 为 rootRef 局部坐标，加回 rect 即屏幕坐标。
  const box = {
    left: r.x + rect.left,
    top: r.y + rect.top,
    right: r.x + r.w + rect.left,
    bottom: r.y + r.h + rect.top,
  };
  const ids: string[] = [];
  rootRef.value?.querySelectorAll<HTMLElement>('.node-hit[data-id]').forEach((el) => {
    const b = el.getBoundingClientRect();
    if (b.left < box.right && b.right > box.left && b.top < box.bottom && b.bottom > box.top) {
      const id = el.dataset.id;
      if (id) ids.push(id);
    }
  });
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

/**
 * 设计表面：**不再有固定尺寸**，只是一层跟着 translate/scale 变换的无限坐标层。
 * 子节点按设计坐标绝对定位，写在画布外面的坐标（负坐标、几千像素外）照样能画出来，
 * 最终由 `.scene-canvas` 的 overflow:hidden 在视口边缘裁掉 —— 这就是「无限画布」。
 */
const surfaceStyle = computed<Record<string, string>>(() => ({
  transform: `translate(${canvasOffset.value.x}px, ${canvasOffset.value.y}px) scale(${canvasScale.value})`,
  transformOrigin: '0 0',
  pointerEvents: 'none',
}));

/** 网格已并入 design-surface 的背景（design 空间，随 showGrid 开关），见 surfaceStyle。 */

/** 画布完全空白时给一句引导，避免用户面对一片黑不知道从哪开始 */
const isEmptyCanvas = computed(
  () => page.value.nodes.length === 0 && components.value.length === 0,
);

const boxStyle = computed<Record<string, string>>(() => ({
  position: 'absolute',
  left: `${boxRect.value?.x ?? 0}px`,
  top: `${boxRect.value?.y ?? 0}px`,
  width: `${boxRect.value?.w ?? 0}px`,
  height: `${boxRect.value?.h ?? 0}px`,
}));
</script>

<template>
  <div
    ref="rootRef"
    class="scene-canvas"
    @mousedown="onRootMouseDown"
    @dragover="drop.onDragOver"
    @dragleave="drop.onDragLeave"
    @drop="drop.onDrop"
  >
    <!-- 固定 1920×1080 画布：三维层作为底板置于画布内，随画布一同缩放/平移，超出部分由 overflow:hidden 裁切 -->
    <div class="design-surface" :style="surfaceStyle">
      <!-- 三维层（Cesium + Three 双引擎画布）作为画布底板，置于 2D 组件之下 -->
      <div ref="threeRef" class="three-layer" />
      <WidgetCanvasLayer @update:guides="(g) => (guides = g)" />
      <SelectionOverlay :scale="canvasScale" />
      <span class="board-size-label">{{ canvasW }} × {{ canvasH }}</span>
    </div>

    <!-- 空画布引导 -->
    <div v-if="isEmptyCanvas" class="canvas-empty">
      <b>空白画布</b>
      <span>从左侧「组件库」拖入组件开始搭建，画布固定 1920×1080，组件可随意摆放</span>
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
    <div class="canvas-hint">滚轮平移 · Ctrl+滚轮缩放 · 空格拖拽平移 · 拖拽空白框选</div>
  </div>
</template>

<style scoped>
.scene-canvas {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #070b14;
  cursor: default;
}
.three-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: auto;
}
.design-surface {
  position: absolute;
  left: 0;
  top: 0;
  width: 1920px;
  height: 1080px;
  background-color: #0b1220;
  border: 1px solid rgba(0, 200, 224, 0.35);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.4),
    0 12px 40px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  z-index: 1;
}
/* 画布尺寸标签：贴在板左上角，标明这是固定的 1920×1080 设计区 */
.board-size-label {
  position: absolute;
  left: 0;
  top: 0;
  padding: 2px 8px;
  font-size: 11px;
  line-height: 16px;
  color: rgba(0, 234, 255, 0.75);
  background: rgba(11, 18, 32, 0.7);
  border-right: 1px solid rgba(0, 200, 224, 0.25);
  border-bottom: 1px solid rgba(0, 200, 224, 0.25);
  border-radius: 0 0 6px 0;
  pointer-events: none;
  user-select: none;
  z-index: 2;
}
/* 空画布引导 */
.canvas-empty {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  pointer-events: none;
  user-select: none;
  font-size: 13px;
  color: rgba(207, 232, 255, 0.5);
}
.canvas-empty b {
  font-size: 16px;
  letter-spacing: 1px;
  color: rgba(0, 234, 255, 0.75);
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
