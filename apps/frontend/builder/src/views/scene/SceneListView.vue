<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  BLANK_CANVAS_OVERRIDE,
  type CreateSceneRequest,
  type SceneListItem,
  type SceneType,
  type SceneVersionItem,
} from '@dt/shared-types';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseDrawer from '@/components/ui/BaseDrawer.vue';
import BasePagination from '@/components/ui/BasePagination.vue';
import BaseTextarea from '@/components/ui/BaseTextarea.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import SpinnerBox from '@/components/ui/SpinnerBox.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import IconBase from '@/components/ui/IconBase.vue';
import AiSceneDialog from './AiSceneDialog.vue';
import { useSceneStore } from '@/stores/scene';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import { useDebounce } from '@/composables/useDebounce';
import { getSceneVersionsApi, rollbackSceneApi } from '@/services/api/scene';
import { formatDateTime } from '@/utils/format';

const router = useRouter();
const store = useSceneStore();
const toast = useToast();
const { confirm } = useConfirm();

/** 搜索输入值，防抖后写入 store */
const searchInput = ref('');
const { run: runSearch } = useDebounce((value: string) => {
  store.setKeyword(value);
  void store.fetchList();
}, 350);

function onSearchInput(value: string): void {
  searchInput.value = value;
  runSearch(value);
}

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已发布', value: 'PUBLISHED' },
  { label: '已归档', value: 'ARCHIVED' },
];

const sortOptions = [
  { label: '最近更新', value: 'updatedAt,DESC' },
  { label: '最早创建', value: 'createdAt,ASC' },
  { label: '名称升序', value: 'name,ASC' },
];
const sort = ref('updatedAt,DESC');

const sceneTypeOptions = [
  { label: '宏观场景（GIS）', value: 'MACRO' },
  { label: '微观场景（精细模型）', value: 'MICRO' },
  { label: '混合场景', value: 'HYBRID' },
];

/** 状态 → 徽标语义 */
function statusMeta(status?: string): {
  type: 'success' | 'warning' | 'info' | 'default';
  text: string;
} {
  switch (status) {
    case 'PUBLISHED':
      return { type: 'success', text: '已发布' };
    case 'ARCHIVED':
      return { type: 'default', text: '已归档' };
    case 'DRAFT':
    default:
      return { type: 'warning', text: '草稿' };
  }
}

function sceneTypeText(type: string): string {
  const hit = sceneTypeOptions.find((o) => o.value === type);
  return hit ? hit.label.split('（')[0] : type;
}

/* ------------------------------ 新建场景 ------------------------------ */

const createVisible = ref(false);
const createLoading = ref(false);
/** 画布模式：blank = 空白无限画布（默认，适合自己摆组件做大屏）；globe = 三维地球场景 */
const canvasMode = ref<'blank' | 'globe'>('blank');
const canvasModeOptions = [
  { label: '空白画布（无地球，推荐）', value: 'blank' },
  { label: '三维地球场景', value: 'globe' },
];
const createForm = reactive<CreateSceneRequest>({
  name: '',
  description: '',
  sceneType: 'HYBRID' as SceneType,
});

function openCreate(): void {
  createForm.name = '';
  createForm.description = '';
  createForm.sceneType = 'HYBRID' as SceneType;
  canvasMode.value = 'blank';
  createVisible.value = true;
}

async function submitCreate(): Promise<void> {
  if (!createForm.name.trim()) {
    toast.warning('请输入场景名称');
    return;
  }
  createLoading.value = true;
  try {
    await store.create({
      name: createForm.name.trim(),
      description: createForm.description?.trim() || undefined,
      sceneType: createForm.sceneType,
      // 空白画布：只提交「关掉地球/星空/大气」的局部配置，后端会与默认配置 deepMerge
      config: canvasMode.value === 'blank' ? BLANK_CANVAS_OVERRIDE : undefined,
    });
    toast.success('场景创建成功');
    createVisible.value = false;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '创建场景失败');
  } finally {
    createLoading.value = false;
  }
}

/* ------------------------------ 克隆场景 ------------------------------ */

const cloneTarget = ref<SceneListItem | null>(null);
const cloneName = ref('');
const cloneLoading = ref(false);

function openClone(item: SceneListItem): void {
  cloneTarget.value = item;
  cloneName.value = `${item.name} - 副本`;
}

async function submitClone(): Promise<void> {
  if (!cloneTarget.value || !cloneName.value.trim()) return;
  cloneLoading.value = true;
  try {
    await store.clone({ id: cloneTarget.value.id, name: cloneName.value.trim() });
    cloneTarget.value = null;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '克隆失败');
  } finally {
    cloneLoading.value = false;
  }
}

/* ------------------------------ 发布 / 删除 ------------------------------ */

async function onPublish(item: SceneListItem): Promise<void> {
  const ok = await confirm({
    title: '发布场景',
    message: `发布后「${item.name}」将生成新的发布版本，预览页将使用最新发布内容。`,
    confirmText: '发布',
  });
  if (!ok) return;
  try {
    await store.publish(item.id, { changeLog: '手动发布' });
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '发布失败');
  }
}

async function onDelete(item: SceneListItem): Promise<void> {
  const ok = await confirm({
    title: '删除场景',
    message: `确定删除「${item.name}」吗？该操作不可恢复。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await store.remove(item.id);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '删除失败');
  }
}

/* ------------------------------ 版本历史 ------------------------------ */

const versionDrawer = ref(false);
const versionLoading = ref(false);
const versions = ref<SceneVersionItem[]>([]);
const versionScene = ref<SceneListItem | null>(null);

async function openVersions(item: SceneListItem): Promise<void> {
  versionScene.value = item;
  versionDrawer.value = true;
  versionLoading.value = true;
  try {
    versions.value = await getSceneVersionsApi(item.id);
  } catch (e) {
    versions.value = [];
    toast.error(e instanceof Error ? e.message : '加载版本历史失败');
  } finally {
    versionLoading.value = false;
  }
}

async function onRollback(versionNo: number): Promise<void> {
  if (!versionScene.value) return;
  const ok = await confirm({
    title: '回滚版本',
    message: `确定将「${versionScene.value.name}」回滚到 v${versionNo} 吗？当前编辑内容会被覆盖。`,
    confirmText: '回滚',
    danger: true,
  });
  if (!ok) return;
  try {
    await rollbackSceneApi(versionScene.value.id, versionNo);
    toast.success(`已回滚到 v${versionNo}`);
    versionDrawer.value = false;
    await store.fetchList();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '回滚失败');
  }
}

/* ------------------------------ 渲染 ------------------------------ */

const showEmpty = computed(() => !store.loading && store.list.length === 0);

function openEditor(item: SceneListItem): void {
  void router.push(`/scenes/${item.id}/edit`);
}

function openPreview(item: SceneListItem): void {
  window.open(`/preview/${item.id}`, '_blank');
}

onMounted(() => {
  void store.fetchList();
});

/* ------------------------------ AI 对话生成 ------------------------------ */

const aiVisible = ref(false);

function openAi(): void {
  aiVisible.value = true;
}

function onAiGenerated(): void {
  // 生成成功后刷新列表，让新场景出现在网格中
  void store.fetchList();
}
</script>

<template>
  <div class="page-shell">
    <!-- 顶部工具条 -->
    <header class="page-header">
      <div>
        <h2 class="page-title">场景管理</h2>
        <p class="page-desc">创建、编排并发布数字孪生可视化场景</p>
      </div>
      <BaseButton type="primary" icon="plus" @click="openCreate">新建场景</BaseButton>
      <BaseButton type="primary" icon="cube" @click="openAi">AI 生成</BaseButton>
    </header>

    <div class="toolbar">
      <div class="w-72">
        <BaseInput
          :model-value="searchInput"
          placeholder="搜索场景名称"
          clearable
          @update:model-value="onSearchInput"
        />
      </div>
      <div class="w-40">
        <BaseSelect
          :model-value="store.status"
          :options="statusOptions"
          @update:model-value="
            (v) => {
              store.setStatus(String(v ?? ''));
              void store.fetchList();
            }
          "
        />
      </div>
      <div class="w-44">
        <BaseSelect
          v-model="sort"
          :options="sortOptions"
          @update:model-value="void store.fetchList()"
        />
      </div>
      <div class="flex-1" />
      <BaseButton icon="refresh" @click="void store.fetchList()">刷新</BaseButton>
    </div>

    <!-- 加载 / 错误 / 空态 / 卡片网格 -->
    <div v-if="store.loading && store.list.length === 0" class="state-box">
      <SpinnerBox size="lg" text="正在加载场景" />
    </div>

    <div v-else-if="store.error" class="state-box">
      <EmptyState text="加载失败" :description="store.error" />
      <BaseButton class="mt-3" type="primary" @click="void store.fetchList()">重试</BaseButton>
    </div>

    <div v-else-if="showEmpty" class="state-box">
      <EmptyState
        text="还没有场景"
        description="点击右上角「新建场景」开始搭建第一个数字孪生大屏"
      />
    </div>

    <template v-else>
      <div class="scene-grid">
        <article v-for="item in store.list" :key="item.id" class="scene-card">
          <div class="scene-cover" @click="openEditor(item)">
            <span class="scene-cover-type">{{ sceneTypeText(item.sceneType) }}</span>
            <StatusBadge
              class="absolute right-3 top-3"
              :type="statusMeta(item.status).type"
              :text="statusMeta(item.status).text"
            />
          </div>

          <div class="scene-body">
            <h3 class="scene-name" :title="item.name" @click="openEditor(item)">{{ item.name }}</h3>
            <p class="scene-desc">{{ item.description || '暂无描述' }}</p>

            <div class="scene-meta">
              <span>v{{ item.publishVersion ?? item.version }}</span>
              <span class="meta-dot">·</span>
              <span>{{ formatDateTime(item.updatedAt) }}</span>
            </div>

            <div class="scene-actions">
              <BaseButton size="sm" type="primary" icon="edit" @click="openEditor(item)">
                编辑
              </BaseButton>
              <BaseButton size="sm" icon="eye" @click="openPreview(item)">预览</BaseButton>
              <BaseButton size="sm" icon="copy" @click="openClone(item)">克隆</BaseButton>
              <BaseButton size="sm" icon="publish" @click="onPublish(item)">发布</BaseButton>
              <div class="flex-1" />
              <button class="icon-btn" title="版本历史" @click="void openVersions(item)">
                <IconBase name="layers" :size="15" />
              </button>
              <button class="icon-btn danger" title="删除" @click="onDelete(item)">
                <IconBase name="trash" :size="15" />
              </button>
            </div>
          </div>
        </article>
      </div>

      <div class="mt-5 flex justify-end">
        <BasePagination
          :page="store.page"
          :limit="store.limit"
          :total="store.total"
          @update:page="
            (v) => {
              store.setPage(v);
              void store.fetchList();
            }
          "
          @update:limit="
            (v) => {
              store.setLimit(v);
              void store.fetchList();
            }
          "
        />
      </div>
    </template>

    <!-- 新建场景 -->
    <BaseModal
      :visible="createVisible"
      title="新建场景"
      confirm-text="创建"
      :loading="createLoading"
      @update:visible="createVisible = $event"
      @confirm="void submitCreate()"
    >
      <div class="form-stack">
        <label class="form-item">
          <span class="form-label required">场景名称</span>
          <BaseInput
            v-model="createForm.name"
            placeholder="例如：智慧园区综合管控"
            :maxlength="50"
          />
        </label>
        <label class="form-item">
          <span class="form-label">场景描述</span>
          <BaseTextarea
            v-model="createForm.description as string"
            :rows="3"
            placeholder="简要描述该场景的业务用途"
          />
        </label>
        <div class="form-item">
          <span class="form-label">场景类型</span>
          <BaseSelect v-model="createForm.sceneType as string" :options="sceneTypeOptions" />
        </div>
        <div class="form-item">
          <span class="form-label">画布模式</span>
          <BaseSelect v-model="canvasMode" :options="canvasModeOptions" />
          <p class="form-hint">
            空白画布：没有三维地球，画布无限大，直接拖自己的组件搭大屏（之后也能在编辑器顶部一键切回地球）。
          </p>
        </div>
      </div>
    </BaseModal>

    <!-- 克隆场景 -->
    <BaseModal
      :visible="cloneTarget !== null"
      title="克隆场景"
      confirm-text="确定克隆"
      :loading="cloneLoading"
      @update:visible="cloneTarget = $event ? cloneTarget : null"
      @confirm="void submitClone()"
    >
      <div class="form-stack">
        <label class="form-item">
          <span class="form-label required">新场景名称</span>
          <BaseInput v-model="cloneName" placeholder="输入克隆后的场景名称" :maxlength="50" />
        </label>
      </div>
    </BaseModal>

    <!-- 版本历史 -->
    <BaseDrawer
      :visible="versionDrawer"
      title="版本历史"
      width="460px"
      @update:visible="versionDrawer = $event"
    >
      <div v-if="versionLoading" class="py-10">
        <SpinnerBox text="加载版本" />
      </div>
      <EmptyState
        v-else-if="versions.length === 0"
        text="暂无发布版本"
        description="发布场景后即会生成版本记录"
      />
      <ul v-else class="version-list">
        <li v-for="v in versions" :key="v.id" class="version-item">
          <div class="version-head">
            <span class="version-no">v{{ v.version }}</span>
            <span class="version-time">{{ formatDateTime(v.publishedAt) }}</span>
          </div>
          <p class="version-log">{{ v.changeLog || '无变更说明' }}</p>
          <div class="version-foot">
            <span>{{ v.publishedByName || '系统' }}</span>
            <BaseButton size="sm" type="text" @click="void onRollback(v.versionNo)">
              回滚到此版本
            </BaseButton>
          </div>
        </li>
      </ul>
    </BaseDrawer>

    <!-- AI 对话生成 -->
    <AiSceneDialog
      :visible="aiVisible"
      @update:visible="aiVisible = $event"
      @generated="onAiGenerated"
    />
  </div>
</template>

<style scoped>
.page-shell {
  padding: 24px 28px 32px;
}
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
}
.page-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: #6b7280;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  flex-wrap: wrap;
}
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
}
.scene-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
}
.scene-card {
  background: #ffffff;
  border: 1px solid #e8ecf3;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
  transition:
    box-shadow 0.2s,
    transform 0.2s;
}
.scene-card:hover {
  box-shadow: 0 8px 24px rgba(16, 24, 40, 0.08);
  transform: translateY(-2px);
}
.scene-cover {
  position: relative;
  height: 148px;
  cursor: pointer;
  background:
    radial-gradient(120% 90% at 20% 10%, rgba(22, 119, 255, 0.28) 0%, transparent 55%),
    linear-gradient(135deg, #0f2748 0%, #123a63 55%, #0b1c33 100%);
}
.scene-cover::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.07) 1px, transparent 1px);
  background-size: 24px 24px;
}
.scene-cover-type {
  position: absolute;
  left: 12px;
  bottom: 10px;
  z-index: 1;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.82);
  letter-spacing: 0.5px;
}
.scene-body {
  padding: 14px 16px 12px;
}
.scene-name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scene-name:hover {
  color: #1677ff;
}
.scene-desc {
  margin: 6px 0 10px;
  font-size: 12.5px;
  color: #6b7280;
  height: 34px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.scene-meta {
  font-size: 12px;
  color: #9ca3af;
  display: flex;
  gap: 6px;
}
.meta-dot {
  opacity: 0.6;
}
.scene-actions {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #f0f3f8;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: #6b7280;
  transition:
    background 0.15s,
    color 0.15s;
}
.icon-btn:hover {
  background: #f2f5fa;
  color: #1677ff;
}
.icon-btn.danger:hover {
  background: #fef2f2;
  color: #dc2626;
}
.form-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-item {
  display: block;
}
.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: #4b5563;
}
.form-label.required::after {
  content: ' *';
  color: #dc2626;
}
.form-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #9098a6;
}
.version-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.version-item {
  border: 1px solid #e8ecf3;
  border-radius: 10px;
  padding: 12px 14px;
}
.version-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.version-no {
  font-size: 14px;
  font-weight: 600;
  color: #1677ff;
}
.version-time {
  font-size: 12px;
  color: #9ca3af;
}
.version-log {
  margin: 6px 0 8px;
  font-size: 13px;
  color: #4b5563;
}
.version-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #9ca3af;
}
</style>
