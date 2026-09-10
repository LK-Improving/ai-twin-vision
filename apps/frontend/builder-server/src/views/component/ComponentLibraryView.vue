<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  type ComponentConfigSchema,
  type ComponentDetail,
  type ComponentListItem,
  type ComponentQuery,
} from '@dt/shared-types';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BasePagination from '@/components/ui/BasePagination.vue';
import BaseTextarea from '@/components/ui/BaseTextarea.vue';
import BaseSwitch from '@/components/ui/BaseSwitch.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import SpinnerBox from '@/components/ui/SpinnerBox.vue';
import IconBase from '@/components/ui/IconBase.vue';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import { usePagination } from '@/composables/usePagination';
import { useDebounce } from '@/composables/useDebounce';
import {
  createComponentApi,
  deleteComponentApi,
  getComponentDetailApi,
  getComponentsApi,
  updateComponentApi,
} from '@/services/api/component';
import { formatDateTime } from '@/utils/format';

const toast = useToast();
const { confirm } = useConfirm();
const { page, limit, total, onChangePage, onChangeLimit } = usePagination();

const loading = ref(false);
const error = ref<string | null>(null);
const list = ref<ComponentListItem[]>([]);
const keyword = ref('');

/** 分类导航 */
const categories: Array<{ key: string; label: string; icon: string }> = [
  { key: '', label: '全部组件', icon: 'layers' },
  { key: 'GIS_3D', label: '三维 GIS', icon: 'globe' },
  { key: 'MODEL_3D', label: '精细模型', icon: 'cube' },
  { key: 'CHART', label: '图表', icon: 'chart' },
  { key: 'UI', label: '基础 UI', icon: 'text' },
  { key: 'MEDIA', label: '媒体', icon: 'image' },
  { key: 'CUSTOM', label: '自定义', icon: 'settings' },
];
const activeCategory = ref('');

const { run: runSearch } = useDebounce(() => {
  page.value = 1;
  void fetchList();
}, 350);

async function fetchList(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const params: ComponentQuery = {
      page: page.value,
      limit: limit.value,
      keyword: keyword.value || undefined,
      category: activeCategory.value || undefined,
    };
    const res = await getComponentsApi(params);
    list.value = res.dataList;
    total.value = res.total;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载组件失败';
    list.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function onSearch(value: string): void {
  keyword.value = value;
  runSearch();
}

function switchCategory(key: string): void {
  activeCategory.value = key;
  page.value = 1;
  void fetchList();
}

/* ------------------------------ 新建/编辑 ------------------------------ */

const dialogVisible = ref(false);
const saving = ref(false);
const editingId = ref<string | null>(null);
const schemaError = ref('');

/** 表单模型：configSchema 以 JSON 文本编辑，提交前再解析 */
interface ComponentForm {
  name: string;
  componentType: string;
  category: string;
  description: string;
  thumbnailUrl: string;
  configSchemaJson: string;
  isPublic: boolean;
}

const form = reactive<ComponentForm>({
  name: '',
  componentType: 'MODEL_3D',
  category: 'MODEL_3D',
  description: '',
  thumbnailUrl: '',
  configSchemaJson: '',
  isPublic: true,
});

const typeOptions = [
  { label: '三维模型 MODEL_3D', value: 'MODEL_3D' },
  { label: '3D Tiles TILES_3D', value: 'TILES_3D' },
  { label: '地形 TERRAIN', value: 'TERRAIN' },
  { label: '兴趣点 POI', value: 'POI' },
  { label: '路径 PATH', value: 'PATH' },
  { label: '粒子 PARTICLE', value: 'PARTICLE' },
  { label: '折线图 CHART_LINE', value: 'CHART_LINE' },
  { label: '柱状图 CHART_BAR', value: 'CHART_BAR' },
  { label: '饼图 CHART_PIE', value: 'CHART_PIE' },
  { label: '仪表盘 CHART_GAUGE', value: 'CHART_GAUGE' },
  { label: '文本 TEXT', value: 'TEXT' },
  { label: '指标卡 METRIC_CARD', value: 'METRIC_CARD' },
  { label: '表格 TABLE', value: 'TABLE' },
];

const categoryOptions = categories
  .filter((c) => c.key !== '')
  .map((c) => ({ label: c.label, value: c.key }));

function openCreate(): void {
  editingId.value = null;
  form.name = '';
  form.componentType = 'MODEL_3D';
  form.category = 'MODEL_3D';
  form.description = '';
  form.thumbnailUrl = '';
  form.configSchemaJson = '';
  form.isPublic = true;
  schemaError.value = '';
  dialogVisible.value = true;
}

async function openEdit(item: ComponentListItem): Promise<void> {
  editingId.value = item.id;
  schemaError.value = '';
  try {
    const detail: ComponentDetail = await getComponentDetailApi(item.id);
    form.name = detail.name;
    form.componentType = detail.componentType;
    form.category = detail.category;
    form.description = detail.description ?? '';
    form.thumbnailUrl = detail.thumbnailUrl ?? '';
    form.configSchemaJson = JSON.stringify(detail.configSchema ?? {}, null, 2);
    form.isPublic = detail.isPublic;
    dialogVisible.value = true;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '加载组件详情失败');
  }
}

/** 解析配置 Schema 文本，失败时返回 null 并提示 */
function parseSchema(): Record<string, unknown> | null {
  const text = (form.configSchemaJson ?? '').trim();
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      schemaError.value = '配置 Schema 必须是 JSON 对象';
      return null;
    }
    schemaError.value = '';
    return parsed as Record<string, unknown>;
  } catch {
    schemaError.value = '配置 Schema 不是合法 JSON';
    return null;
  }
}

async function submit(): Promise<void> {
  if (!form.name.trim()) {
    toast.warning('请输入组件名称');
    return;
  }
  const schema = parseSchema();
  if (schema === null) {
    toast.warning(schemaError.value);
    return;
  }
  saving.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      componentType: form.componentType,
      category: form.category,
      description: form.description?.trim() || undefined,
      thumbnailUrl: form.thumbnailUrl?.trim() || undefined,
      configSchema: schema as unknown as ComponentConfigSchema,
      isPublic: form.isPublic,
    };
    if (editingId.value) {
      await updateComponentApi(editingId.value, payload);
      toast.success('组件已更新');
    } else {
      await createComponentApi(payload);
      toast.success('组件已创建');
    }
    dialogVisible.value = false;
    await fetchList();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function onDelete(item: ComponentListItem): Promise<void> {
  const ok = await confirm({
    title: '删除组件',
    message: `确定删除组件「${item.name}」吗？引用了该组件的场景将无法正常渲染。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteComponentApi(item.id);
    toast.success('组件已删除');
    await fetchList();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '删除失败');
  }
}

const showEmpty = computed(() => !loading.value && list.value.length === 0);

function typeLabel(type: string): string {
  const hit = typeOptions.find((o) => o.value === type);
  return hit ? hit.label.split(' ')[0] : type;
}

onMounted(() => {
  void fetchList();
});
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">组件库</h2>
        <p class="page-desc">管理平台可复用的三维与二维可视化组件</p>
      </div>
      <BaseButton type="primary" icon="plus" @click="openCreate">新建组件</BaseButton>
    </header>

    <div class="body">
      <!-- 分类侧栏 -->
      <aside class="side">
        <nav class="side-nav">
          <button
            v-for="c in categories"
            :key="c.key"
            class="side-item"
            :class="{ active: activeCategory === c.key }"
            @click="switchCategory(c.key)"
          >
            <IconBase :name="c.icon" :size="15" />
            <span>{{ c.label }}</span>
          </button>
        </nav>
      </aside>

      <section class="main">
        <div class="toolbar">
          <div class="w-72">
            <BaseInput :model-value="keyword" placeholder="搜索组件名称" clearable @update:model-value="onSearch" />
          </div>
          <div class="flex-1" />
          <BaseButton icon="refresh" @click="void fetchList()">刷新</BaseButton>
        </div>

        <div v-if="loading && list.length === 0" class="state-box">
          <SpinnerBox size="lg" text="正在加载组件" />
        </div>

        <div v-else-if="error" class="state-box">
          <EmptyState text="加载失败" :description="error" />
          <BaseButton class="mt-3" type="primary" @click="void fetchList()">重试</BaseButton>
        </div>

        <div v-else-if="showEmpty" class="state-box">
          <EmptyState text="该分类下暂无组件" description="换个分类看看，或点击右上角新建组件" />
        </div>

        <template v-else>
          <div class="grid">
            <article v-for="item in list" :key="item.id" class="card">
              <div class="thumb">
                <img v-if="item.thumbnailUrl" :src="item.thumbnailUrl" :alt="item.name" />
                <IconBase v-else name="cube" :size="28" />
              </div>
              <div class="card-body">
                <div class="card-title">
                  <span :title="item.name">{{ item.name }}</span>
                  <span class="badge" :class="item.isPublic ? 'public' : 'private'">
                    {{ item.isPublic ? '公共' : '私有' }}
                  </span>
                </div>
                <p class="card-type">{{ typeLabel(item.componentType) }} · {{ item.version }}</p>
                <p class="card-time">{{ formatDateTime(item.createdAt) }}</p>
                <div class="card-actions">
                  <BaseButton size="sm" type="text" icon="edit" @click="void openEdit(item)">编辑</BaseButton>
                  <div class="flex-1" />
                  <button class="icon-btn danger" @click="void onDelete(item)">
                    <IconBase name="trash" :size="15" />
                  </button>
                </div>
              </div>
            </article>
          </div>

          <div class="mt-5 flex justify-end">
            <BasePagination
              :page="page"
              :limit="limit"
              :total="total"
              @update:page="(v) => { onChangePage(v); void fetchList(); }"
              @update:limit="(v) => { onChangeLimit(v); void fetchList(); }"
            />
          </div>
        </template>
      </section>
    </div>

    <BaseModal
      :visible="dialogVisible"
      :title="editingId ? '编辑组件' : '新建组件'"
      width="640px"
      confirm-text="保存"
      :loading="saving"
      @update:visible="dialogVisible = $event"
      @confirm="void submit()"
    >
      <div class="form-stack">
        <label class="form-item">
          <span class="form-label required">组件名称</span>
          <BaseInput v-model="form.name" placeholder="例如：变电站主变压器" :maxlength="50" />
        </label>

        <div class="grid-2">
          <div class="form-item">
            <span class="form-label">组件类型</span>
            <BaseSelect v-model="form.componentType" :options="typeOptions" />
          </div>
          <div class="form-item">
            <span class="form-label">所属分类</span>
            <BaseSelect v-model="form.category" :options="categoryOptions" />
          </div>
        </div>

        <label class="form-item">
          <span class="form-label">组件描述</span>
          <BaseTextarea v-model="(form.description as string)" :rows="2" placeholder="描述组件用途与适用场景" />
        </label>

        <label class="form-item">
          <span class="form-label">缩略图地址</span>
          <BaseInput v-model="(form.thumbnailUrl as string)" placeholder="https://.../thumb.png" />
        </label>

        <div class="form-item">
          <span class="form-label">配置 Schema（JSON）</span>
          <BaseTextarea
            v-model="(form.configSchemaJson as string)"
            :rows="6"
            placeholder='{"props": [{"key": "color", "label": "颜色", "type": "color", "default": "#1677ff"}]}'
          />
          <p v-if="schemaError" class="form-error">{{ schemaError }}</p>
        </div>

        <div class="form-row">
          <span class="form-label inline">是否公共</span>
          <BaseSwitch v-model="(form.isPublic as boolean)" />
          <span class="hint">公共组件对所有租户可见</span>
        </div>
      </div>
    </BaseModal>
  </div>
</template>

<style scoped>
.page {
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
.body {
  margin-top: 18px;
  display: flex;
  gap: 18px;
  align-items: flex-start;
}
.side {
  width: 190px;
  flex-shrink: 0;
  background: #ffffff;
  border: 1px solid #e8ecf3;
  border-radius: 12px;
  padding: 8px;
}
.side-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.side-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 13.5px;
  color: #4b5563;
  text-align: left;
  transition: background 0.15s, color 0.15s;
}
.side-item:hover {
  background: #f4f7fb;
}
.side-item.active {
  background: #eaf2ff;
  color: #1677ff;
  font-weight: 500;
}
.main {
  flex: 1;
  min-width: 0;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 16px;
}
.card {
  background: #ffffff;
  border: 1px solid #e8ecf3;
  border-radius: 12px;
  overflow: hidden;
  transition: box-shadow 0.2s, transform 0.2s;
}
.card:hover {
  box-shadow: 0 8px 22px rgba(16, 24, 40, 0.08);
  transform: translateY(-2px);
}
.thumb {
  height: 116px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  background: linear-gradient(135deg, #f5f8fc 0%, #eaf0f8 100%);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.card-body {
  padding: 12px 14px 10px;
}
.card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.card-title span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge {
  flex-shrink: 0;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
}
.badge.public {
  background: #e8f7f2;
  color: #0f9d76;
}
.badge.private {
  background: #f1f3f7;
  color: #6b7280;
}
.card-type {
  margin: 6px 0 2px;
  font-size: 12.5px;
  color: #1677ff;
}
.card-time {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
}
.card-actions {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f3f8;
  display: flex;
  align-items: center;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: #6b7280;
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
.form-label.inline {
  margin-bottom: 0;
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.form-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.hint {
  font-size: 12px;
  color: #9ca3af;
}
.form-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: #dc2626;
}
</style>
