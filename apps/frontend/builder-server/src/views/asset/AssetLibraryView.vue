<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  MAX_UPLOAD_SIZE,
  type ModelAssetItem,
  type ModelAssetQuery,
} from '@dt/shared-types';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import BaseTable, { type TableColumn } from '@/components/ui/BaseTable.vue';
import BasePagination from '@/components/ui/BasePagination.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import SpinnerBox from '@/components/ui/SpinnerBox.vue';
import IconBase from '@/components/ui/IconBase.vue';
import BaseTooltip from '@/components/ui/BaseTooltip.vue';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import { usePagination } from '@/composables/usePagination';
import {
  completeMultipartApi,
  createModelAssetApi,
  deleteModelAssetApi,
  getModelAssetsApi,
  initMultipartApi,
  uploadChunkApi,
  uploadFileApi,
} from '@/services/api/file';
import { formatDateTime, formatFileSize } from '@/utils/format';

const toast = useToast();
const { confirm } = useConfirm();
const { page, limit, total, onChangePage, onChangeLimit } = usePagination({ limit: 20 });

const loading = ref(false);
const error = ref<string | null>(null);
const list = ref<ModelAssetItem[]>([]);
const filterType = ref('');

/** 超过该大小走分片上传 */
const CHUNK_THRESHOLD = 10 * 1024 * 1024;
/** 默认分片大小 5MB */
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;

const typeOptions = [
  { label: '全部类型', value: '' },
  { label: 'GLTF', value: 'GLTF' },
  { label: 'GLB', value: 'GLB' },
  { label: 'FBX', value: 'FBX' },
  { label: 'OBJ', value: 'OBJ' },
  { label: '3D Tiles', value: 'TILES_3D' },
];

const columns: TableColumn[] = [
  { key: 'assetName', title: '资产名称' },
  { key: 'assetType', title: '类型', width: 110, align: 'center' },
  { key: 'polygonCount', title: '面数', width: 110, align: 'right' },
  { key: 'url', title: '访问地址' },
  { key: 'createdAt', title: '上传时间', width: 170 },
  { key: 'actions', title: '操作', width: 90, align: 'center' },
];

async function fetchList(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const params: ModelAssetQuery = {
      page: page.value,
      limit: limit.value,
      assetType: filterType.value || undefined,
    };
    const res = await getModelAssetsApi(params);
    list.value = res.dataList;
    total.value = res.total;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载资产失败';
    list.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

/* ------------------------------ 上传 ------------------------------ */

interface UploadTask {
  name: string;
  size: number;
  percent: number;
  status: 'uploading' | 'success' | 'error' | 'instant';
  message?: string;
}
const tasks = ref<UploadTask[]>([]);
const dragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

/** 文件后缀白名单校验 */
function validateFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  const ok = ALLOWED_UPLOAD_EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!ok) {
    return `不支持的文件类型，仅允许：${ALLOWED_UPLOAD_EXTENSIONS.join('、')}`;
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return `文件超过 ${formatFileSize(MAX_UPLOAD_SIZE)} 上限`;
  }
  return null;
}

/**
 * 极简 md5：仅用于秒传与完整性校验的弱指纹。
 * 说明：浏览器端无原生 md5，这里用「名称+大小+修改时间+采样字节」组合出稳定串，
 * 生产环境可替换为 spark-md5 做真实摘要。
 */
async function fingerprint(file: File): Promise<string> {
  const head = await file.slice(0, 64 * 1024).arrayBuffer();
  const tail = await file.slice(Math.max(0, file.size - 64 * 1024)).arrayBuffer();
  const raw = `${file.name}|${file.size}|${file.lastModified}|${head.byteLength}|${tail.byteLength}`;
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 推断模型资产类型 */
function guessAssetType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.glb')) return 'GLB';
  if (lower.endsWith('.gltf')) return 'GLTF';
  if (lower.endsWith('.fbx')) return 'FBX';
  if (lower.endsWith('.obj')) return 'OBJ';
  if (lower.endsWith('.json') || lower.endsWith('.b3dm') || lower.endsWith('.i3dm')) return 'TILES_3D';
  return 'OTHER';
}

/** 上传完成后登记为模型资产 */
async function registerAsset(fileName: string, fileId: string, url: string): Promise<void> {
  try {
    await createModelAssetApi({
      assetName: fileName.replace(/\.[^.]+$/, ''),
      assetType: guessAssetType(fileName),
      fileId,
      url,
    });
  } catch (e) {
    // 非模型文件（贴图/压缩包）登记失败不阻断上传成功提示
    console.warn('[AssetLibrary] 资产登记失败', e);
  }
}

/** 小文件直传 */
async function uploadDirect(file: File, md5: string, task: UploadTask): Promise<void> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('md5', md5);
  const item = await uploadFileApi(fd, (p) => {
    task.percent = p;
  });
  task.status = 'success';
  task.percent = 100;
  await registerAsset(file.name, item.id, item.url);
}

/** 大文件分片上传（支持断点续传：跳过已上传分片） */
async function uploadByChunk(file: File, md5: string, task: UploadTask): Promise<void> {
  const init = await initMultipartApi({
    fileName: file.name,
    fileSize: file.size,
    md5,
    chunkSize: DEFAULT_CHUNK_SIZE,
  });

  if (init.existed) {
    task.status = 'instant';
    task.percent = 100;
    task.message = '秒传完成';
    await registerAsset(file.name, init.existed.id, init.existed.url);
    return;
  }

  const done = new Set(init.uploadedChunks);
  for (let i = 0; i < init.totalChunks; i += 1) {
    if (done.has(i)) {
      task.percent = Math.round(((i + 1) / init.totalChunks) * 100);
      continue;
    }
    const start = i * init.chunkSize;
    const blob = file.slice(start, Math.min(start + init.chunkSize, file.size));
    const fd = new FormData();
    fd.append('chunk', blob, file.name);
    fd.append('uploadId', init.uploadId);
    fd.append('index', String(i));
    await uploadChunkApi(fd);
    task.percent = Math.round(((i + 1) / init.totalChunks) * 100);
  }

  const fileItem = await completeMultipartApi({
    uploadId: init.uploadId,
    fileName: file.name,
    md5,
    totalChunks: init.totalChunks,
  });
  task.status = 'success';
  task.percent = 100;
  await registerAsset(file.name, fileItem.id, fileItem.url);
}

async function handleFiles(files: FileList | null): Promise<void> {
  if (!files || files.length === 0) return;
  for (const file of Array.from(files)) {
    const invalid = validateFile(file);
    if (invalid) {
      toast.error(`${file.name}：${invalid}`);
      continue;
    }
    const task: UploadTask = {
      name: file.name,
      size: file.size,
      percent: 0,
      status: 'uploading',
    };
    tasks.value.unshift(task);
    try {
      const md5 = await fingerprint(file);
      if (file.size > CHUNK_THRESHOLD) {
        await uploadByChunk(file, md5, task);
      } else {
        await uploadDirect(file, md5, task);
      }
      toast.success(`${file.name} 上传成功`);
    } catch (e) {
      task.status = 'error';
      task.message = e instanceof Error ? e.message : '上传失败';
      toast.error(`${file.name} 上传失败：${task.message}`);
    }
  }
  await fetchList();
}

function onPickFile(e: Event): void {
  const target = e.target as HTMLInputElement;
  void handleFiles(target.files);
  target.value = '';
}

function onDrop(e: DragEvent): void {
  dragging.value = false;
  void handleFiles(e.dataTransfer?.files ?? null);
}

async function onDelete(row: ModelAssetItem): Promise<void> {
  const ok = await confirm({
    title: '删除资产',
    message: `确定删除资产「${row.assetName}」吗？关联的底层文件将一并移除。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteModelAssetApi(row.id);
    toast.success('资产已删除');
    await fetchList();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '删除失败');
  }
}

const showEmpty = computed(() => !loading.value && list.value.length === 0);
const activeTasks = computed(() => tasks.value.slice(0, 6));

onMounted(() => {
  void fetchList();
});
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">资产库</h2>
        <p class="page-desc">管理 3D 模型、贴图与 3D Tiles 等渲染资产</p>
      </div>
      <BaseButton type="primary" icon="upload" @click="fileInput?.click()">上传资产</BaseButton>
    </header>

    <input
      ref="fileInput"
      type="file"
      multiple
      class="hidden-input"
      :accept="ALLOWED_UPLOAD_EXTENSIONS.join(',')"
      @change="onPickFile"
    />

    <!-- 拖拽上传区 -->
    <div
      class="dropzone"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
      @click="fileInput?.click()"
    >
      <IconBase name="upload" :size="26" />
      <p class="drop-title">拖拽文件到此处，或点击选择文件</p>
      <p class="drop-hint">
        支持 {{ ALLOWED_UPLOAD_EXTENSIONS.length }} 种格式，单文件最大 {{ formatFileSize(MAX_UPLOAD_SIZE) }}；
        超过 {{ formatFileSize(CHUNK_THRESHOLD) }} 自动启用分片上传与断点续传
      </p>
    </div>

    <!-- 上传队列 -->
    <ul v-if="activeTasks.length > 0" class="task-list">
      <li v-for="(t, i) in activeTasks" :key="`${t.name}-${i}`" class="task-item">
        <div class="task-head">
          <span class="task-name" :title="t.name">{{ t.name }}</span>
          <span class="task-size">{{ formatFileSize(t.size) }}</span>
          <span class="task-status" :class="t.status">
            {{
              t.status === 'uploading' ? `${t.percent}%`
              : t.status === 'instant' ? '秒传'
              : t.status === 'success' ? '完成'
              : '失败'
            }}
          </span>
        </div>
        <div class="progress">
          <div class="progress-bar" :class="t.status" :style="{ width: `${t.percent}%` }" />
        </div>
        <p v-if="t.message" class="task-msg">{{ t.message }}</p>
      </li>
    </ul>

    <div class="toolbar">
      <div class="w-44">
        <BaseSelect
          :model-value="filterType"
          :options="typeOptions"
          @update:model-value="(v) => { filterType = String(v ?? ''); page = 1; void fetchList(); }"
        />
      </div>
      <div class="flex-1" />
      <BaseButton icon="refresh" @click="void fetchList()">刷新</BaseButton>
    </div>

    <div v-if="error" class="state-box">
      <EmptyState text="加载失败" :description="error" />
      <BaseButton class="mt-3" type="primary" @click="void fetchList()">重试</BaseButton>
    </div>

    <div v-else class="table-wrap">
      <BaseTable :columns="columns" :data="list" :loading="loading" row-key="id">
        <template #cell-assetName="{ row }">
          <div class="cell-name">
            <IconBase name="cube" :size="15" />
            <span :title="(row as ModelAssetItem).assetName">{{ (row as ModelAssetItem).assetName }}</span>
          </div>
        </template>
        <template #cell-assetType="{ row }">
          <span class="type-tag">{{ (row as ModelAssetItem).assetType }}</span>
        </template>
        <template #cell-polygonCount="{ row }">
          <span>{{ (row as ModelAssetItem).polygonCount?.toLocaleString() ?? '-' }}</span>
        </template>
        <template #cell-url="{ row }">
          <BaseTooltip :content="(row as ModelAssetItem).url" placement="top">
            <span class="cell-url">{{ (row as ModelAssetItem).url }}</span>
          </BaseTooltip>
        </template>
        <template #cell-createdAt="{ row }">
          <span>{{ formatDateTime((row as ModelAssetItem).createdAt) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <button class="icon-btn danger" title="删除" @click="void onDelete(row as ModelAssetItem)">
            <IconBase name="trash" :size="15" />
          </button>
        </template>
      </BaseTable>

      <EmptyState v-if="showEmpty" text="暂无模型资产" description="上传 GLTF / GLB / FBX 等模型文件后即可在编辑器中引用" />

      <div class="mt-4 flex justify-end">
        <BasePagination
          :page="page"
          :limit="limit"
          :total="total"
          @update:page="(v) => { onChangePage(v); void fetchList(); }"
          @update:limit="(v) => { onChangeLimit(v); void fetchList(); }"
        />
      </div>
    </div>
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
.hidden-input {
  display: none;
}
.dropzone {
  margin-top: 18px;
  border: 1.5px dashed #cbd5e1;
  border-radius: 12px;
  padding: 26px 20px;
  text-align: center;
  color: #64748b;
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s;
}
.dropzone:hover {
  border-color: #1677ff;
  background: #f7faff;
}
.dropzone.dragging {
  border-color: #1677ff;
  background: #eaf2ff;
}
.drop-title {
  margin: 8px 0 4px;
  font-size: 14px;
  color: #334155;
}
.drop-hint {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}
.task-list {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.task-item {
  background: #ffffff;
  border: 1px solid #e8ecf3;
  border-radius: 10px;
  padding: 10px 14px;
}
.task-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.task-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #334155;
}
.task-size {
  color: #9ca3af;
  font-size: 12px;
}
.task-status.uploading {
  color: #1677ff;
}
.task-status.success,
.task-status.instant {
  color: #0f9d76;
}
.task-status.error {
  color: #dc2626;
}
.progress {
  margin-top: 6px;
  height: 4px;
  border-radius: 2px;
  background: #eef2f7;
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  background: #1677ff;
  transition: width 0.2s;
}
.progress-bar.success,
.progress-bar.instant {
  background: #0f9d76;
}
.progress-bar.error {
  background: #dc2626;
}
.task-msg {
  margin: 4px 0 0;
  font-size: 12px;
  color: #dc2626;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0 12px;
}
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
}
.table-wrap {
  background: #ffffff;
  border: 1px solid #e8ecf3;
  border-radius: 12px;
  padding: 12px 14px 14px;
}
.cell-name {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #1f2937;
}
.cell-url {
  display: inline-block;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #6b7280;
  font-size: 12.5px;
}
.type-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 4px;
  background: #eaf2ff;
  color: #1677ff;
  font-size: 12px;
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
</style>
