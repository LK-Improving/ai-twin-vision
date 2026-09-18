<script setup lang="ts">
/**
 * 模型资产选择器。从 GET /model-assets 拉取资产，选中后回传资源地址与名称。
 */
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useEditorStore } from '@/stores/editor';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import EmptyState from '@/components/ui/EmptyState.vue';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  'update:visible': [v: boolean];
  pick: [url: string, name: string];
}>();

const store = useEditorStore();
const { modelAssets } = storeToRefs(store);
const keyword = ref('');

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return modelAssets.value;
  return modelAssets.value.filter((a) => a.name.toLowerCase().includes(kw));
});

watch(
  () => props.visible,
  (v) => {
    if (v && modelAssets.value.length === 0) void store.loadModelAssets();
  },
);

function close(): void {
  emit('update:visible', false);
}
function pick(url: string, name: string): void {
  emit('pick', url, name);
}
</script>

<template>
  <BaseModal :visible="visible" title="选择模型资产" width="640" @update:visible="emit('update:visible', $event)" @cancel="close">
    <div class="picker">
      <BaseInput v-model:model-value="keyword" placeholder="搜索模型资产" size="sm" clearable class="picker-search" />
      <div v-if="filtered.length" class="asset-grid">
        <div
          v-for="a in filtered"
          :key="a.id"
          class="asset-card"
          @click="pick(a.url, a.name)"
        >
          <div class="asset-thumb">
            <img v-if="a.thumbnailUrl" :src="a.thumbnailUrl" alt="缩略图" />
            <span v-else class="asset-ph">无预览</span>
          </div>
          <div class="asset-name">{{ a.name }}</div>
          <div class="asset-type">{{ a.type || '模型' }}</div>
        </div>
      </div>
      <EmptyState v-else text="暂无模型资产，请先在资源管理上传" />
    </div>
  </BaseModal>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.picker-search {
  max-width: 260px;
}
.asset-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  max-height: 360px;
  overflow-y: auto;
}
.asset-card {
  border: 1px solid #eef1f5;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.asset-card:hover {
  border-color: #00b8d9;
  box-shadow: 0 2px 8px rgba(0, 184, 217, 0.15);
}
.asset-thumb {
  height: 72px;
  border-radius: 6px;
  background: #f1f3f5;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  margin-bottom: 6px;
}
.asset-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.asset-ph {
  font-size: 12px;
  color: #adb5bd;
}
.asset-name {
  font-size: 13px;
  color: #1f2d3d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-type {
  font-size: 11px;
  color: #adb5bd;
}
</style>
