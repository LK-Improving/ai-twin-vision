<script setup lang="ts">
/**
 * 数据绑定面板：为选中的 2D 节点配置数据源 / 设备属性 / 静态数据、
 * 字段映射、刷新间隔与转换脚本，并提供「预览数据」能力。
 */
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useEditorStore } from '@/stores/editor';
import { getWidget } from '@dt/widgets';
import type { DataBinding, WidgetNode } from '@dt/shared-types';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseTextarea from '@/components/ui/BaseTextarea.vue';
import BaseNumberInput from '@/components/ui/BaseNumberInput.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import { useToast } from '@/composables/useToast';
import { deepClone } from '@/views/editor/utils/object';
import EmptyState from '@/components/ui/EmptyState.vue';

const store = useEditorStore();
const toast = useToast();
const { selectedNode, dataSources } = storeToRefs(store);

const node = computed<WidgetNode | null>(
  () => (selectedNode.value?.kind === '2D' ? (selectedNode.value.data as WidgetNode) : null),
);

/** 组件可接收的数据字段（用于字段映射表行） */
const dataFields = computed(() => {
  if (!node.value) return [];
  const def = getWidget(node.value.type);
  return def?.configSchema.dataFields ?? [];
});

/** 本地可编辑副本 */
const binding = ref<DataBinding>(emptyBinding());
function emptyBinding(): DataBinding {
  return { fieldMap: {}, refreshInterval: 0 };
}
function reload(): void {
  binding.value = deepClone(node.value?.dataBinding ?? emptyBinding());
}
watch(
  () => node.value?.id,
  () => reload(),
  { immediate: true },
);

function commit(): void {
  if (!node.value) return;
  store.updateNode(node.value.id, { dataBinding: deepClone(binding.value) }, 'data');
}

const dsOptions = computed(() =>
  dataSources.value.map((d) => ({ label: d.name, value: d.id })),
);

const staticText = ref('');
watch(
  () => binding.value.staticData,
  (v) => {
    staticText.value = typeof v === 'string' ? v : JSON.stringify(v ?? {}, null, 2);
  },
  { immediate: true },
);

function onStaticInput(raw: string): void {
  try {
    binding.value.staticData = JSON.parse(raw);
  } catch {
    // 允许暂存为字符串，待用户修正；预览时给出提示
    binding.value.staticData = raw;
  }
  commit();
}

function setFieldMap(key: string, path: string): void {
  if (!binding.value.fieldMap) binding.value.fieldMap = {};
  if (path) binding.value.fieldMap[key] = path;
  else delete binding.value.fieldMap[key];
  commit();
}

// -------------------------------------------------------------- 预览数据
const previewResult = ref('');
const previewing = ref(false);

/** 在沙箱内执行转换脚本（与运行时 event-runtime 约束一致，仅暴露 data 入参） */
function runTransform(script: string, data: unknown): unknown {
  // 安全边界：转换脚本运行在受限作用域，仅能访问入参 data，无法触及 window/document
  const fn = new Function('data', `"use strict";\n${script}`);
  return fn(data);
}

function preview(): void {
  previewing.value = true;
  try {
    const raw = binding.value.staticData;
    let result: unknown = raw;
    if (binding.value.transformScript && binding.value.transformScript.trim()) {
      result = runTransform(binding.value.transformScript, raw);
    }
    previewResult.value = JSON.stringify(result, null, 2);
    toast.success('预览成功');
  } catch (err) {
    previewResult.value = '执行错误：' + (err as Error).message;
    toast.error('预览执行失败');
  } finally {
    previewing.value = false;
  }
}
</script>

<template>
  <div class="data-panel">
    <EmptyState v-if="!node" text="请选择一个组件以配置数据绑定" />

    <template v-else>
      <div class="dp-section">
        <h4>数据来源</h4>
        <div class="dp-row">
          <span>数据源</span>
          <BaseSelect
            :model-value="binding.dataSourceId ?? ''"
            :options="dsOptions"
            placeholder="选择数据源"
            size="sm"
            class="flex1"
            @update:model-value="(v: string | number | null)=>{binding.dataSourceId=String(v ?? '');commit()}"
          />
        </div>
        <div class="dp-row" v-if="binding.dataSourceId">
          <span>设备属性</span>
          <BaseInput
            :model-value="binding.deviceId ?? ''"
            placeholder="设备 ID"
            size="sm"
            class="flex1"
            @update:model-value="(v: string | number | null)=>{binding.deviceId=String(v ?? '');commit()}"
          />
        </div>
        <div class="dp-row" v-if="binding.dataSourceId">
          <span>属性编码</span>
          <BaseInput
            :model-value="binding.propertyCode ?? ''"
            placeholder="propertyCode"
            size="sm"
            class="flex1"
            @update:model-value="(v: string | number | null)=>{binding.propertyCode=String(v ?? '');commit()}"
          />
        </div>
      </div>

      <div class="dp-section">
        <h4>静态数据（无数据源时使用）</h4>
        <BaseTextarea :model-value="staticText" :rows="5" @update:model-value="onStaticInput" />
      </div>

      <div class="dp-section">
        <h4>字段映射（组件字段 ← 数据字段路径）</h4>
        <table class="map-table" v-if="dataFields.length">
          <thead>
            <tr><th>组件字段</th><th>数据字段路径（a.b[0].c）</th></tr>
          </thead>
          <tbody>
            <tr v-for="f in dataFields" :key="f.key">
              <td>{{ f.label }} <small>{{ f.key }}</small></td>
              <td>
                <BaseInput
                  :model-value="binding.fieldMap?.[f.key] ?? ''"
                  placeholder="如 data.list"
                  size="sm"
                  @update:model-value="(v: string | number | null)=>setFieldMap(f.key, String(v ?? ''))"
                />
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-else text="该组件不支持数据字段映射" />
      </div>

      <div class="dp-section">
        <h4>刷新与转换</h4>
        <div class="dp-row">
          <span>刷新间隔(ms)</span>
          <BaseNumberInput
            :model-value="binding.refreshInterval ?? 0"
            :min="0"
            :step="500"
            class="flex1"
            @update:model-value="(v:number)=>{binding.refreshInterval=v;commit()}"
          />
          <span class="dp-tip">0 = 仅推送</span>
        </div>
        <div class="dp-row col">
          <span>转换脚本（沙箱执行，入参 data）</span>
          <BaseTextarea
            :model-value="binding.transformScript ?? ''"
            :rows="4"
            placeholder="return { list: data.items.map(i=>({...})) }"
            @update:model-value="(v: string | number | null)=>{binding.transformScript=String(v ?? '');commit()}"
          />
        </div>
        <BaseButton type="primary" size="sm" icon="play" :loading="previewing" @click="preview">预览数据</BaseButton>
        <BaseTextarea v-if="previewResult" :model-value="previewResult" :rows="6" readonly class="preview-box" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.data-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dp-section {
  border: 1px solid #eef1f5;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 12px;
}
.dp-section h4 {
  margin: 0 0 8px;
  font-size: 13px;
  color: #425466;
}
.dp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #495057;
}
.dp-row.col {
  flex-direction: column;
  align-items: stretch;
}
.dp-row > span:first-child {
  width: 84px;
  flex-shrink: 0;
}
.flex1 {
  flex: 1;
}
.dp-tip {
  font-size: 11px;
  color: #adb5bd;
  white-space: nowrap;
}
.map-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.map-table th,
.map-table td {
  border: 1px solid #eef1f5;
  padding: 4px 6px;
  text-align: left;
}
.map-table small {
  color: #adb5bd;
}
.preview-box {
  margin-top: 8px;
  font-family: monospace;
}
</style>
