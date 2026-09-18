<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  type CreateDeviceRequest,
  type DeviceItem,
  type DeviceProtocol,
  type DeviceQuery,
} from '@dt/shared-types';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseTable, { type TableColumn } from '@/components/ui/BaseTable.vue';
import BasePagination from '@/components/ui/BasePagination.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import SpinnerBox from '@/components/ui/SpinnerBox.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import IconBase from '@/components/ui/IconBase.vue';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import { usePagination } from '@/composables/usePagination';
import { createDeviceApi, deleteDeviceApi, getDevicesApi } from '@/services/api/device';
import { formatDateTime } from '@/utils/format';

const toast = useToast();
const { confirm } = useConfirm();
const { page, limit, total, onChangePage, onChangeLimit } = usePagination({ limit: 20 });

const loading = ref(false);
const error = ref<string | null>(null);
const list = ref<DeviceItem[]>([]);
const filterProtocol = ref('');

const protocolOptions: Array<{ label: string; value: DeviceProtocol }> = [
  { label: 'MQTT', value: 'MQTT' as DeviceProtocol },
  { label: 'OPC-UA', value: 'OPC_UA' as DeviceProtocol },
  { label: 'Modbus', value: 'MODBUS' as DeviceProtocol },
  { label: 'HTTP', value: 'HTTP' as DeviceProtocol },
];

const columns: TableColumn[] = [
  { key: 'deviceCode', title: '设备编码', width: 170 },
  { key: 'deviceName', title: '设备名称' },
  { key: 'deviceType', title: '设备类型', width: 130 },
  { key: 'protocol', title: '接入协议', width: 110, align: 'center' },
  { key: 'status', title: '在线状态', width: 100, align: 'center' },
  { key: 'lastOnlineAt', title: '最后在线', width: 170 },
  { key: 'actions', title: '操作', width: 90, align: 'center' },
];

/** 各协议的连接配置字段 */
const PROTOCOL_FIELDS: Record<string, Array<{ key: string; label: string; placeholder?: string }>> = {
  MQTT: [
    { key: 'clientId', label: 'Client ID' },
    { key: 'topic', label: '上报主题', placeholder: 'device/+/telemetry' },
    { key: 'qos', label: 'QoS', placeholder: '1' },
  ],
  'OPC-UA': [
    { key: 'nodeId', label: 'Node ID', placeholder: 'ns=2;s=Device1.Temperature' },
    { key: 'samplingInterval', label: '采样间隔(ms)', placeholder: '1000' },
  ],
  MODBUS: [
    { key: 'slaveId', label: '从站 ID', placeholder: '1' },
    { key: 'register', label: '寄存器地址', placeholder: '40001' },
    { key: 'functionCode', label: '功能码', placeholder: '03' },
  ],
  HTTP: [{ key: 'endpoint', label: '上报地址', placeholder: 'https://...' }],
};

async function fetchList(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const params: DeviceQuery = {
      page: page.value,
      limit: limit.value,
      protocol: filterProtocol.value || undefined,
    };
    const res = await getDevicesApi(params);
    list.value = res.dataList;
    total.value = res.total;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载设备失败';
    list.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

/* ------------------------------ 新增设备 ------------------------------ */

const dialogVisible = ref(false);
const saving = ref(false);
const form = reactive<CreateDeviceRequest>({
  deviceCode: '',
  deviceName: '',
  deviceType: '',
  protocol: 'MQTT' as DeviceProtocol,
  connectionConfig: {},
});
const configDraft = reactive<Record<string, string>>({});

watch(
  () => form.protocol,
  (p) => {
    Object.keys(configDraft).forEach((k) => delete configDraft[k]);
    (PROTOCOL_FIELDS[p] ?? []).forEach((f) => {
      configDraft[f.key] = '';
    });
  },
);

const currentFields = computed(() => PROTOCOL_FIELDS[form.protocol] ?? []);

function openCreate(): void {
  form.deviceCode = '';
  form.deviceName = '';
  form.deviceType = '';
  form.protocol = 'MQTT' as DeviceProtocol;
  Object.keys(configDraft).forEach((k) => delete configDraft[k]);
  (PROTOCOL_FIELDS.MQTT ?? []).forEach((f) => {
    configDraft[f.key] = '';
  });
  dialogVisible.value = true;
}

async function submit(): Promise<void> {
  if (!form.deviceCode.trim() || !form.deviceName.trim()) {
    toast.warning('请填写设备编码与设备名称');
    return;
  }
  saving.value = true;
  try {
    const cfg: Record<string, unknown> = {};
    currentFields.value.forEach((f) => {
      const raw = (configDraft[f.key] ?? '').trim();
      if (raw) cfg[f.key] = raw;
    });
    await createDeviceApi({
      deviceCode: form.deviceCode.trim(),
      deviceName: form.deviceName.trim(),
      deviceType: form.deviceType.trim() || 'GENERIC',
      protocol: form.protocol,
      connectionConfig: cfg,
    });
    toast.success('设备已添加');
    dialogVisible.value = false;
    await fetchList();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '添加失败');
  } finally {
    saving.value = false;
  }
}

async function onDelete(row: DeviceItem): Promise<void> {
  const ok = await confirm({
    title: '删除设备',
    message: `确定删除设备「${row.deviceName}」吗？其历史遥测数据将不再关联展示。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteDeviceApi(row.id);
    toast.success('设备已删除');
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
        <h2 class="page-title">IoT 设备</h2>
        <p class="page-desc">登记接入平台的物联网设备与采集协议</p>
      </div>
      <BaseButton type="primary" icon="plus" @click="openCreate">新增设备</BaseButton>
    </header>

    <div class="toolbar">
      <div class="w-44">
        <BaseSelect
          :model-value="filterProtocol"
          :options="[{ label: '全部协议', value: '' }, ...protocolOptions]"
          @update:model-value="(v) => { filterProtocol = String(v ?? ''); page = 1; void fetchList(); }"
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
        <template #cell-deviceCode="{ row }">
          <span class="code">{{ (row as DeviceItem).deviceCode }}</span>
        </template>
        <template #cell-deviceName="{ row }">
          <div class="cell-name">
            <IconBase name="device" :size="15" />
            <span>{{ (row as DeviceItem).deviceName }}</span>
          </div>
        </template>
        <template #cell-protocol="{ row }">
          <span class="proto-tag">{{ (row as DeviceItem).protocol }}</span>
        </template>
        <template #cell-status="{ row }">
          <StatusBadge
            :type="(row as DeviceItem).status === 1 ? 'success' : 'default'"
            :text="(row as DeviceItem).status === 1 ? '在线' : '离线'"
          />
        </template>
        <template #cell-lastOnlineAt="{ row }">
          <span>{{ formatDateTime((row as DeviceItem).lastOnlineAt) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <button class="icon-btn danger" @click="void onDelete(row as DeviceItem)">
            <IconBase name="trash" :size="15" />
          </button>
        </template>
      </BaseTable>

      <EmptyState v-if="showEmpty" text="暂无设备" description="新增设备后即可在场景中绑定实时遥测数据" />

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

    <BaseModal
      :visible="dialogVisible"
      title="新增设备"
      width="540px"
      confirm-text="确定"
      :loading="saving"
      @update:visible="dialogVisible = $event"
      @confirm="void submit()"
    >
      <div class="form-stack">
        <div class="grid-2">
          <label class="form-item">
            <span class="form-label required">设备编码</span>
            <BaseInput v-model="form.deviceCode" placeholder="例如：DEV-TR-001" />
          </label>
          <label class="form-item">
            <span class="form-label required">设备名称</span>
            <BaseInput v-model="form.deviceName" placeholder="例如：1 号主变压器" />
          </label>
        </div>

        <div class="grid-2">
          <label class="form-item">
            <span class="form-label">设备类型</span>
            <BaseInput v-model="form.deviceType" placeholder="例如：TRANSFORMER" />
          </label>
          <div class="form-item">
            <span class="form-label">接入协议</span>
            <BaseSelect v-model="form.protocol" :options="protocolOptions" />
          </div>
        </div>

        <div class="divider">连接配置</div>
        <label v-for="f in currentFields" :key="f.key" class="form-item">
          <span class="form-label">{{ f.label }}</span>
          <BaseInput
            :model-value="configDraft[f.key] ?? ''"
            :placeholder="f.placeholder"
            @update:model-value="configDraft[f.key] = $event"
          />
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
  display: flex;
  align-items: center;
  gap: 8px;
  color: #1f2937;
}
.proto-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 4px;
  background: #eef4ff;
  color: #3b6fd4;
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
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.divider {
  font-size: 12px;
  color: #9ca3af;
  border-top: 1px solid #f0f3f8;
  padding-top: 12px;
}
</style>
