<script setup lang="ts">
/**
 * 图层树节点（支持递归渲染容器类组件的子节点）。
 * 通过文件名自引用实现递归。事件均携带节点 id，由父级 OutlineTreePanel 统一处理。
 */
import { ref, watch } from 'vue';
import IconBase from '@/components/ui/IconBase.vue';
import BaseInput from '@/components/ui/BaseInput.vue';

interface OutlineItem {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  kind: '3D' | '2D';
  children?: OutlineItem[];
}

const props = defineProps<{
  item: OutlineItem;
  selected: boolean;
  editingId: string | null;
  editingValue: string;
}>();

const emit = defineEmits<{
  select: [id: string, e: MouseEvent];
  toggleVisible: [id: string];
  toggleLock: [id: string];
  context: [id: string, e: MouseEvent];
  dragstart: [id: string, e: DragEvent];
  commitRename: [id: string, value: string];
}>();

const renameVal = ref('');
watch(
  () => props.editingId,
  (id) => {
    if (id === props.item.id) renameVal.value = props.editingValue;
  },
  { immediate: true },
);

function commit(): void {
  emit('commitRename', props.item.id, renameVal.value.trim());
}
</script>

<template>
  <div class="outline-node">
    <div
      class="tree-row"
      :class="{ selected, locked: item.locked }"
      :data-id="item.id"
      draggable="true"
      @click="emit('select', item.id, $event)"
      @contextmenu="emit('context', item.id, $event)"
      @dragstart="emit('dragstart', item.id, $event)"
    >
      <IconBase name="panel" :size="14" class="item-icon" />
      <BaseInput
        v-if="editingId === item.id"
        v-model:model-value="renameVal"
        size="sm"
        class="rename-input"
        @click.stop
        @blur="commit"
        @keyup.enter="commit"
      />
      <span v-else class="item-name">{{ item.name }}</span>
      <span class="item-type">{{ item.type }}</span>
      <span class="item-actions">
        <IconBase
          :name="item.visible ? 'eye' : 'eye-off'"
          :size="13"
          @click.stop="emit('toggleVisible', item.id)"
        />
        <IconBase
          :name="item.locked ? 'lock' : 'unlock'"
          :size="13"
          @click.stop="emit('toggleLock', item.id)"
        />
      </span>
    </div>

    <div v-if="item.children?.length" class="tree-children">
      <OutlineNode
        v-for="child in item.children"
        :key="child.id"
        :item="child"
        :selected="selected && selected"
        :editing-id="editingId"
        :editing-value="editingValue"
        @select="(id, e) => emit('select', id, e)"
        @toggle-visible="(id) => emit('toggleVisible', id)"
        @toggle-lock="(id) => emit('toggleLock', id)"
        @context="(id, e) => emit('context', id, e)"
        @dragstart="(id, e) => emit('dragstart', id, e)"
        @commit-rename="(id, v) => emit('commitRename', id, v)"
      />
    </div>
  </div>
</template>

<style scoped>
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
.item-type {
  font-size: 10px;
  color: #adb5bd;
}
.rename-input {
  flex: 1;
}
.tree-children {
  padding-left: 14px;
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
</style>
