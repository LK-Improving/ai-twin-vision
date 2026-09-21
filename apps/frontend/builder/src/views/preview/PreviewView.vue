<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { TwinViewer, type PerfStats } from '@dt/rendering-engine';
import { WidgetRenderer } from '@dt/widgets';
import type {
  AlertTriggeredPayload,
  SceneDetail,
  ScreenSnapshot,
  ScreenTicket,
  WidgetNode,
} from '@dt/shared-types';
import SpinnerBox from '@/components/ui/SpinnerBox.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import IconBase from '@/components/ui/IconBase.vue';
import { getSceneDetailApi } from '@/services/api/scene';
import { http } from '@/services/request';
import { realtime } from '@/services/realtime';
import { useFullscreen } from '@/composables/useFullscreen';
import { EventRuntime } from './runtime/event-runtime';
import { DataRuntime } from './runtime/data-runtime';
import { resetScriptSandbox } from '@/sandbox';

const route = useRoute();
const router = useRouter();
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

/** 大屏公开模式：由 /screen/:token 传入发布令牌，此时无需登录 */
const props = defineProps<{ screenToken?: string }>();
const isPublic = computed(() => Boolean(props.screenToken));

/**
 * 运行时只用到这几项，公开快照与编辑态详情共用同一结构，
 * 避免为了公开页伪造一整套 SceneListItem 字段。
 */
type RuntimeScene = Pick<SceneDetail, 'config' | 'components' | 'layout' | 'name'>;

/** 公开快照加载完才知道，编辑态直接从路由取 */
const sceneId = ref(String(route.params.id ?? ''));

const loading = ref(true);
const error = ref<string | null>(null);
const scene = ref<RuntimeScene | null>(null);
const progress = ref(0);

/** 三维画布容器与 2D 层容器 */
const canvasRef = ref<HTMLDivElement | null>(null);
const overlayRef = ref<HTMLDivElement | null>(null);
const wrapRef = ref<HTMLDivElement | null>(null);

/** 引擎实例放 shallowRef，避免被响应式代理污染 WebGL 对象 */
const viewer = shallowRef<TwinViewer | null>(null);

const nodes = shallowRef<Map<string, WidgetNode>>(new Map());
/** 顶层节点（渲染入口）：子节点由容器组件（PanelBox）内部递归承载，避免重复渲染 */
const rootNodes = ref<WidgetNode[]>([]);
const flatNodes = ref<WidgetNode[]>([]);
const variables = ref<Record<string, unknown>>({});
const stats = ref<PerfStats | null>(null);

/** 实时通道状态：true=推送驱动，false=已降级为轮询 */
const realtimeConnected = ref(false);
let offRealtimeState: (() => void) | null = null;
/** 公开模式下的实时通道票据（null 表示退化为轮询） */
const screenTicket = ref<string | null>(null);
const showStats = ref(false);

/** 当前激活告警（status=0），用于三维高亮与角标/抽屉 */
const alerts = ref<AlertTriggeredPayload[]>([]);
/** 告警抽屉开关 */
const alertDrawer = ref(false);
let offAlert: (() => void) | null = null;

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
  const top =
    fitMode === 'FILL'
      ? (containerSize.value.height - scaledH) / 2
      : (containerSize.value.height - scaledH) / 2;
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

/**
 * 公开模式加载：先取快照，再用发布令牌换一张实时通道票据。
 * 票据短时效且限定该场景，不需要登录态。
 */
async function loadPublicSnapshot(): Promise<RuntimeScene> {
  const token = props.screenToken!;
  const snapshot = await http.get<ScreenSnapshot>(`/public/screens/${token}`);
  sceneId.value = snapshot.sceneId;
  try {
    const ticket = await http.post<ScreenTicket>(`/public/screens/${token}/ws-ticket`);
    screenTicket.value = ticket.token;
  } catch {
    // 拿不到票据不影响静态渲染，退化为轮询刷新
    screenTicket.value = null;
  }
  return {
    name: snapshot.name,
    config: snapshot.config,
    components: snapshot.components,
    layout: snapshot.layout,
  };
}

/** 告警到达（触发/恢复）：维护激活列表并联动三维高亮 */
function handleAlert(p: AlertTriggeredPayload): void {
  const key = `${p.deviceId}:${p.propertyCode}`;
  const list = alerts.value;
  const idx = list.findIndex((a) => `${a.deviceId}:${a.propertyCode}` === key);
  if (p.status === 0) {
    const item = { ...p };
    if (idx >= 0) list.splice(idx, 1, item);
    else list.push(item);
  } else if (p.status === 2) {
    if (idx >= 0) list.splice(idx, 1);
  }
  alerts.value = [...list];
  applyAlertHighlight();
}

/** 把激活告警映射到三维实体高亮（C4：随绑定节点联动到场景） */
function applyAlertHighlight(): void {
  const v = viewer.value;
  if (!v) return;
  const active = alerts.value[0];
  if (!active) {
    v.clearHighlight();
    return;
  }
  let targetId: string | undefined;
  nodes.value.forEach((n) => {
    const b = n.dataBinding;
    if (
      b &&
      b.deviceId === active.deviceId &&
      (!active.propertyCode || b.propertyCode === active.propertyCode)
    ) {
      targetId = n.id;
    }
  });
  if (targetId) v.highlight(targetId, alertColor(active.alertLevel));
  else v.clearHighlight();
}

function alertColor(level: number): string {
  if (level >= 4) return '#ff2d2d';
  if (level === 3) return '#ff4d4f';
  if (level === 2) return '#ff8c00';
  return '#fadb14';
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

/** 建立实时通道：公开模式用票据，编辑态用登录态 */
async function connectRealtime(): Promise<void> {
  if (isPublic.value && props.screenToken) {
    // 注入票据刷新函数：票据过期后重建连接时自动用发布令牌重换
    realtime.setTicketProvider(async () => {
      try {
        const t = await http.post<ScreenTicket>(`/public/screens/${props.screenToken}/ws-ticket`);
        screenTicket.value = t.token;
        return t.token;
      } catch {
        return null;
      }
    });
  }
  await realtime.ensure(screenTicket.value ?? undefined);
  if (sceneId.value) realtime.setScene(sceneId.value);
}

async function loadScene(): Promise<void> {
  loading.value = true;
  error.value = null;
  progress.value = 10;
  try {
    // 公开模式（/screen/:token）走无需登录的快照接口，编辑态走场景详情接口
    const detail: RuntimeScene = isPublic.value
      ? await loadPublicSnapshot()
      : await getSceneDetailApi(sceneId.value);
    scene.value = detail;
    progress.value = 40;

    // 初始化页面变量
    const vars: Record<string, unknown> = {};
    variables.value = vars;

    const list = detail.layout?.nodes ?? [];
    rootNodes.value = list;
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
    getVars: () => variables.value,
    nodes: nodes.value,
    container,
    request: <T,>(
      url: string,
      method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
      body?: unknown,
    ) =>
      method === 'GET'
        ? http.get<T>(url, body as Record<string, unknown>)
        : http.post<T>(url, body),
  });

  dataRuntime = new DataRuntime({
    nodes: nodes.value,
    request: <T,>(
      url: string,
      method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
      body?: unknown,
    ) =>
      method === 'GET'
        ? http.get<T>(url, body as Record<string, unknown>)
        : http.post<T>(url, body),
    onChange: (nodeId) => {
      eventRuntime?.fire(nodeId, 'dataChange');
    },
  });

  // 事件绑定来自场景 DSL（biz_scene.layout.events，由编辑器事件编排面板写入）。
  // 此前这里是写死的 []，导致用户配好的绑定在预览与发布大屏里完全不执行（迭代 5.5）。
  eventRuntime.setBindings(scene.value?.layout?.events ?? []);
  eventRuntime.bindDomEvents();
  eventRuntime.bindViewer();

  // 仅开发态暴露运行时句柄：e2e 需要驱动「脚本 → 能力白名单 → DOM 效果」这一段闭环，
  // 而事件绑定面板的 UI 流程（四层自定义下拉）flake 成本过高。生产构建不挂载此字段。
  if (import.meta.env.DEV) {
    (window as unknown as { __dtEventRuntime?: EventRuntime }).__dtEventRuntime = eventRuntime;
  }

  // 实时通道：IoT 绑定节点改为推送驱动，断线自动回退轮询（见 data-runtime.attachRealtime）
  dataRuntime.attachRealtime(realtime);
  realtimeConnected.value = realtime.connected;
  offRealtimeState?.();
  offRealtimeState = realtime.onConnection((connected) => {
    realtimeConnected.value = connected;
  });
  void connectRealtime();

  // 订阅告警推送（触发/恢复），联动三维高亮（C3/C4）
  offAlert?.();
  offAlert = realtime.onAlert(handleAlert);

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
  offRealtimeState?.();
  offRealtimeState = null;
  offAlert?.();
  offAlert = null;
  eventRuntime?.dispose();
  dataRuntime?.dispose();
  // 释放沙箱线程：防止上一个场景的脚本或定时器跨场景继续运行
  resetScriptSandbox();
  realtime.setScene(null);
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
        <template v-for="node in rootNodes" :key="node.id">
          <div
            v-if="!node.children || node.children.length === 0"
            class="node-slot"
            :data-node-id="node.id"
          >
            <WidgetRenderer
              :node="node"
              runtime
              :data="(node.props as Record<string, unknown>).__data"
            />
          </div>
        </template>
        <!-- 容器类节点（PanelBox）单独渲染以承载子节点 -->
        <template v-for="node in rootNodes" :key="`c-${node.id}`">
          <div
            v-if="node.children && node.children.length > 0"
            class="node-slot"
            :data-node-id="node.id"
          >
            <WidgetRenderer
              :node="node"
              runtime
              :data="(node.props as Record<string, unknown>).__data"
            />
          </div>
        </template>
      </div>
    </div>

    <!-- 平台工具条：低调浮层，仅保留运行态与工具按钮，标题/导航由场景内的 TopBar 组件承载 -->
    <header class="preview-bar">
      <div class="flex-1" />
      <span
        class="realtime-dot"
        :class="{ on: realtimeConnected }"
        :title="realtimeConnected ? '实时推送已连接' : '实时通道未连接，数据降级为轮询'"
      >
        <i class="dot" />
        {{ realtimeConnected ? '实时' : '轮询' }}
      </span>
      <button
        v-if="alerts.length"
        class="bar-btn alert-badge"
        :title="`${alerts.length} 条激活告警，点击查看`"
        @click="alertDrawer = true"
      >
        <i class="dot-alert" />
        告警 {{ alerts.length }}
      </button>
      <button
        class="bar-btn"
        :title="showStats ? '隐藏性能面板' : '显示性能面板'"
        @click="showStats = !showStats"
      >
        <IconBase name="chart" :size="15" />
      </button>
      <button
        class="bar-btn"
        :title="isFullscreen ? '退出全屏' : '全屏'"
        @click="void toggleFullscreen()"
      >
        <IconBase name="fullscreen" :size="15" />
      </button>
    </header>

    <!-- 性能悬浮面板 -->
    <div v-if="showStats && stats" class="stats-panel">
      <div class="stat-row">
        <span>FPS</span>
        <b :class="{ warn: stats.fps < 30 }">{{ stats.fps }}</b>
      </div>
      <div class="stat-row">
        <span>显存</span>
        <b>{{ stats.memoryMb }} MB</b>
      </div>
      <div class="stat-row">
        <span>DrawCall</span>
        <b>{{ stats.drawCalls }}</b>
      </div>
      <div class="stat-row">
        <span>三角面</span>
        <b>{{ stats.triangles.toLocaleString() }}</b>
      </div>
      <div class="stat-row">
        <span>实体数</span>
        <b>{{ stats.entityCount }}</b>
      </div>
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

    <!-- 告警抽屉（C3：当前激活告警列表） -->
    <transition name="slide">
      <aside v-if="alertDrawer" class="alert-drawer">
        <header class="ad-head">
          <span>当前告警（{{ alerts.length }}）</span>
          <button class="ad-close" @click="alertDrawer = false">关闭</button>
        </header>
        <div v-if="!alerts.length" class="ad-empty">暂无激活告警</div>
        <ul v-else class="ad-list">
          <li
            v-for="a in alerts"
            :key="a.eventId"
            class="ad-item"
            :style="{ borderLeftColor: alertColor(a.alertLevel) }"
          >
            <div class="ad-title">{{ a.ruleName }}</div>
            <div class="ad-meta">
              {{ a.deviceCode }} · {{ a.propertyCode }} = {{ a.triggerValue }}
            </div>
            <div class="ad-msg">{{ a.message }}</div>
            <div class="ad-time">{{ formatTime(a.triggeredAt) }}</div>
          </li>
        </ul>
      </aside>
    </transition>
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
  /* 整层不拦截鼠标：让下方三维画布可拖拽/缩放 */
  pointer-events: none;
}
.node-slot {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
/* 仅组件自身的矩形区域恢复交互（面板内滚动/按钮等）；
   装饰节点（如暗角遮罩）可通过 style.pointerEvents='none' 单独穿透 */
.node-slot :deep(.dt-widget) {
  pointer-events: auto;
}
.preview-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 46px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  color: #e2e8f0;
  z-index: 20;
  pointer-events: none;
}
.preview-bar > * {
  pointer-events: auto;
}
.scene-name {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.5px;
}
/* 实时通道指示灯：绿=推送，灰=轮询降级 */
.realtime-dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.08);
  user-select: none;
}
.realtime-dot .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #64748b;
  transition:
    background 0.2s,
    box-shadow 0.2s;
}
.realtime-dot.on {
  color: #6ee7b7;
}
.realtime-dot.on .dot {
  background: #34d399;
  box-shadow: 0 0 6px rgba(52, 211, 153, 0.9);
}
.bar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  color: #cbd5e1;
  transition:
    background 0.15s,
    color 0.15s;
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

/* 告警角标（C3） */
.alert-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: auto;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  color: #fecaca;
  background: rgba(239, 68, 68, 0.18);
  border: 1px solid rgba(239, 68, 68, 0.5);
}
.alert-badge:hover {
  background: rgba(239, 68, 68, 0.3);
  color: #ffffff;
}
.dot-alert {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f87171;
  box-shadow: 0 0 6px rgba(248, 113, 113, 0.9);
  animation: alert-pulse 1.2s infinite;
}
@keyframes alert-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

/* 告警抽屉（C3） */
.alert-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  z-index: 40;
  display: flex;
  flex-direction: column;
  background: rgba(10, 16, 28, 0.96);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.4);
}
.ad-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.ad-close {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 13px;
}
.ad-close:hover {
  color: #ffffff;
}
.ad-empty {
  padding: 24px 14px;
  color: #64748b;
  font-size: 13px;
  text-align: center;
}
.ad-list {
  list-style: none;
  margin: 0;
  padding: 8px;
  overflow-y: auto;
}
.ad-item {
  padding: 10px 12px;
  margin-bottom: 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border-left: 3px solid #ef4444;
}
.ad-title {
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
}
.ad-meta {
  font-size: 12px;
  color: #fca5a5;
  margin-top: 3px;
}
.ad-msg {
  font-size: 12px;
  color: #cbd5e1;
  margin-top: 4px;
  line-height: 1.5;
}
.ad-time {
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
}
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
