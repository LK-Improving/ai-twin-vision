<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  type CreateDataSourceRequest,
  type DataSourceItem,
  type DataSourceQuery,
  type DataSourceType,
} from '@dt/shared-types';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BasePagination from '@/components/ui/BasePagination.vue';
import BaseTextarea from '@/components/ui/BaseTextarea.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import SpinnerBox from '@/components/ui/SpinnerBox.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import IconBase from '@/components/ui/IconBase.vue';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import { usePagination } from '@/composables/usePagination';
import {
  createDataSourceApi,
  deleteDataSourceApi,
  getDataSourcesApi,
  testDataSourceApi,
  updateDataSourceApi,
} from '@/services/api/dataSource';
import { formatDateTime } from '@/utils/format';

const toast = useToast();
const { confirm } = useConfirm();
const { page, limit, total, onChangePage, onChangeLimit } = usePagination({ limit: 20 });

const loading = ref(false);
const error = ref<string | null>(null);
const list = ref<DataSourceItem[]>([]);
const filterType = ref('');

const typeOptions: Array<{ label: string; value: DataSourceType }> = [
  { label: 'PostgreSQL', value: 'PG' as DataSourceType },
  { label: 'MySQL', value: 'MYSQL' as DataSourceType },
  { label: 'HTTP 接口', value: 'HTTP' as DataSourceType },
  { label: 'WebSocket', value: 'WEBSOCKET' as DataSourceType },
  { label: 'MQTT', value: 'MQTT' as DataSourceType },
  { label: 'OPC-UA', value: 'OPC_UA' as DataSourceType },
  { label: 'Modbus', value: 'MODBUS' as DataSourceType },
  { label: '静态数据', value: 'STATIC' as DataSourceType },
];

function typeLabel(type: string): string {
  const hit = typeOptions.find((o) => o.value === type);
  return hit ? hit.label : type;
}

/** 各数据源类型的动态配置字段定义 */
interface ConfigField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  multiline?: boolean;
}
const CONFIG_FIELDS: Record<string, ConfigField[]> = {
  PG: [
    { key: 'host', label: '主机地址', placeholder: '127.0.0.1' },
    { key: 'port', label: '端口', placeholder: '5432' },
    { key: 'database', label: '数据库名', placeholder: 'digital_twin' },
    { key: 'username', label: '用户名' },
    { key: 'password', label: '密码', secret: true },
    { key: 'ssl', label: '是否启用 SSL' },
  ],
  MYSQL: [
    { key: 'host', label: '主机地址', placeholder: '127.0.0.1' },
    { key: 'port', label: '端口', placeholder: '3306' },
    { key: 'database', label: '数据库名' },
    { key: 'username', label: '用户名' },
    { key: 'password', label: '密码', secret: true },
  ],
  HTTP: [
    { key: 'url', label: '接口地址', placeholder: 'https://api.example.com/data' },
    { key: 'method', label: '请求方法', placeholder: 'GET' },
    { key: 'headers', label: '请求头（JSON）', multiline: true },
    { key: 'body', label: '请求体（JSON）', multiline: true },
  ],
  WEBSOCKET: [
    { key: 'url', label: 'WS 地址', placeholder: 'wss://...' },
    { key: 'protocol', label: '子协议（可选）' },
  ],
  MQTT: [
    { key: 'broker', label: 'Broker 地址', placeholder: 'mqtt://127.0.0.1:1883' },
    { key: 'username', label: '用户名' },
    { key: 'password', label: '密码', secret: true },
    { key: 'topic', label: '订阅主题', placeholder: 'device/+/telemetry' },
  ],
  'OPC-UA': [
    { key: 'endpoint', label: 'Endpoint', placeholder: 'opc.tcp://127.0.0.1:4840' },
    { key: 'username', label: '用户名' },
    { key: 'password', label: '密码', secret: true },
  ],
  MODBUS: [
    { key: 'host', label: '主机地址' },
    { key: 'port', label: '端口', placeholder: '502' },
    { key: 'slaveId', label: '从站 ID', placeholder: '1' },
  ],
  STATIC: [{ key: 'payload', label: '静态数据（JSON）', multiline: true }],
};

/* ------------------------------ 列表 ------------------------------ */

async function fetchList(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const params: DataSourceQuery = {
      page: page.value,
      limit: limit.value,
      type: filterType.value || undefined,
    };
    const res = await getDataSourcesApi(params);
    list.value = res.dataList;
    total.value = res.total;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载数据源失败';
    list.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

/* ------------------------------ 新建/编辑 ------------------------------ */

const dialogVisible = ref(false);
const saving = ref(false);
const editingId = ref<string | null>(null);
const form = reactive<CreateDataSourceRequest>({
  name: '',
  type: 'PG' as DataSourceType,
  config: {},
});
const configDraft = reactive<Record<string, string>>({});

/** 切换类型时重置配置为新类型的默认键 */
watch(
  () => form.type,
  (type) => {
    const fields = CONFIG_FIELDS[type] ?? [];
    const next: Record<string, string> = {};
    fields.forEach((f) => {
      next[f.key] = '';
    });
    Object.keys(configDraft).forEach((k) => delete configDraft[k]);
    Object.assign(configDraft, next);
  },
);

const currentFields = computed<ConfigField[]>(() => CONFIG_FIELDS[form.type] ?? []);

function openCreate(): void {
  editingId.value = null;
  form.name = '';
  form.type = 'PG' as DataSourceType;
  Object.keys(configDraft).forEach((k) => delete configDraft[k]);
  (CONFIG_FIELDS.PG ?? []).forEach((f) => {
    configDraft[f.key] = '';
  });
  dialogVisible.value = true;
}

function openEdit(item: DataSourceItem): void {
  editingId.value = item.id;
  form.name = item.name;
  form.type = item.type as DataSourceType;
  Object.keys(configDraft).forEach((k) => delete configDraft[k]);
  (CONFIG_FIELDS[item.type] ?? []).forEach((f) => {
    const v = item.config?.[f.key];
    // 敏感字段后端已脱敏，编辑时留空表示不修改
    configDraft[f.key] = v === undefined || v === null ? '' : String(v);
  });
  dialogVisible.value = true;
}

/** 把表单里扁平的 key-value 收敛为 config 对象，兼容 JSON 字段自动解析 */
function buildConfig(): Record<string, unknown> {
  const cfg: Record<string, unknown> = {};
  currentFields.value.forEach((f) => {
    const raw = (configDraft[f.key] ?? '').trim();
    if (!raw) return;
    if (f.multiline) {
      try {
        cfg[f.key] = JSON.parse(raw);
        return;
      } catch {
        cfg[f.key] = raw;
        return;
      }
    }
    cfg[f.key] = raw;
  });
  return cfg;
}

async function submit(): Promise<void> {
  if (!form.name.trim()) {
    toast.warning('请输入数据源名称');
    return;
  }
  saving.value = true;
  try {
    const payload: CreateDataSourceRequest = {
      name: form.name.trim(),
      type: form.type,
      config: buildConfig(),
    };
    if (editingId.value) {
      await updateDataSourceApi(editingId.value, payload);
      toast.success('数据源已更新');
    } else {
      await createDataSourceApi(payload);
      toast.success('数据源已创建');
    }
    dialogVisible.value = false;
    await fetchList();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

/* ------------------------------ 测试连接 / 删除 ------------------------------ */

const testingId = ref<string | null>(null);
const testResults = ref<Record<string, { success: boolean; text: string }>>({});

async function onTest(item: DataSourceItem): Promise<void> {
  testingId.value = item.id;
  try {
    const res = await testDataSourceApi(item.id);
    testResults.value[item.id] = {
      success: res.success,
      text: `${res.success ? '连接成功' : '连接失败'} · ${res.latency ?? 0}ms${res.message ? ` · ${res.message}` : ''}`,
    };
    if (!res.success) toast.error(res.message || '连接失败');
  } catch (e) {
    testResults.value[item.id] = {
      success: false,
      text: e instanceof Error ? e.message : '测试失败',
    };
  } finally {
    testingId.value = null;
    await fetchList();
  }
}

async function onDelete(item: DataSourceItem): Promise<void> {
  const ok = await confirm({
    title: '删除数据源',
    message: `确定删除「${item.name}」吗？引用它的数据映射将失效。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteDataSourceApi(item.id);
    toast.success('数据源已删除');
    await fetchList();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '删除失败');
  }
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
        <h2 class="page-title">数据源</h2>
        <p class="page-desc">接入数据库、HTTP、MQTT、OPC-UA 等数据来源</p>
      </div>
      <BaseButton type="primary" icon="plus" @click="openCreate">新建数据源</BaseButton>
    </header>

    <div class="toolbar">
      <div class="w-44">
        <BaseSelect
          :model-value="filterType"
          :options="[{ label: '全部类型', value: '' }, ...typeOptions]"
          @update:model-value="(v) => { filterType = String(v ?? ''); page = 1; void fetchList(); }"
        />
      </div>
      <div class="flex-1" />
      <BaseButton icon="refresh" @click="void fetchList()">刷新</BaseButton>
    </div>

    <div v-if="loading && list.length === 0" class="state-box">
      <SpinnerBox size="lg" text="正在加载数据源" />
    </div>

    <div v-else-if="error" class="state-box">
      <EmptyState text="加载失败" :description="error" />
      <BaseButton class="mt-3" type="primary" @click="void fetchList()">重试</BaseButton>
    </div>

    <div v-else-if="showEmpty" class="state-box">
      <EmptyState text="暂无数据源" description="新建数据源后，即可在编辑器中为组件绑定实时数据" />
    </div>

    <template v-else>
      <div class="grid">
        <article v-for="item in list" :key="item.id" class="card">
          <div class="card-head">
            <span class="type-icon"><IconBase name="database" :size="17" /></span>
            <div class="head-text">
              <h3 class="card-name" :title="item.name">{{ item.name }}</h3>
              <p class="card-type">{{ typeLabel(item.type) }}</p>
            </div>
            <StatusBadge :type="item.status === 1 ? 'success' : 'default'" :text="item.status === 1 ? '在线' : '离线'" />
          </div>

          <dl class="kv">
            <div v-for="(value, key) in (item.config || {})" :key="key" class="kv-row">
              <dt>{{ key }}</dt>
              <dd>{{ value === null || value === undefined ? '-' : String(value) }}</dd>
            </div>
          </dl>

          <p v-if="testResults[item.id]" class="test-result" :class="testResults[item.id]!.success ? 'ok' : 'fail'">
            {{ testResults[item.id]!.text }}
          </p>

          <div class="card-foot">
            <span class="time">{{ formatDateTime(item.updatedAt) }}</span>
            <div class="ops">
              <BaseButton size="sm" :loading="testingId === item.id" @click="void onTest(item)">测试连接</BaseButton>
              <BaseButton size="sm" icon="edit" @click="openEdit(item)">编辑</BaseButton>
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

    <BaseModal
      :visible="dialogVisible"
      :title="editingId ? '编辑数据源' : '新建数据源'"
      width="560px"
      confirm-text="保存"
      :loading="saving"
      @update:visible="dialogVisible = $event"
      @confirm="void submit()"
    >
      <div class="form-stack">
        <label class="form-item">
          <span class="form-label required">数据源名称</span>
          <BaseInput v-model="form.name" placeholder="例如：园区能耗数据库" :maxlength="50" />
        </label>

        <div class="form-item">
          <span class="form-label">数据源类型</span>
          <BaseSelect v-model="form.type" :options="typeOptions" />
        </div>

        <div class="divider">连接配置</div>

        <template v-for="f in currentFields" :key="f.key">
          <label class="form-item">
            <span class="form-label">{{ f.label }}</span>
            <BaseTextarea
              v-if="f.multiline"
              :model-value="configDraft[f.key] ?? ''"
              :rows="3"
              :placeholder="f.placeholder"
              @update:model-value="configDraft[f.key] = $event"
            />
            <BaseInput
              v-else
              :model-value="configDraft[f.key] ?? ''"
              :type="f.secret ? 'password' : 'text'"
              :placeholder="f.placeholder"
              @update:model-value="configDraft[f.key] = $event"
            />
          </label>
        </template>
        <p class="hint">密码等敏感字段保存后不再回显，留空表示保持原值不变。</p>
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
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 18px 0;
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
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}
.card {
  background: #ffffff;
  border: 1px solid #e8ecf3;
  border-radius: 12px;
  padding: 16px 18px 14px;
  transition: box-shadow 0.2s;
}
.card:hover {
  box-shadow: 0 8px 22px rgba(16, 24, 40, 0.07);
}
.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.type-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: #eaf2ff;
  color: #1677ff;
}
.head-text {
  flex: 1;
  min-width: 0;
}
.card-name {
  margin: 0;
  font-size: 14.5px;
  font-weight: 600;
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-type {
  margin: 2px 0 0;
  font-size: 12px;
  color: #6b7280;
}
.kv {
  margin: 14px 0 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 108px;
  overflow: auto;
}
.kv-row {
  display: flex;
  gap: 10px;
  font-size: 12.5px;
}
.kv-row dt {
  width: 86px;
  flex-shrink: 0;
  color: #9ca3af;
}
.kv-row dd {
  margin: 0;
  color: #4b5563;
  word-break: break-all;
}
.test-result {
  margin: 10px 0 0;
  font-size: 12.5px;
  padding: 6px 10px;
  border-radius: 6px;
}
.test-result.ok {
  background: #e8f7f2;
  color: #0f9d76;
}
.test-result.fail {
  background: #fef2f2;
  color: #dc2626;
}
.card-foot {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #f0f3f8;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.time {
  font-size: 12px;
  color: #9ca3af;
}
.ops {
  display: flex;
  align-items: center;
  gap: 6px;
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
  gap: 14px;
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
.divider {
  font-size: 12px;
  color: #9ca3af;
  border-top: 1px solid #f0f3f8;
  padding-top: 12px;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
}
</style>
