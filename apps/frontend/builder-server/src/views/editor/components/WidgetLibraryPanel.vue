<script setup lang="ts">
/**
 * 组件库面板。
 * - 2D 组件：来自 @dt/widgets 的 widgetGroups（按大类分组、可折叠、可搜索）。
 * - 三维组件：来自 GET /components（按 category 分组），可拖拽到画布，双击直接添加。
 */
import { computed, ref } from 'vue';
import { widgetGroups, type WidgetDefinition } from '@dt/widgets';
import { useEditorStore } from '@/stores/editor';
import { encodeDragPayload } from '@/composables/useEditorDnd';
import type { ComponentListItem } from '@dt/shared-types';
import BaseInput from '@/components/ui/BaseInput.vue';
import EmptyState from '@/components/ui/EmptyState.vue';

const store = useEditorStore();
const keyword = ref('');

/** 2D 组件分组（按搜索关键字过滤） */
const filteredGroups = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return widgetGroups
    .map((g) => ({
      ...g,
      widgets: g.widgets.filter((w) => !kw || w.name.toLowerCase().includes(kw) || w.type.toLowerCase().includes(kw)),
    }))
    .filter((g) => g.widgets.length > 0);
});

/** 三维组件按 category 分组 */
const threeGroups = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  const items = store.componentCatalog.filter(
    (c) => !kw || c.name.toLowerCase().includes(kw) || String(c.category).toLowerCase().includes(kw),
  );
  const map = new Map<string, ComponentListItem[]>();
  for (const it of items) {
    const key = String(it.category);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(it);
  }
  return Array.from(map.entries()).map(([category, list]) => ({ category, label: category, widgets: list }));
});

const expanded = ref<Record<string, boolean>>({});
function toggle(key: string): void {
  expanded.value[key] = !expanded.value[key];
}

function onDragStart(e: DragEvent, payload: { widgetType?: string; componentId?: string }): void {
  if (!e.dataTransfer) return;
  const data = encodeDragPayload({ source: 'library', ...payload });
  e.dataTransfer.setData('application/x-dt-widget', data);
  e.dataTransfer.setData('text/plain', data);
  e.dataTransfer.effectAllowed = 'copy';
}

/** 双击 2D 组件：添加到画布中心 */
function onWidgetDblClick(def: WidgetDefinition): void {
  store.addWidget(def.type, centerPoint());
}
/** 双击三维组件：添加到画布中心 */
function onThreeDblClick(item: ComponentListItem): void {
  void store.add3DComponent(item.id);
}

/** 画布中心的设计坐标（用于双击添加时的落点） */
function centerPoint(): { x: number; y: number } {
  const cw = store.engineConfig.canvas?.width ?? 1920;
  const ch = store.engineConfig.canvas?.height ?? 1080;
  return { x: cw / 2 - 100, y: ch / 2 - 60 };
}

function iconPath(def: WidgetDefinition): string {
  return typeof def.icon === 'string' ? def.icon : '';
}
</script>

<template>
  <div class="library-panel">
    <div class="library-search">
      <BaseInput v-model:model-value="keyword" placeholder="搜索组件 / 模型" size="sm" clearable />
    </div>

    <div class="library-scroll">
      <!-- 2D 组件 -->
      <section v-for="g in filteredGroups" :key="g.category" class="lib-group">
        <div class="group-head" @click="toggle('2d-' + g.category)">
          <IconBase :name="expanded['2d-' + g.category] === false ? 'chevron-right' : 'chevron-down'" :size="14" />
          <span>{{ g.label }}</span>
          <span class="count">{{ g.widgets.length }}</span>
        </div>
        <div v-show="expanded['2d-' + g.category] !== false" class="group-grid">
          <div
            v-for="w in g.widgets"
            :key="w.type"
            class="lib-item"
            draggable="true"
            :title="`拖拽到画布，或双击添加：${w.name}`"
            @dragstart="onDragStart($event, { widgetType: w.type })"
            @dblclick="onWidgetDblClick(w)"
          >
            <svg viewBox="0 0 24 24" class="lib-icon" fill="none" stroke="currentColor" stroke-width="1.6">
              <path :d="iconPath(w)" />
            </svg>
            <span class="lib-name">{{ w.name }}</span>
          </div>
        </div>
      </section>

      <!-- 三维组件 -->
      <section v-if="threeGroups.length" class="lib-group">
        <div class="group-head" @click="toggle('3d')">
          <IconBase :name="expanded['3d'] === false ? 'chevron-right' : 'chevron-down'" :size="14" />
          <span>三维组件</span>
          <span class="count">{{ store.componentCatalog.length }}</span>
        </div>
        <div v-show="expanded['3d'] !== false" class="group-list">
          <div
            v-for="g in threeGroups"
            :key="g.category"
            class="three-sub"
          >
            <div class="three-sub-title">{{ g.label }}</div>
            <div
              v-for="item in g.widgets"
              :key="item.id"
              class="three-item"
              draggable="true"
              :title="`拖拽到画布，或双击添加：${item.name}`"
              @dragstart="onDragStart($event, { componentId: item.id })"
              @dblclick="onThreeDblClick(item)"
            >
              <IconBase name="cube" :size="16" />
              <span class="three-name">{{ item.name }}</span>
            </div>
          </div>
        </div>
      </section>

      <EmptyState v-if="!filteredGroups.length && !threeGroups.length" text="未找到匹配的组件" />
    </div>
  </div>
</template>

<style scoped>
.library-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.library-search {
  padding: 10px;
  border-bottom: 1px solid #eef1f5;
}
.library-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 16px;
}
.lib-group {
  margin-bottom: 6px;
}
.group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 4px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: #425466;
}
.group-head .count {
  margin-left: auto;
  font-weight: 400;
  color: #adb5bd;
  font-size: 12px;
}
.group-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 4px;
}
.lib-item {
  border: 1px solid #eef1f5;
  border-radius: 8px;
  padding: 10px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: grab;
  background: #fafcff;
  transition: all 0.15s;
  user-select: none;
}
.lib-item:hover {
  border-color: #00b8d9;
  box-shadow: 0 2px 8px rgba(0, 184, 217, 0.15);
}
.lib-icon {
  width: 26px;
  height: 26px;
  color: #0ca678;
}
.lib-name {
  font-size: 12px;
  color: #425466;
}
.group-list {
  padding: 4px;
}
.three-sub-title {
  font-size: 12px;
  color: #868e96;
  margin: 6px 2px 4px;
}
.three-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #eef1f5;
  border-radius: 8px;
  margin-bottom: 6px;
  cursor: grab;
  background: #fafcff;
}
.three-item:hover {
  border-color: #00b8d9;
}
.three-name {
  font-size: 13px;
  color: #425466;
}
</style>
