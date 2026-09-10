<script setup lang="ts">
/**
 * 版本历史抽屉内容：列出场景版本，支持回滚（二次确认）。
 * 版本列表通过 sceneApi.getVersions 获取；回滚调用后端 REST 接口。
 */
import { onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useEditorStore } from '@/stores/editor';
import type { SceneVersionItem } from '@dt/shared-types';
import { http } from '@/services/request';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import BaseButton from '@/components/ui/BaseButton.vue';
import SpinnerBox from '@/components/ui/SpinnerBox.vue';
import EmptyState from '@/components/ui/EmptyState.vue';

const store = useEditorStore();
const toast = useToast();
const { confirm } = useConfirm();
const { sceneId } = storeToRefs(store);

const loading = ref(false);
const versions = ref<SceneVersionItem[]>([]);

async function load(): Promise<void> {
  if (!sceneId.value) return;
  loading.value = true;
  try {
    const res = await http.get<SceneVersionItem[]>(`/scenes/${sceneId.value}/versions`);
    versions.value = Array.isArray(res) ? res : ((res as any)?.dataList ?? []);
  } catch {
    versions.value = [];
  } finally {
    loading.value = false;
  }
}

async function rollback(v: SceneVersionItem): Promise<void> {
  const ok = await confirm({
    title: '回滚版本',
    message: `确认回滚到版本 ${v.version}？回滚后当前未保存的改动将被覆盖。`,
  });
  if (!ok) return;
  try {
    await http.post(`/scenes/${sceneId.value}/rollback`, { versionNo: v.versionNo });
    toast.success('已触发回滚，正在重新加载…');
    await store.loadScene(sceneId.value);
  } catch {
    toast.error('回滚失败，请检查后端是否支持该接口');
  }
}

onMounted(load);
</script>

<template>
  <div class="version-history">
    <SpinnerBox v-if="loading" text="加载版本…" />
    <EmptyState v-else-if="!versions.length" text="暂无历史版本，发布后将生成版本" />

    <ul v-else class="vh-list">
      <li v-for="v in versions" :key="v.id" class="vh-item">
        <div class="vh-main">
          <div class="vh-ver">v{{ v.version }}</div>
          <div class="vh-meta">
            <div class="vh-log">{{ v.changeLog || '（无变更说明）' }}</div>
            <div class="vh-sub">{{ v.publishedByName || '未知' }} · {{ v.publishedAt }}</div>
          </div>
        </div>
        <BaseButton type="ghost" size="sm" icon="rollback" @click="rollback(v)">回滚</BaseButton>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.version-history {
  padding: 4px;
}
.vh-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.vh-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  border: 1px solid #eef1f5;
  border-radius: 8px;
  margin-bottom: 8px;
}
.vh-main {
  display: flex;
  gap: 10px;
  align-items: center;
}
.vh-ver {
  font-weight: 700;
  color: #00b8d9;
  min-width: 48px;
}
.vh-log {
  font-size: 13px;
  color: #1f2d3d;
}
.vh-sub {
  font-size: 11px;
  color: #adb5bd;
}
</style>
