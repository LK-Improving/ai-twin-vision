<script setup lang="ts">
/**
 * 编辑器主界面：三栏布局。
 * 顶部工具栏 + 左侧面板（组件库/图层）+ 中间画布 + 右侧属性面板 + 底部状态栏。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import EditorHeader from './components/EditorHeader.vue';
import WidgetLibraryPanel from './components/WidgetLibraryPanel.vue';
import OutlineTreePanel from './components/OutlineTreePanel.vue';
import SceneCanvas from './components/SceneCanvas.vue';
import PropertyPanel from './components/PropertyPanel.vue';
import { useEditorStore } from '@/stores/editor';
import { useToast } from '@/composables/useToast';
import BaseTabs from '@/components/ui/BaseTabs.vue';
import SpinnerBox from '@/components/ui/SpinnerBox.vue';
import IconBase from '@/components/ui/IconBase.vue';

const route = useRoute();
const router = useRouter();
const store = useEditorStore();
const toast = useToast();
const { loading, dirty, saving, canvasScale, perfStats, selectedIds, theme } = storeToRefs(store);

const sceneId = computed(() => String(route.params.id ?? ''));
const leftTab = ref<'library' | 'outline'>('library');
const leftCollapsed = ref(false);
const rightCollapsed = ref(false);

// -------------------------------------------------------------- 面板宽度（可拖拽伸缩）
const MIN_PANEL_WIDTH = 200;
const MAX_PANEL_WIDTH = 640;
const leftWidth = ref(280);
const rightWidth = ref(320);

/** 拖拽左右面板与画布之间的把手调整宽度 */
function startPanelResize(side: 'left' | 'right', e: MouseEvent): void {
  e.preventDefault();
  const clampW = (v: number) => Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, v));
  const startX = e.clientX;
  const startLeft = leftWidth.value;
  const startRight = rightWidth.value;
  const onMove = (ev: MouseEvent): void => {
    const dx = ev.clientX - startX;
    if (side === 'left') leftWidth.value = clampW(startLeft + dx);
    else rightWidth.value = clampW(startRight - dx);
  };
  const onUp = (): void => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

/** 收集全部 2D 节点 ID（含子节点） */
function collectNodeIds(list = store.page.nodes, acc: string[] = []): string[] {
  for (const n of list) {
    acc.push(n.id);
    if (n.children?.length) collectNodeIds(n.children, acc);
  }
  return acc;
}

// -------------------------------------------------------------- 生命周期
onMounted(async () => {
  if (!sceneId.value) {
    toast.error('缺少场景 ID');
    return;
  }
  await store.loadScene(sceneId.value);
  store.startAutoSave();
  store.installGuard();
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('keyup', onKeyup);
});

onBeforeUnmount(() => {
  store.stopAutoSave();
  store.uninstallGuard();
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('keyup', onKeyup);
});

// -------------------------------------------------------------- 快捷键
function isEditingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
}

function onKeydown(e: KeyboardEvent): void {
  const mod = e.ctrlKey || e.metaKey;
  // 输入框内只拦截保存，避免影响输入
  if (isEditingTarget(e) && !mod) return;

  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    void store.save();
    return;
  }
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    store.selectNodes([...store.components.map((c) => c.id), ...collectNodeIds()]);
    return;
  }
  if (mod && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    if (selectedIds.value[0]) store.duplicateNode(selectedIds.value[0]);
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedIds.value.length) {
      e.preventDefault();
      store.removeNodes(selectedIds.value);
    }
    return;
  }
  if (e.key === 'Escape') {
    store.clearSelection();
    return;
  }
  if (e.key.startsWith('Arrow') && selectedIds.value.length) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    for (const id of selectedIds.value) {
      const n = findNode(id);
      if (n) store.moveNode(id, { x: n.rect.x + dx, y: n.rect.y + dy });
    }
    store.commitDrag(selectedIds.value.join(','));
  }
}

function findNode(id: string) {
  for (const n of store.page.nodes) {
    const r = traverse(n, id);
    if (r) return r;
  }
  return null;
}
function traverse(node: any, id: string): any {
  if (node.id === id) return node;
  if (node.children)
    for (const c of node.children) {
      const r = traverse(c, id);
      if (r) return r;
    }
  return null;
}

function onKeyup(e: KeyboardEvent): void {
  // 预留：可在此处理长按型交互的抬起逻辑
  void e;
}

// 离开编辑器路由时询问（兜底于 beforeunload 守卫）
watch(sceneId, (id) => {
  if (id) void store.loadScene(id);
});
</script>

<template>
  <div class="editor-root" :class="{ 'theme-dark': theme === 'dark' }">
    <EditorHeader v-if="!loading" />

    <div v-if="loading" class="editor-loading">
      <SpinnerBox size="lg" text="正在加载场景…" />
    </div>

    <div v-else class="editor-body">
      <!-- 左侧面板（展开态） -->
      <aside v-show="!leftCollapsed" class="editor-left" :style="{ width: leftWidth + 'px' }">
        <BaseTabs
          v-model="leftTab"
          :items="[
            { key: 'library', label: '组件库' },
            { key: 'outline', label: '图层', icon: 'layers' },
          ]"
        />
        <div class="editor-left-body">
          <WidgetLibraryPanel v-if="leftTab === 'library'" />
          <OutlineTreePanel v-else />
        </div>
      </aside>

      <!-- 左侧面板（收起态）：细条，点击展开 -->
      <div
        v-show="leftCollapsed"
        class="editor-stub"
        title="展开组件库/图层"
        @click="leftCollapsed = false"
      >
        <IconBase name="panel-left-open" :size="16" />
      </div>

      <div
        v-show="!leftCollapsed"
        class="editor-resizer"
        title="拖拽调整宽度"
        @mousedown="startPanelResize('left', $event)"
      />

      <!-- 左面板内边缘的收起箭头 -->
      <button
        v-show="!leftCollapsed"
        class="panel-arrow"
        :style="{ left: leftWidth - 10 + 'px' }"
        title="收起面板"
        @click="leftCollapsed = true"
      >
        <IconBase name="panel-left-close" :size="14" />
      </button>

      <!-- 中间画布 -->
      <main class="editor-center">
        <SceneCanvas />
      </main>

      <!-- 右面板内边缘的收起箭头 -->
      <button
        v-show="!rightCollapsed"
        class="panel-arrow"
        :style="{ right: rightWidth - 10 + 'px' }"
        title="收起面板"
        @click="rightCollapsed = true"
      >
        <IconBase name="panel-right-close" :size="14" />
      </button>

      <div
        v-show="!rightCollapsed"
        class="editor-resizer"
        title="拖拽调整宽度"
        @mousedown="startPanelResize('right', $event)"
      />

      <!-- 右侧属性面板（展开态） -->
      <aside v-show="!rightCollapsed" class="editor-right" :style="{ width: rightWidth + 'px' }">
        <PropertyPanel />
      </aside>

      <!-- 右侧面板（收起态）：细条，点击展开 -->
      <div
        v-show="rightCollapsed"
        class="editor-stub"
        title="展开属性面板"
        @click="rightCollapsed = false"
      >
        <IconBase name="panel-right-open" :size="16" />
      </div>
    </div>

    <!-- 底部状态栏 -->
    <footer class="editor-status">
      <span class="status-item">
        <b>{{ perfStats.fps }}</b>
        FPS
      </span>
      <span class="status-item">
        三角面
        <b>{{ perfStats.triangles }}</b>
      </span>
      <span class="status-item">
        显存
        <b>{{ (perfStats.memoryMb ?? 0).toFixed(0) }}</b>
        MB
      </span>
      <span class="status-item">
        实体
        <b>{{ perfStats.entityCount }}</b>
      </span>
      <span class="status-item">
        缩放
        <b>{{ Math.round(canvasScale * 100) }}%</b>
      </span>
      <span class="status-spacer" />
      <span class="status-item" :class="{ 'status-dirty': dirty }">
        <IconBase v-if="saving" name="loader" :size="14" />
        {{ saving ? '保存中…' : dirty ? '未保存' : '已保存' }}
      </span>
    </footer>
  </div>
</template>

<style scoped>
.editor-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #f5f7fa;
  color: #1f2d3d;
  overflow: hidden;
}
.editor-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.editor-body {
  flex: 1;
  display: flex;
  min-height: 0;
  /* 供面板边缘的悬浮收起箭头做绝对定位 */
  position: relative;
}
.editor-left {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid #e3e8ef;
  background: #fff;
  display: flex;
  flex-direction: column;
}
.editor-left-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
/* 面板伸缩把手：左右面板与画布之间的可拖拽分隔条 */
.editor-resizer {
  width: 6px;
  flex-shrink: 0;
  cursor: col-resize;
  background: #eef1f5;
  transition: background 0.15s;
  position: relative;
  z-index: 5;
}
.editor-resizer:hover,
.editor-resizer:active {
  background: #00b8d9;
}
/* 面板收起后的细条：点击重新展开 */
.editor-stub {
  width: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: #868e96;
  cursor: pointer;
  border-right: 1px solid #e3e8ef;
  transition:
    background 0.15s,
    color 0.15s;
}
.editor-stub:last-child {
  border-right: none;
  border-left: 1px solid #e3e8ef;
}
.editor-stub:hover {
  background: #f0fdff;
  color: #00b8d9;
}
/* 面板内边缘的收起箭头：垂直居中，半悬在面板与画布分界线上 */
.panel-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 6;
  width: 20px;
  height: 40px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e3e8ef;
  border-radius: 6px;
  background: #fff;
  color: #868e96;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(15, 34, 58, 0.08);
  transition:
    background 0.15s,
    color 0.15s;
}
.panel-arrow:hover {
  background: #f0fdff;
  color: #00b8d9;
}
.editor-center {
  flex: 1;
  min-width: 0;
  position: relative;
  background: #0b1220;
}
.editor-right {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid #e3e8ef;
  background: #fff;
  overflow: hidden;
}
.editor-status {
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 12px;
  background: #1f2d3d;
  color: #cfe8ff;
  font-size: 12px;
  border-top: 1px solid #0b1220;
}
.status-item b {
  color: #00eaff;
}
.status-spacer {
  flex: 1;
}
.status-dirty {
  color: #ffcc00;
}

/* ============================ 深色主题（默认浅色，开关切换） ============================ */
.editor-root.theme-dark {
  background: #0d1117;
  color: #e6edf3;
}
.editor-root.theme-dark .editor-left {
  background: #161b22;
  border-color: #30363d;
}
.editor-root.theme-dark .editor-right {
  background: #161b22;
  border-color: #30363d;
}
.editor-root.theme-dark .editor-resizer {
  background: #21262d;
}
.editor-root.theme-dark .editor-resizer:hover,
.editor-root.theme-dark .editor-resizer:active {
  background: #00b8d9;
}
.editor-root.theme-dark .editor-stub {
  background: #161b22;
  color: #8b949e;
  border-color: #30363d;
}
.editor-root.theme-dark .editor-stub:hover {
  background: #0b2a30;
  color: #00b8d9;
}
.editor-root.theme-dark .panel-arrow {
  background: #161b22;
  color: #8b949e;
  border-color: #30363d;
}
.editor-root.theme-dark .panel-arrow:hover {
  background: #0b2a30;
  color: #00b8d9;
}
.editor-root.theme-dark .editor-center {
  background: #05080f;
}
.editor-root.theme-dark .editor-status {
  background: #161b22;
  color: #cfe8ff;
  border-color: #30363d;
}
/* 顶栏（子组件根，继承父作用域属性，可直接命中） */
.editor-root.theme-dark .editor-header {
  background: #161b22;
  border-color: #30363d;
}
.editor-root.theme-dark :deep(.name-text) {
  color: #e6edf3;
}
.editor-root.theme-dark :deep(.divider) {
  background: #30363d;
}
.editor-root.theme-dark :deep(.badge-draft) {
  background: #3a2a10;
  color: #e3a008;
}
.editor-root.theme-dark :deep(.badge-published) {
  background: #0d3329;
  color: #3fb98f;
}
.editor-root.theme-dark :deep(.badge-archived) {
  background: #21262d;
  color: #8b949e;
}
.editor-root.theme-dark :deep(.zoom-text) {
  color: #e6edf3;
}
.editor-root.theme-dark :deep(.is-on) {
  color: #00b8d9 !important;
}
/* 标尺（子组件根） */
.editor-root.theme-dark :deep(.ruler) {
  background: rgba(22, 27, 34, 0.9);
  border-color: #30363d;
}
.editor-root.theme-dark :deep(.ruler-corner) {
  background: #161b22;
  border-color: #30363d;
}
.editor-root.theme-dark :deep(.tick) {
  background: #484f58;
}
.editor-root.theme-dark :deep(.tick-label) {
  color: #8b949e;
}
</style>
