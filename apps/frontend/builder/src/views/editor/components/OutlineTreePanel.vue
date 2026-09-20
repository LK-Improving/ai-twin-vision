<script setup lang="ts">
/**
 * 图层树面板。
 * 顶层按 layers（GIS / 精细模型 / 大屏面板）分组，下挂三维实例与 2D 节点。
 * 支持点选 / 多选（ctrl 切换、shift 连续）、显隐、锁定、拖拽排序、右键菜单、重命名。
 */
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useEditorStore } from '@/stores/editor';
import type { WidgetNode, SceneComponentInstance } from '@dt/shared-types';
import { getWidget } from '@dt/widgets';
import IconBase from '@/components/ui/IconBase.vue';
import OutlineNode from './OutlineNode.vue';

const store = useEditorStore();
const { layers, selectedIds, page, components } = storeToRefs(store);

interface TreeItem {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  children?: TreeItem[];
  kind: '3D' | '2D';
}

function mapNode(n: WidgetNode): TreeItem {
  const def = getWidget(n.type);
  return {
    id: n.id,
    name: n.name || def?.name || n.type,
    type: n.type,
    visible: n.visible !== false,
    locked: !!n.locked,
    kind: '2D',
    children: n.children?.map(mapNode),
  };
}

const grouped = computed(() =>
  layers.value
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((layer) => {
      const items: TreeItem[] = [];
      if (layer.engine === 'DOM') {
        items.push(...page.value.nodes.filter((n) => n.layerId === layer.id).map(mapNode));
      } else {
        items.push(
          ...components.value
            .filter((c) => c.layerId === layer.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((c: SceneComponentInstance): TreeItem => ({
              id: c.id,
              name:
                c.name ||
                store.getComponentItem(c.componentId)?.name ||
                c.componentType ||
                '三维组件',
              type: c.componentType || '',
              visible: c.visible !== false,
              locked: !!c.locked,
              kind: '3D',
            })),
        );
      }
      return { layer, items };
    }),
);

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id);
}

function onSelect(id: string, e: MouseEvent, list: TreeItem[]): void {
  if (e.ctrlKey || e.metaKey) {
    const set = new Set(selectedIds.value);
    // 多选切换：已选则移除，未选则加入
    if (set.has(id)) set.delete(id);
    else set.add(id);
    store.selectNodes([...set]);
  } else if (e.shiftKey) {
    const ids = list.map((i) => i.id);
    const last = selectedIds.value[selectedIds.value.length - 1];
    const a = ids.indexOf(last);
    const b = ids.indexOf(id);
    if (a >= 0 && b >= 0) {
      const [s, e2] = a < b ? [a, b] : [b, a];
      store.selectNodes(ids.slice(s, e2 + 1));
    } else {
      store.selectNodes([id]);
    }
  } else {
    store.selectNodes([id]);
  }
}

function toggleVisible(id: string): void {
  store.toggleNodeVisible(id);
}
function toggleLock(id: string): void {
  store.lockNode(id);
}

// -------------------------------------------------------------- 右键菜单
const menu = ref<{ x: number; y: number; id: string } | null>(null);
function onContext(id: string, e: MouseEvent): void {
  e.preventDefault();
  if (!isSelected(id)) store.selectNodes([id]);
  menu.value = { x: e.clientX, y: e.clientY, id };
}
function closeMenu(): void {
  menu.value = null;
}
function onDuplicate(): void {
  if (menu.value) store.duplicateNode(menu.value.id);
  closeMenu();
}
function onDelete(): void {
  if (menu.value) store.removeNodes([menu.value.id]);
  closeMenu();
}
function onRename(): void {
  if (menu.value) {
    const node = findNodeById(page.value.nodes, menu.value.id);
    const comp = components.value.find((c) => c.id === menu.value!.id);
    const v = node?.name ?? comp?.name ?? '';
    editing.value = { id: menu.value.id, value: v };
  }
  closeMenu();
}
function moveLayer(dir: 'up' | 'down' | 'top' | 'bottom'): void {
  if (!menu.value) return;
  const layer = findLayerOf(menu.value.id);
  if (!layer) return;
  const list = (layer.engine === 'DOM' ? page.value.nodes : components.value) as Array<{
    id: string;
    layerId: string | null;
    sortOrder: number;
  }>;
  const ids = list
    .filter((x) => x.layerId === layer.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((x) => x.id);
  const idx = ids.indexOf(menu.value.id);
  if (idx < 0) return;
  const reordered = [...ids];
  const [it] = reordered.splice(idx, 1);
  let target = idx;
  if (dir === 'up') target = Math.max(0, idx - 1);
  else if (dir === 'down') target = Math.min(reordered.length, idx + 1);
  else if (dir === 'top') target = 0;
  else target = reordered.length;
  reordered.splice(target, 0, it);
  store.reorderLayer(layer.id, reordered);
  closeMenu();
}
function findLayerOf(id: string) {
  for (const g of grouped.value) if (g.items.some((i) => i.id === id)) return g.layer;
  return null;
}
function findNodeById(list: WidgetNode[], id: string): WidgetNode | null {
  for (const n of list) {
    if (n.id === id) return n;
    if (n.children) {
      const r = findNodeById(n.children, id);
      if (r) return r;
    }
  }
  return null;
}

// -------------------------------------------------------------- 拖拽排序
const dragId = ref<string | null>(null);
function onDragStart(id: string, e: DragEvent): void {
  dragId.value = id;
  e.dataTransfer?.setData('text/plain', id);
}
function onDrop(e: DragEvent, layerId: string): void {
  e.preventDefault();
  const id = dragId.value;
  dragId.value = null;
  if (!id) return;
  const layer = layers.value.find((l) => l.id === layerId);
  if (!layer) return;
  const list = (layer.engine === 'DOM' ? page.value.nodes : components.value) as Array<{
    id: string;
    layerId: string | null;
    sortOrder: number;
  }>;
  const ids = list
    .filter((x) => x.layerId === layerId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((x) => x.id);
  if (ids.indexOf(id) < 0) return;
  const dropEl = (e.target as HTMLElement).closest('[data-id]');
  const dropId = dropEl?.getAttribute('data-id');
  const to = dropId ? ids.indexOf(dropId) : ids.length - 1;
  const reordered = [...ids];
  const from = reordered.indexOf(id);
  reordered.splice(from, 1);
  const insertAt = to < 0 ? reordered.length : Math.max(0, reordered.indexOf(String(to)));
  reordered.splice(insertAt, 0, id);
  store.reorderLayer(layerId, reordered);
}

// -------------------------------------------------------------- 重命名
const editing = ref<{ id: string; value: string } | null>(null);
function commitRename(id: string, value: string): void {
  const v = value.trim();
  editing.value = null;
  const node = findNodeById(page.value.nodes, id);
  if (node && v) {
    store.updateNode(id, { name: v }, 'rename');
  } else {
    const comp = components.value.find((c) => c.id === id);
    if (comp && v) {
      comp.name = v;
      store.dirty = true;
    }
  }
}
</script>

<template>
  <div class="outline-panel" @click="closeMenu">
    <div class="outline-scroll">
      <section v-for="g in grouped" :key="g.layer.id" class="outline-group" @dragover.prevent>
        <div class="group-head">
          <span class="group-name">{{ g.layer.name }}</span>
          <IconBase
            :name="g.layer.visible ? 'eye' : 'eye-off'"
            :size="14"
            class="group-eye"
            @click.stop="store.setLayerVisible(g.layer.id, !g.layer.visible)"
          />
        </div>

        <div class="group-items" :data-layer="g.layer.id" @drop="onDrop($event, g.layer.id)">
          <template v-if="g.layer.engine === 'DOM'">
            <OutlineNode
              v-for="item in g.items"
              :key="item.id"
              :item="item"
              :selected="isSelected(item.id)"
              :editing-id="editing?.id ?? null"
              :editing-value="editing?.value ?? ''"
              @select="(id, e) => onSelect(id, e, g.items)"
              @toggle-visible="toggleVisible"
              @toggle-lock="toggleLock"
              @context="onContext"
              @dragstart="onDragStart"
              @commit-rename="commitRename"
            />
          </template>
          <div
            v-for="item in g.layer.engine !== 'DOM' ? g.items : []"
            :key="item.id"
            class="tree-row"
            :class="{ selected: isSelected(item.id), locked: item.locked }"
            :data-id="item.id"
            draggable="true"
            @click="onSelect(item.id, $event, g.items)"
            @contextmenu="onContext(item.id, $event)"
            @dragstart="onDragStart(item.id, $event)"
          >
            <IconBase name="cube" :size="14" class="item-icon" />
            <span class="item-name">{{ item.name }}</span>
            <span class="item-actions">
              <IconBase
                :name="item.visible ? 'eye' : 'eye-off'"
                :size="13"
                @click.stop="toggleVisible(item.id)"
              />
              <IconBase
                :name="item.locked ? 'lock' : 'unlock'"
                :size="13"
                @click.stop="toggleLock(item.id)"
              />
            </span>
          </div>
          <div v-if="!g.items.length" class="empty-hint">该图层暂无内容</div>
        </div>
      </section>
    </div>

    <ul
      v-if="menu"
      class="ctx-menu"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
      @click.stop
    >
      <li @click="onRename">重命名</li>
      <li @click="onDuplicate">复制</li>
      <li @click="moveLayer('up')">上移一层</li>
      <li @click="moveLayer('down')">下移一层</li>
      <li @click="moveLayer('top')">置顶</li>
      <li @click="moveLayer('bottom')">置底</li>
      <li class="danger" @click="onDelete">删除</li>
    </ul>
  </div>
</template>

<style scoped>
.outline-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.outline-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px 16px;
}
.outline-group {
  margin-bottom: 8px;
}
.group-head {
  display: flex;
  align-items: center;
  padding: 6px 4px;
  font-size: 13px;
  font-weight: 600;
  color: #425466;
}
.group-name {
  flex: 1;
}
.group-eye {
  color: #adb5bd;
  cursor: pointer;
}
.group-items {
  padding-left: 8px;
  border-left: 1px dashed #eef1f5;
  min-height: 8px;
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #495057;
}
.tree-row:hover {
  background: #f1f7ff;
}
.tree-row.selected {
  background: #e3f6ff;
  color: #0b7285;
}
.tree-row.locked {
  opacity: 0.6;
}
.item-icon {
  color: #0ca678;
  flex-shrink: 0;
}
.item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-actions {
  display: none;
  gap: 4px;
  color: #adb5bd;
}
.tree-row:hover .item-actions,
.tree-row.selected .item-actions {
  display: flex;
}
.empty-hint {
  font-size: 12px;
  color: #adb5bd;
  padding: 6px 8px;
}
.ctx-menu {
  position: fixed;
  z-index: 1000;
  min-width: 120px;
  background: #fff;
  border: 1px solid #e3e8ef;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  list-style: none;
  margin: 0;
  padding: 4px;
  font-size: 13px;
}
.ctx-menu li {
  padding: 7px 12px;
  border-radius: 6px;
  cursor: pointer;
}
.ctx-menu li:hover {
  background: #f1f7ff;
}
.ctx-menu li.danger {
  color: #e03131;
}
</style>
