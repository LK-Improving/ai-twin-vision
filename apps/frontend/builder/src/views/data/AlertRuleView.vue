<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  AlertLevel,
  type AlertRuleItem,
  type CreateAlertRuleRequest,
  type UpdateAlertRuleRequest,
} from '@dt/shared-types';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseTable, { type TableColumn } from '@/components/ui/BaseTable.vue';
import BaseSwitch from '@/components/ui/BaseSwitch.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import IconBase from '@/components/ui/IconBase.vue';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import {
  createAlertRuleApi,
  deleteAlertRuleApi,
  getAlertRulesApi,
  getDevicePropertiesApi,
  updateAlertRuleApi,
  type DevicePropertyItem,
} from '@/services/api/alert-rule';
import { getDevicesApi } from '@/services/api/device';
import type { DeviceItem } from '@dt/shared-types';
import { formatDateTime } from '@/utils/format';

const toast = useToast();
const { confirm } = useConfirm();

const loading = ref(false);
const error = ref<string | null>(null);
const list = ref<AlertRuleItem[]>([]);

/* 设备与属性下拉 */
const devices = ref<DeviceItem[]>([]);
const properties = ref<DevicePropertyItem[]>([]);
const propertyLoading = ref(false);

const operatorOptions: Array<{ label: string; value: AlertRuleItem['condition']['operator'] }> = [
  { label: '大于 (>)', value: '>' },
  { label: '大于等于 (>=)', value: '>=' },
  { label: '小于 (<)', value: '<' },
  { label: '小于等于 (<=)', value: '<=' },
  { label: '等于 (==)', value: '==' },
  { label: '不等于 (!=)', value: '!=' },
  { label: '区间之内 (between)', value: 'between' },
  { label: '区间之外 (outside)', value: 'outside' },
];

const levelOptions: Array<{ label: string; value: AlertLevel }> = [
  { label: '提示', value: AlertLevel.INFO },
  { label: '警告', value: AlertLevel.WARNING },
  { label: '严重', value: AlertLevel.MAJOR },
  { label: '紧急', value: AlertLevel.CRITICAL },
];

const columns: TableColumn[] = [
  { key: 'ruleName', title: '规则名称', width: 180 },
  { key: 'device', title: '设备', width: 170 },
  { key: 'propertyCode', title: '属性', width: 120 },
  { key: 'condition', title: '触发条件', width: 160 },
  { key: 'alertLevel', title: '级别', width: 90, align: 'center' },
  { key: 'enabled', title: '启用', width: 80, align: 'center' },
  { key: 'updatedAt', title: '更新时间', width: 170 },
  { key: 'actions', title: '操作', width: 110, align: 'center' },
];

function isRangeOp(op: string): boolean {
  return op === 'between' || op === 'outside';
}

function deviceLabel(d: DeviceItem | undefined): string {
  if (!d) return '—';
  return d.deviceName ? `${d.deviceName}（${d.deviceCode}）` : d.deviceCode;
}

function formatCondition(rule: AlertRuleItem): string {
  const c = rule.condition;
  if (isRangeOp(c.operator)) {
    return `${c.operator} [${c.min ?? '?'} ~ ${c.max ?? '?'}]`;
  }
  const t = rule.threshold ?? c.value;
  return `${c.operator} ${t ?? '—'}`;
}

const levelMeta: Record<number, { label: string; color: string; bg: string }> = {
  [AlertLevel.INFO]: { label: '提示', color: '#3b6fd4', bg: '#eef4ff' },
  [AlertLevel.WARNING]: { label: '警告', color: '#d48806', bg: '#fff7e6' },
  [AlertLevel.MAJOR]: { label: '严重', color: '#cf1322', bg: '#fff1f0' },
  [AlertLevel.CRITICAL]: { label: '紧急', color: '#a8071a', bg: '#fff1f0' },
};

function levelOf(v: number): { label: string; color: string; bg: string } {
  return levelMeta[v] ?? { label: `L${v}`, color: '#6b7280', bg: '#f3f4f6' };
}

/* ---------------- 加载 ---------------- */

async function fetchDevices(): Promise<void> {
  try {
    const res = await getDevicesApi({ page: 1, limit: 200 });
    devices.value = res.dataList;
  } catch {
    devices.value = [];
  }
}

async function fetchList(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    list.value = await getAlertRulesApi();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载告警规则失败';
    list.value = [];
  } finally {
    loading.value = false;
  }
}

const showEmpty = computed(() => !loading.value && list.value.length === 0);

/* ---------------- 弹窗（新建 / 编辑） ---------------- */

const dialogVisible = ref(false);
const saving = ref(false);
const isEdit = ref(false);

const form = reactive({
  id: '',
  deviceId: '',
  propertyCode: '',
  ruleName: '',
  operator: '>' as AlertRuleItem['condition']['operator'],
  threshold: null as number | null,
  min: null as number | null,
  max: null as number | null,
  alertLevel: AlertLevel.WARNING,
  enabled: true,
});

const rangeMode = computed(() => isRangeOp(form.operator));

// 切换设备时重新拉属性，并清空已选属性
watch(
  () => form.deviceId,
  async (id) => {
    form.propertyCode = '';
    properties.value = [];
    if (!id) return;
    propertyLoading.value = true;
    try {
      properties.value = await getDevicePropertiesApi(id);
    } catch {
      properties.value = [];
    } finally {
      propertyLoading.value = false;
    }
  },
);

function resetForm(): void {
  form.id = '';
  form.deviceId = '';
  form.propertyCode = '';
  form.ruleName = '';
  form.operator = '>';
  form.threshold = null;
  form.min = null;
  form.max = null;
  form.alertLevel = AlertLevel.WARNING;
  form.enabled = true;
  properties.value = [];
}

function openCreate(): void {
  isEdit.value = false;
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row: AlertRuleItem): void {
  isEdit.value = true;
  form.id = row.id;
  form.deviceId = row.deviceId ?? '';
  form.propertyCode = row.propertyCode;
  form.ruleName = row.ruleName;
  form.operator = row.condition.operator;
  form.threshold = row.threshold ?? row.condition.value ?? null;
  form.min = row.condition.min ?? null;
  form.max = row.condition.max ?? null;
  form.alertLevel = (row.alertLevel as AlertLevel) ?? AlertLevel.WARNING;
  form.enabled = row.enabled;
  // 编辑时先按已绑设备预载属性，再回填 propertyCode
  if (form.deviceId) {
    getDevicePropertiesApi(form.deviceId)
      .then((ps) => {
        properties.value = ps;
      })
      .catch(() => {
        properties.value = [];
      });
  }
  dialogVisible.value = true;
}

function buildCondition() {
  if (rangeMode.value) {
    return { operator: form.operator, min: form.min ?? 0, max: form.max ?? 0 };
  }
  return { operator: form.operator, value: form.threshold ?? 0 };
}

async function submit(): Promise<void> {
  if (!form.deviceId) {
    toast.warning('请选择设备');
    return;
  }
  if (!form.propertyCode) {
    toast.warning('请选择监测属性');
    return;
  }
  if (rangeMode.value) {
    if (form.min === null || form.max === null || form.min >= form.max) {
      toast.warning('请填写正确的区间（min < max）');
      return;
    }
  } else if (form.threshold === null) {
    toast.warning('请填写阈值');
    return;
  }

  const condition = buildCondition();
  const threshold = rangeMode.value ? null : form.threshold;

  saving.value = true;
  try {
    if (isEdit.value) {
      const dto: UpdateAlertRuleRequest = {
        deviceId: form.deviceId,
        propertyCode: form.propertyCode,
        ruleName: form.ruleName,
        condition,
        threshold,
        alertLevel: form.alertLevel,
        enabled: form.enabled,
      };
      await updateAlertRuleApi(form.id, dto);
      toast.success('规则已更新');
    } else {
      const dto: CreateAlertRuleRequest = {
        deviceId: form.deviceId,
        propertyCode: form.propertyCode,
        ruleName: form.ruleName,
        condition,
        threshold: threshold ?? undefined,
        alertLevel: form.alertLevel,
        notifyChannel: { websocket: true },
        enabled: form.enabled,
      };
      await createAlertRuleApi(dto);
      toast.success('规则已创建');
    }
    dialogVisible.value = false;
    await fetchList();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function onDelete(row: AlertRuleItem): Promise<void> {
  const ok = await confirm({
    title: '删除告警规则',
    message: `确定删除规则「${row.ruleName}」吗？删除后该规则不再触发告警。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteAlertRuleApi(row.id);
    toast.success('规则已删除');
    await fetchList();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '删除失败');
  }
}

async function onToggle(row: AlertRuleItem, val: boolean): Promise<void> {
  try {
    await updateAlertRuleApi(row.id, { enabled: val });
    row.enabled = val;
    toast.success(val ? '已启用' : '已停用');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '状态更新失败');
  }
}

onMounted(() => {
  void fetchDevices();
  void fetchList();
});
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">告警规则</h2>
        <p class="page-desc">为设备遥测属性配置阈值，越限即触发告警并在大屏高亮</p>
      </div>
      <BaseButton type="primary" icon="plus" @click="openCreate">新建规则</BaseButton>
    </header>

    <div class="toolbar">
      <div class="flex-1" />
      <BaseButton icon="refresh" @click="void fetchList()">刷新</BaseButton>
    </div>

    <div v-if="error" class="state-box">
      <EmptyState text="加载失败" :description="error" />
      <BaseButton class="mt-3" type="primary" @click="void fetchList()">重试</BaseButton>
    </div>

    <div v-else class="table-wrap">
      <BaseTable :columns="columns" :data="list" :loading="loading" row-key="id">
        <template #cell-ruleName="{ row }">
          <span class="cell-name">{{ (row as AlertRuleItem).ruleName }}</span>
        </template>
        <template #cell-device="{ row }">
          <span class="code">
            {{ deviceLabel(devices.find((d) => d.id === (row as AlertRuleItem).deviceId)) }}
          </span>
        </template>
        <template #cell-propertyCode="{ row }">
          <span class="code">{{ (row as AlertRuleItem).propertyCode }}</span>
        </template>
        <template #cell-condition="{ row }">
          <span class="cond">{{ formatCondition(row as AlertRuleItem) }}</span>
        </template>
        <template #cell-alertLevel="{ row }">
          <span
            class="lvl-badge"
            :style="{
              color: levelOf((row as AlertRuleItem).alertLevel as number).color,
              background: levelOf((row as AlertRuleItem).alertLevel as number).bg,
            }"
          >
            {{ levelOf((row as AlertRuleItem).alertLevel as number).label }}
          </span>
        </template>
        <template #cell-enabled="{ row }">
          <BaseSwitch
            :model-value="(row as AlertRuleItem).enabled"
            @update:model-value="(v) => void onToggle(row as AlertRuleItem, Boolean(v))"
          />
        </template>
        <template #cell-updatedAt="{ row }">
          <span>{{ formatDateTime((row as AlertRuleItem).updatedAt) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <div class="row-actions">
            <button class="icon-btn" @click="openEdit(row as AlertRuleItem)">
              <IconBase name="edit" :size="15" />
            </button>
            <button class="icon-btn danger" @click="void onDelete(row as AlertRuleItem)">
              <IconBase name="trash" :size="15" />
            </button>
          </div>
        </template>
      </BaseTable>

      <EmptyState
        v-if="showEmpty"
        text="暂无告警规则"
        description="新建规则后将自动监控设备遥测，越限实时告警"
      />
    </div>

    <BaseModal
      :visible="dialogVisible"
      :title="isEdit ? '编辑告警规则' : '新建告警规则'"
      width="560px"
      confirm-text="确定"
      :loading="saving"
      @update:visible="dialogVisible = $event"
      @confirm="void submit()"
    >
      <div class="form-stack">
        <div class="grid-2">
          <label class="form-item">
            <span class="form-label required">设备</span>
            <BaseSelect
              v-model="form.deviceId"
              :options="devices.map((d) => ({ label: deviceLabel(d), value: d.id }))"
              placeholder="选择设备"
            />
          </label>
          <label class="form-item">
            <span class="form-label required">监测属性</span>
            <BaseSelect
              v-model="form.propertyCode"
              :options="
                properties.map((p) => ({
                  label: `${p.propertyName}（${p.propertyCode}）`,
                  value: p.propertyCode,
                }))
              "
              :disabled="!form.deviceId"
              :loading="propertyLoading"
              placeholder="选择属性"
            />
          </label>
        </div>

        <label class="form-item">
          <span class="form-label required">规则名称</span>
          <BaseInput v-model="form.ruleName" placeholder="例如：变压器温度过高告警" />
        </label>

        <div class="grid-2">
          <label class="form-item">
            <span class="form-label required">比较运算符</span>
            <BaseSelect v-model="form.operator" :options="operatorOptions" />
          </label>
          <label class="form-item">
            <span class="form-label required">告警级别</span>
            <BaseSelect v-model="form.alertLevel" :options="levelOptions" />
          </label>
        </div>

        <div v-if="rangeMode" class="grid-2">
          <label class="form-item">
            <span class="form-label required">区间下限 (min)</span>
            <BaseInput v-model="form.min" type="number" placeholder="例如：0" />
          </label>
          <label class="form-item">
            <span class="form-label required">区间上限 (max)</span>
            <BaseInput v-model="form.max" type="number" placeholder="例如：50" />
          </label>
        </div>
        <label v-else class="form-item">
          <span class="form-label required">阈值 (threshold)</span>
          <BaseInput v-model="form.threshold" type="number" placeholder="例如：80" />
        </label>

        <label class="form-item inline">
          <BaseSwitch v-model="form.enabled" />
          <span class="switch-text">启用该规则（停用后不再触发）</span>
        </label>
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
  margin: 18px 0 12px;
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
.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  color: #4b5563;
}
.cell-name {
  color: #1f2937;
}
.cond {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  color: #374151;
}
.lvl-badge {
  display: inline-block;
  padding: 1px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}
.row-actions {
  display: inline-flex;
  gap: 4px;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: #6b7280;
  background: transparent;
  border: none;
  cursor: pointer;
}
.icon-btn:hover {
  background: #f3f4f6;
  color: #3b6fd4;
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
.form-item.inline {
  display: flex;
  align-items: center;
  gap: 10px;
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
.switch-text {
  font-size: 13px;
  color: #4b5563;
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
</style>
