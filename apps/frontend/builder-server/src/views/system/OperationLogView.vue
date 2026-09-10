<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { OperationLogItem, OperationLogQuery } from '@dt/shared-types';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import BaseTable, { type TableColumn } from '@/components/ui/BaseTable.vue';
import BasePagination from '@/components/ui/BasePagination.vue';
import BaseDrawer from '@/components/ui/BaseDrawer.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import IconBase from '@/components/ui/IconBase.vue';
import { useToast } from '@/composables/useToast';
import { usePagination } from '@/composables/usePagination';
import { getOperationLogsApi } from '@/services/api/system';
import { formatDateTime } from '@/utils/format';

const toast = useToast();
const { page, limit, total, onChangePage, onChangeLimit } = usePagination({ limit: 20 });

const loading = ref(false);
const error = ref<string | null>(null);
const list = ref<OperationLogItem[]>([]);

const moduleOptions = [
  { label: '全部模块', value: '' },
  { label: '场景', value: 'SCENE' },
  { label: '组件', value: 'COMPONENT' },
  { label: '数据源', value: 'DATA_SOURCE' },
  { label: '设备', value: 'DEVICE' },
  { label: '用户', value: 'USER' },
  { label: '角色', value: 'ROLE' },
  { label: '文件', value: 'FILE' },
  { label: '认证', value: 'AUTH' },
];
const filterModule = ref('');
const startTime = ref('');
const endTime = ref('');

const columns: TableColumn[] = [
  { key: 'username', title: '操作人', width: 130 },
  { key: 'module', title: '模块', width: 110, align: 'center' },
  { key: 'action', title: '操作' },
  { key: 'requestUrl', title: '请求地址' },
  { key: 'responseStatus', title: '状态', width: 90, align: 'center' },
  { key: 'responseTime', title: '耗时', width: 90, align: 'right' },
  { key: 'ipAddress', title: 'IP', width: 140 },
  { key: 'createdAt', title: '时间', width: 170 },
  { key: 'detail', title: '', width: 60, align: 'center' },
];

async function fetchList(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const params: OperationLogQuery = {
      page: page.value,
      limit: limit.value,
      module: filterModule.value || undefined,
      // 前端 date 控件给出的是本地日期，补上时分秒让后端可按范围比较
      startTime: startTime.value ? `${startTime.value}T00:00:00` : undefined,
      endTime: endTime.value ? `${endTime.value}T23:59:59` : undefined,
    };
    const res = await getOperationLogsApi(params);
    list.value = res.dataList;
    total.value = res.total;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载日志失败';
    list.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function resetFilter(): void {
  filterModule.value = '';
  startTime.value = '';
  endTime.value = '';
  page.value = 1;
  void fetchList();
}

/* ------------------------------ 详情抽屉 ------------------------------ */

const drawerVisible = ref(false);
const current = ref<OperationLogItem | null>(null);

function openDetail(row: OperationLogItem): void {
  current.value = row;
  drawerVisible.value = true;
}

async function copyJson(): Promise<void> {
  if (!current.value) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(current.value.requestParams, null, 2));
    toast.success('已复制请求参数');
  } catch {
    toast.error('复制失败，请手动选择文本');
  }
}

function statusType(code: number): 'success' | 'warning' | 'danger' {
  if (code >= 500) return 'danger';
  if (code >= 400) return 'warning';
  return 'success';
}

const showEmpty = computed(() => !loading.value && list.value.length === 0);

onMounted(() => {
  void fetchList();
});
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">操作日志</h2>
        <p class="page-desc">审计平台内的关键操作记录与接口调用情况</p>
      </div>
    </header>

    <div class="toolbar">
      <div class="w-40">
        <BaseSelect
          :model-value="filterModule"
          :options="moduleOptions"
          @update:model-value="(v) => { filterModule = String(v ?? ''); page = 1; void fetchList(); }"
        />
      </div>
      <div class="range">
        <input v-model="startTime" type="date" class="date-input" />
        <span class="range-sep">至</span>
        <input v-model="endTime" type="date" class="date-input" />
      </div>
      <BaseButton type="primary" icon="search" @click="() => { page = 1; void fetchList(); }">查询</BaseButton>
      <BaseButton @click="resetFilter">重置</BaseButton>
      <div class="flex-1" />
      <BaseButton icon="refresh" @click="void fetchList()">刷新</BaseButton>
    </div>

    <div v-if="error" class="state-box">
      <EmptyState text="加载失败" :description="error" />
      <BaseButton class="mt-3" type="primary" @click="void fetchList()">重试</BaseButton>
    </div>

    <div v-else class="table-wrap">
      <BaseTable :columns="columns" :data="list" :loading="loading" row-key="id">
        <template #cell-username="{ row }">
          <div class="cell-name">
            <IconBase name="user" :size="14" />
            <span>{{ (row as OperationLogItem).username }}</span>
          </div>
        </template>
        <template #cell-module="{ row }">
          <span class="module-tag">{{ (row as OperationLogItem).module }}</span>
        </template>
        <template #cell-requestUrl="{ row }">
          <span class="url">{{ (row as OperationLogItem).requestUrl }}</span>
        </template>
        <template #cell-responseStatus="{ row }">
          <StatusBadge
            :type="statusType((row as OperationLogItem).responseStatus)"
            :text="String((row as OperationLogItem).responseStatus)"
            :dot="false"
          />
        </template>
        <template #cell-responseTime="{ row }">
          <span :class="{ slow: (row as OperationLogItem).responseTime > 1000 }">
            {{ (row as OperationLogItem).responseTime }}ms
          </span>
        </template>
        <template #cell-ipAddress="{ row }">
          <span class="code">{{ (row as OperationLogItem).ipAddress }}</span>
        </template>
        <template #cell-createdAt="{ row }">
          <span>{{ formatDateTime((row as OperationLogItem).createdAt) }}</span>
        </template>
        <template #cell-detail="{ row }">
          <button class="icon-btn" title="查看详情" @click="openDetail(row as OperationLogItem)">
            <IconBase name="eye" :size="15" />
          </button>
        </template>
      </BaseTable>

      <EmptyState v-if="showEmpty" text="暂无日志记录" description="调整筛选条件后再试" />

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

    <BaseDrawer :visible="drawerVisible" title="日志详情" width="520px" @update:visible="drawerVisible = $event">
      <dl v-if="current" class="detail">
        <div class="detail-row">
          <dt>操作人</dt>
          <dd>{{ current.username }}</dd>
        </div>
        <div class="detail-row">
          <dt>模块 / 操作</dt>
          <dd>{{ current.module }} · {{ current.action }}</dd>
        </div>
        <div class="detail-row">
          <dt>请求方法</dt>
          <dd>{{ current.requestMethod }}</dd>
        </div>
        <div class="detail-row">
          <dt>请求地址</dt>
          <dd class="wrap">{{ current.requestUrl }}</dd>
        </div>
        <div class="detail-row">
          <dt>响应状态</dt>
          <dd>{{ current.responseStatus }}（{{ current.responseTime }}ms）</dd>
        </div>
        <div class="detail-row">
          <dt>IP 地址</dt>
          <dd>{{ current.ipAddress }}</dd>
        </div>
        <div class="detail-row">
          <dt>时间</dt>
          <dd>{{ formatDateTime(current.createdAt) }}</dd>
        </div>
        <div class="detail-row">
          <dt>User-Agent</dt>
          <dd class="wrap">{{ current.userAgent || '-' }}</dd>
        </div>
        <div class="detail-block">
          <div class="block-head">
            <span>请求参数</span>
            <BaseButton size="sm" type="text" icon="copy" @click="void copyJson()">复制</BaseButton>
          </div>
          <pre class="json">{{ JSON.stringify(current.requestParams ?? {}, null, 2) }}</pre>
        </div>
      </dl>
    </BaseDrawer>
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
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 18px 0 12px;
  flex-wrap: wrap;
}
.range {
  display: flex;
  align-items: center;
  gap: 8px;
}
.date-input {
  height: 36px;
  padding: 0 10px;
  border: 1px solid #dfe4ec;
  border-radius: 8px;
  font-size: 13px;
  color: #374151;
  background: #ffffff;
}
.date-input:focus {
  outline: none;
  border-color: #1677ff;
}
.range-sep {
  font-size: 13px;
  color: #9ca3af;
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
  gap: 6px;
  color: #1f2937;
}
.module-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 4px;
  background: #f1f3f7;
  color: #6b7280;
  font-size: 12px;
}
.url {
  display: inline-block;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #6b7280;
  font-size: 12.5px;
}
.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  color: #4b5563;
}
.slow {
  color: #d97706;
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
.icon-btn:hover {
  background: #f2f5fa;
  color: #1677ff;
}
.detail {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.detail-row {
  display: flex;
  gap: 12px;
  font-size: 13px;
}
.detail-row dt {
  width: 92px;
  flex-shrink: 0;
  color: #9ca3af;
}
.detail-row dd {
  margin: 0;
  color: #374151;
  word-break: break-all;
}
.detail-row dd.wrap {
  flex: 1;
}
.detail-block {
  margin-top: 4px;
}
.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #9ca3af;
  margin-bottom: 6px;
}
.json {
  margin: 0;
  padding: 10px 12px;
  background: #f7f9fc;
  border: 1px solid #eef2f7;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: #374151;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
