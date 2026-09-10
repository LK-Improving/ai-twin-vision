<script setup lang="ts">
/**
 * 编辑器顶部工具栏。
 * 包含：返回、场景名（双击重命名）、状态徽标、撤销/重做、网格/标尺开关、
 * 缩放控制、预览、保存、发布、版本历史入口、协同在线成员占位。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useEditorStore } from '@/stores/editor';
import { SCENE_STATUS_TEXT, SceneStatus } from '@dt/shared-types';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseDrawer from '@/components/ui/BaseDrawer.vue';
import IconBase from '@/components/ui/IconBase.vue';
import PublishDialog from './PublishDialog.vue';
import VersionHistoryDrawer from './VersionHistoryDrawer.vue';

const props = defineProps<{ leftCollapsed: boolean; rightCollapsed: boolean }>();
const emit = defineEmits<{ toggleLeft: []; toggleRight: [] }>();

const router = useRouter();
const store = useEditorStore();
const { sceneDetail, dirty, saving, canvasScale, canUndo, canRedo, showGrid, showRuler } =
  storeToRefs(store);

const showPublish = ref(false);
const showHistory = ref(false);
const editingName = ref(false);
const nameDraft = ref('');

/** 适应屏幕：按画布可用区域计算（模板内不直接访问 window） */
function fitScreen(): void {
  store.fitScreen(window.innerWidth - 600, window.innerHeight - 100);
}

/** 状态徽标文案与配色 */
const statusInfo = computed(() => {
  const raw = sceneDetail.value?.status;
  const text = raw != null ? SCENE_STATUS_TEXT[raw as unknown as SceneStatus] ?? 'DRAFT' : 'DRAFT';
  const map: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: '草稿', cls: 'badge-draft' },
    PUBLISHED: { label: '已发布', cls: 'badge-published' },
    ARCHIVED: { label: '已归档', cls: 'badge-archived' },
  };
  return map[text] ?? map.DRAFT;
});

function goBack(): void {
  router.back();
}

function onNameDblClick(): void {
  nameDraft.value = sceneDetail.value?.name ?? '';
  editingName.value = true;
}

function commitName(): void {
  if (!sceneDetail.value) return;
  const v = nameDraft.value.trim();
  if (v && v !== sceneDetail.value.name) {
    sceneDetail.value.name = v;
    store.dirty = true;
  }
  editingName.value = false;
}

function onPreview(): void {
  if (store.sceneId) router.push(`/preview/${store.sceneId}`);
}

/** 协同成员占位（真实接入协同服务后由后端推送） */
const collabMembers = [
  { id: 'u1', name: '张工', color: '#00eaff' },
  { id: 'u2', name: '李工', color: '#ffcc00' },
];
</script>

<template>
  <header class="editor-header">
    <div class="header-left">
      <BaseButton type="ghost" size="sm" icon="arrow-left" @click="goBack">返回</BaseButton>
      <IconBase
        :name="props.leftCollapsed ? 'panel-left-open' : 'panel-left-close'"
        :size="16"
        class="toggle-icon"
        @click="emit('toggleLeft')"
      />
      <div class="scene-name">
        <BaseInput
          v-if="editingName"
          v-model:model-value="nameDraft"
          size="sm"
          class="name-input"
          @blur="commitName"
          @keyup.enter="commitName"
        />
        <span v-else class="name-text" title="双击重命名" @dblclick="onNameDblClick">
          {{ sceneDetail?.name ?? '未命名场景' }}
        </span>
        <span class="badge" :class="statusInfo.cls">{{ statusInfo.label }}</span>
      </div>
    </div>

    <div class="header-center">
      <BaseButton type="ghost" size="sm" icon="undo" :disabled="!canUndo" @click="store.undo()" />
      <BaseButton type="ghost" size="sm" icon="redo" :disabled="!canRedo" @click="store.redo()" />
      <span class="divider" />
      <BaseButton
        type="ghost"
        size="sm"
        icon="grid"
        :class="{ 'is-on': showGrid }"
        @click="store.toggleGrid()"
      />
      <BaseButton
        type="ghost"
        size="sm"
        icon="ruler"
        :class="{ 'is-on': showRuler }"
        @click="store.toggleRuler()"
      />
      <span class="divider" />
      <BaseButton type="ghost" size="sm" icon="minus" @click="store.zoomOut()" />
      <span class="zoom-text">{{ Math.round(canvasScale * 100) }}%</span>
      <BaseButton type="ghost" size="sm" icon="plus" @click="store.zoomIn()" />
      <BaseButton type="ghost" size="sm" icon="fit" @click="fitScreen">
        适应
      </BaseButton>
    </div>

    <div class="header-right">
      <div class="collab">
        <span
          v-for="m in collabMembers"
          :key="m.id"
          class="avatar"
          :style="{ background: m.color }"
          :title="m.name"
        >{{ m.name[0] }}</span>
      </div>
      <BaseButton type="ghost" size="sm" icon="history" @click="showHistory = true">版本</BaseButton>
      <BaseButton type="default" size="sm" icon="eye" @click="onPreview">预览</BaseButton>
      <BaseButton
        type="primary"
        size="sm"
        icon="save"
        :loading="saving"
        :class="{ 'save-hot': dirty }"
        @click="store.save()"
      >
        保存
      </BaseButton>
      <BaseButton type="primary" size="sm" icon="rocket" @click="showPublish = true">发布</BaseButton>
      <IconBase
        :name="props.rightCollapsed ? 'panel-right-open' : 'panel-right-close'"
        :size="16"
        class="toggle-icon"
        @click="emit('toggleRight')"
      />
    </div>

    <PublishDialog v-model:visible="showPublish" />
    <BaseDrawer v-model:visible="showHistory" title="版本历史" width="420">
      <VersionHistoryDrawer />
    </BaseDrawer>
  </header>
</template>

<style scoped>
.editor-header {
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: #fff;
  border-bottom: 1px solid #e3e8ef;
  gap: 12px;
}
.header-left,
.header-center,
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.scene-name {
  display: flex;
  align-items: center;
  gap: 8px;
}
.name-text {
  font-weight: 600;
  cursor: text;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name-input {
  width: 200px;
}
.badge {
  font-size: 12px;
  padding: 1px 8px;
  border-radius: 10px;
  line-height: 18px;
}
.badge-draft {
  background: #fff4e6;
  color: #d97706;
}
.badge-published {
  background: #e6fcf5;
  color: #0ca678;
}
.badge-archived {
  background: #f1f3f5;
  color: #868e96;
}
.divider {
  width: 1px;
  height: 20px;
  background: #e3e8ef;
  margin: 0 4px;
}
.zoom-text {
  min-width: 44px;
  text-align: center;
  font-size: 13px;
}
.toggle-icon {
  cursor: pointer;
  color: #868e96;
}
.toggle-icon:hover {
  color: #1f2d3d;
}
.is-on {
  color: #00b8d9 !important;
}
.collab {
  display: flex;
  align-items: center;
}
.avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  color: #06222b;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  margin-left: -6px;
}
.save-hot {
  animation: pulse 1.4s infinite;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(0, 184, 217, 0.4); }
  70% { box-shadow: 0 0 0 6px rgba(0, 184, 217, 0); }
  100% { box-shadow: 0 0 0 0 rgba(0, 184, 217, 0); }
}
</style>
