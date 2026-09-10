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
const { loading, dirty, saving, canvasScale, perfStats, selectedIds } = storeToRefs(store);

const sceneId = computed(() => String(route.params.id ?? ''));
const leftTab = ref<'library' | 'outline'>('library');
const leftCollapsed = ref(false);
const rightCollapsed = ref(false);

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
  if (node.children) for (const c of node.children) {
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
  <div class="editor-root">
    <EditorHeader
      v-if="!loading"
      :left-collapsed="leftCollapsed"
      :right-collapsed="rightCollapsed"
      @toggle-left="leftCollapsed = !leftCollapsed"
      @toggle-right="rightCollapsed = !rightCollapsed"
    />

    <div v-if="loading" class="editor-loading">
      <SpinnerBox size="lg" text="正在加载场景…" />
    </div>

    <div v-else class="editor-body">
      <!-- 左侧面板 -->
      <aside v-show="!leftCollapsed" class="editor-left">
        <BaseTabs v-model="leftTab" :items="[
          { key: 'library', label: '组件库' },
          { key: 'outline', label: '图层', icon: 'layers' },
        ]" />
        <div class="editor-left-body">
          <WidgetLibraryPanel v-if="leftTab === 'library'" />
          <OutlineTreePanel v-else />
        </div>
      </aside>

      <!-- 中间画布 -->
      <main class="editor-center">
        <SceneCanvas />
      </main>

      <!-- 右侧属性面板 -->
      <aside v-show="!rightCollapsed" class="editor-right">
        <PropertyPanel />
      </aside>
    </div>

    <!-- 底部状态栏 -->
    <footer class="editor-status">
      <span class="status-item"><b>{{ perfStats.fps }}</b> FPS</span>
      <span class="status-item">三角面 <b>{{ perfStats.triangles }}</b></span>
      <span class="status-item">显存 <b>{{ (perfStats.memoryMb ?? 0).toFixed(0) }}</b> MB</span>
      <span class="status-item">实体 <b>{{ perfStats.entityCount }}</b></span>
      <span class="status-item">缩放 <b>{{ Math.round(canvasScale * 100) }}%</b></span>
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
</style>
