<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { TwinViewer, type PerfStats } from '@dt/rendering-engine';
import { WidgetRenderer } from '@dt/widgets';
import type { SceneDetail, WidgetNode } from '@dt/shared-types';
import SpinnerBox from '@/components/ui/SpinnerBox.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import IconBase from '@/components/ui/IconBase.vue';
import { getSceneDetailApi } from '@/services/api/scene';
import { http } from '@/services/request';
import { useFullscreen } from '@/composables/useFullscreen';
import { EventRuntime } from './runtime/event-runtime';
import { DataRuntime } from './runtime/data-runtime';

const route = useRoute();
const router = useRouter();
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

const sceneId = String(route.params.id ?? '');

const loading = ref(true);
const error = ref<string | null>(null);
const scene = ref<SceneDetail | null>(null);
const progress = ref(0);

/** 三维画布容器与 2D 层容器 */
const canvasRef = ref<HTMLDivElement | null>(null);
const overlayRef = ref<HTMLDivElement | null>(null);
const wrapRef = ref<HTMLDivElement | null>(null);

/** 引擎实例放 shallowRef，避免被响应式代理污染 WebGL 对象 */
const viewer = shallowRef<TwinViewer | null>(null);

const nodes = shallowRef<Map<string, WidgetNode>>(new Map());
const flatNodes = ref<WidgetNode[]>([]);
const variables = ref<Record<string, unknown>>({});
const stats = ref<PerfStats | null>(null);
const showStats = ref(true);

let eventRuntime: EventRuntime | null = null;
let dataRuntime: DataRuntime | null = null;
let resizeObserver: ResizeObserver | null = null;

/** 画布设计尺寸与缩放比：按 fitMode 等比适配容器 */
const canvasSize = computed(() => {
  const c = scene.value?.config?.canvas;
  return { width: c?.width ?? 1920, height: c?.height ?? 1080, fitMode: c?.fitMode ?? 'CONTAIN' };
});

const containerSize = ref({ width: 0, height: 0 });

const scale = computed(() => {
  const { width, height, fitMode } = canvasSize.value;
  const { width: cw, height: ch } = containerSize.value;
  if (cw === 0 || ch === 0) return 1;
  if (fitMode === 'FILL') return Math.max(cw / width, ch / height);
  if (fitMode === 'WIDTH') return cw / width;
  return Math.min(cw / width, ch / height);
});

/** 2D 层整体 transform：居中 + 等比缩放 */
const overlayStyle = computed(() => {
  const { width, height, fitMode } = canvasSize.value;
  const s = scale.value;
  const scaledW = width * s;
  const scaledH = height * s;
  const left = (containerSize.value.width - scaledW) / 2;
  const top = fitMode === 'FILL' ? (containerSize.value.height - scaledH) / 2 : (containerSize.value.height - scaledH) / 2;
  return {
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate(${left}px, ${top}px) scale(${s})`,
    transformOrigin: 'top left',
    background: scene.value?.config?.canvas?.background ?? 'transparent',
  };
});

/** 展平节点树（含容器子节点），便于统一渲染与事件绑定 */
function flatten(list: WidgetNode[], out: WidgetNode[] = []): WidgetNode[] {
  list.forEach((n) => {
    out.push(n);
    if (n.children && n.children.length > 0) flatten(n.children, out);
  });
  return out;
}

async function loadScene(): Promise<void> {
  loading.value = true;
  error.value = null;
  progress.value = 10;
  try {
    const detail = await getSceneDetailApi(sceneId);
    scene.value = detail;
    progress.value = 40;

    // 初始化页面变量
    const vars: Record<string, unknown> = {};
    variables.value = vars;

    const list = detail.layout?.nodes ?? [];
    flatNodes.value = flatten(list);
    const map = new Map<string, WidgetNode>();
    flatNodes.value.forEach((n) => map.set(n.id, n));
    nodes.value = map;

    await initViewer();
    progress.value = 80;
    initRuntimes();
    progress.value = 100;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '场景加载失败';
  } finally {
    loading.value = false;
  }
}

async function initViewer(): Promise<void> {
  const el = canvasRef.value;
  if (!el || !scene.value) return;
  const instance = await TwinViewer.create({
    container: el,
    config: scene.value.config,
    ionToken: import.meta.env.VITE_CESIUM_TOKEN || undefined,
    readonly: true,
  });
  viewer.value = instance;

  // 依次加载三维实体（串行避免瞬时资源竞争）
  for (const comp of scene.value.components ?? []) {
    try {
      await instance.addEntity(comp);
    } catch (err) {
      console.warn('[preview] 实体加载失败', comp.id, err);
    }
  }

  instance.on('stats', (s: PerfStats) => {
    if (showStats.value) stats.value = s;
  });
  instance.on('degrade', () => {
    console.info('[preview] 渲染已自动降级以保障帧率');
  });

  resizeObserver = new ResizeObserver(() => {
    measure();
    instance.resize();
  });
  resizeObserver.observe(el);
  measure();
}

function measure(): void {
  const el = canvasRef.value;
  if (!el) return;
  containerSize.value = { width: el.clientWidth, height: el.clientHeight };
}

function initRuntimes(): void {
  const container = overlayRef.value;
  const v = viewer.value;

  eventRuntime = new EventRuntime({
    viewer: v,
    getVar: (k) => variables.value[k],
    setVar: (k, val) => {
      variables.value = { ...variables.value, [k]: val };
    },
    nodes: nodes.value,
    container,
    request: <T,>(url: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: unknown) =>
      method === 'GET' ? http.get<T>(url, body as Record<string, unknown>) : http.post<T>(url, body),
  });

  dataRuntime = new DataRuntime({
    nodes: nodes.value,
    request: <T,>(url: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: unknown) =>
      method === 'GET' ? http.get<T>(url, body as Record<string, unknown>) : http.post<T>(url, body),
    onChange: (nodeId) => {
      eventRuntime?.fire(nodeId, 'dataChange');
    },
  });

  // 事件绑定来自场景配置（后端当前只在 layout 中保存节点，事件随模板能力扩展）
  eventRuntime.setBindings([]);
  eventRuntime.bindDomEvents();
  eventRuntime.bindViewer();
  dataRuntime.bindAll(flatNodes.value);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') void router.back();
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
  await loadScene();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  eventRuntime?.dispose();
  dataRuntime?.dispose();
  resizeObserver?.disconnect();
  viewer.value?.destroy();
  viewer.value = null;
});

async function retry(): Promise<void> {
  await loadScene();
}
</script>

<template>
  <div ref="wrapRef" class="preview-root">
    <!-- 三维画布 -->
    <div ref="canvasRef" class="preview-canvas" />

    <!-- 2D 大屏叠加层 -->
    <div class="preview-overlay-wrap">
      <div ref="overlayRef" class="preview-overlay" :style="overlayStyle">
        <template v-for="node in flatNodes" :key="node.id">
          <div v-if="!node.children || node.children.length === 0" class="node-slot" :data-node-id="node.id">
            <WidgetRenderer :node="node" runtime :data="(node.props as Record<string, unknown>).__data" />
          </div>
        </template>
        <!-- 容器类节点（PanelBox）单独渲染以承载子节点 -->
        <template v-for="node in flatNodes" :key="`c-${node.id}`">
          <div v-if="node.children && node.children.length > 0" class="node-slot" :data-node-id="node.id">
            <WidgetRenderer :node="node" runtime :data="(node.props as Record<string, unknown>).__data" />
          </div>
        </template>
      </div>
    </div>

    <!-- 顶部信息条 -->
    <header class="preview-bar">
      <BaseButton size="sm" type="ghost" icon="close" @click="void router.back()">退出预览</BaseButton>
      <span class="scene-name">{{ scene?.name || '场景预览' }}</span>
      <div class="flex-1" />
      <button class="bar-btn" :title="showStats ? '隐藏性能面板' : '显示性能面板'" @click="showStats = !showStats">
        <IconBase name="chart" :size="15" />
      </button>
      <button class="bar-btn" :title="isFullscreen ? '退出全屏' : '全屏'" @click="void toggleFullscreen()">
        <IconBase name="fullscreen" :size="15" />
      </button>
    </header>

    <!-- 性能悬浮面板 -->
    <div v-if="showStats && stats" class="stats-panel">
      <div class="stat-row"><span>FPS</span><b :class="{ warn: stats.fps < 30 }">{{ stats.fps }}</b></div>
      <div class="stat-row"><span>显存</span><b>{{ stats.memoryMb }} MB</b></div>
      <div class="stat-row"><span>DrawCall</span><b>{{ stats.drawCalls }}</b></div>
      <div class="stat-row"><span>三角面</span><b>{{ stats.triangles.toLocaleString() }}</b></div>
      <div class="stat-row"><span>实体数</span><b>{{ stats.entityCount }}</b></div>
    </div>

    <!-- 加载遮罩 -->
    <div v-if="loading" class="mask">
      <SpinnerBox size="lg" :text="`场景加载中 ${progress}%`" />
    </div>

    <!-- 错误态 -->
    <div v-else-if="error" class="mask">
      <EmptyState text="场景加载失败" :description="error" />
      <div class="mask-ops">
        <BaseButton type="primary" @click="void retry()">重试</BaseButton>
        <BaseButton @click="void router.back()">返回</BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-root {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #050b16;
}
.preview-canvas {
  position: absolute;
  inset: 0;
}
.preview-overlay-wrap {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.preview-overlay {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: auto;
}
.node-slot {
  position: absolute;
  inset: 0;
}
.preview-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 46px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  background: linear-gradient(to bottom, rgba(5, 11, 22, 0.72), rgba(5, 11, 22, 0));
  color: #e2e8f0;
  z-index: 20;
}
.scene-name {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.5px;
}
.bar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  color: #cbd5e1;
  transition: background 0.15s, color 0.15s;
}
.bar-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}
.stats-panel {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 20;
  min-width: 148px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(8, 16, 30, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  font-size: 12px;
  backdrop-filter: blur(6px);
}
.stat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 0;
}
.stat-row b {
  color: #ffffff;
  font-weight: 600;
}
.stat-row b.warn {
  color: #f87171;
}
.mask {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: rgba(5, 11, 22, 0.88);
  color: #e2e8f0;
}
.mask-ops {
  display: flex;
  gap: 10px;
}
</style>
