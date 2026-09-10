<script setup lang="ts">
/**
 * 按组件 configSchema.props 动态渲染属性表单。
 * 支持分组折叠、条件显示（visibleWhen）、必填校验、不同类型映射到对应 UI 组件。
 * 'model' 类型弹出模型资产选择器。输入经 150ms 防抖后回传给父级。
 */
import { computed, ref, watch } from 'vue';
import type { PropSchemaField, ComponentConfigSchema } from '@dt/shared-types';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseTextarea from '@/components/ui/BaseTextarea.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import BaseSwitch from '@/components/ui/BaseSwitch.vue';
import BaseSlider from '@/components/ui/BaseSlider.vue';
import BaseNumberInput from '@/components/ui/BaseNumberInput.vue';
import ColorPicker from '@/components/ui/ColorPicker.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import IconBase from '@/components/ui/IconBase.vue';
import { useToast } from '@/composables/useToast';
import { deepClone, debounce } from '@/views/editor/utils/object';
import ModelPickerDialog from './ModelPickerDialog.vue';

const props = defineProps<{
  schema: ComponentConfigSchema;
  modelValue: Record<string, unknown>;
}>();
const emit = defineEmits<{ change: [value: Record<string, unknown>] }>();

const toast = useToast();

const form = ref<Record<string, unknown>>(deepClone(props.modelValue ?? {}));
const jsonError = ref<Record<string, string>>({});
const showModelPicker = ref(false);
const modelFieldKey = ref<string | null>(null);

watch(
  () => props.modelValue,
  (v) => {
    form.value = deepClone(v ?? {});
  },
  { deep: true },
);

/** 防抖回传：属性输入到画布更新防抖 150ms */
const emitChange = debounce(() => {
  emit('change', deepClone(form.value));
}, 150);

function setField(key: string, value: unknown): void {
  form.value[key] = value;
  emitChange();
}

// 按 group 分组（无 group 的归入默认组）
const groups = computed(() => {
  const map = new Map<string, PropSchemaField[]>();
  for (const f of props.schema.props ?? []) {
    const g = f.group ?? '';
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(f);
  }
  return Array.from(map.entries());
});

function isVisible(f: PropSchemaField): boolean {
  if (!f.visibleWhen) return true;
  return form.value[f.visibleWhen.key] === f.visibleWhen.value;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

// -------------------------------------------------------------- 各类型控件
function onJsonInput(key: string, raw: string): void {
  try {
    const parsed = JSON.parse(raw);
    jsonError.value[key] = '';
    setField(key, parsed);
  } catch {
    jsonError.value[key] = 'JSON 解析失败';
  }
}
function jsonText(key: string): string {
  const v = form.value[key];
  return typeof v === 'string' ? v : JSON.stringify(v ?? {}, null, 2);
}

function openModelPicker(key: string): void {
  modelFieldKey.value = key;
  showModelPicker.value = true;
}
function onModelPicked(url: string, name: string): void {
  if (modelFieldKey.value) {
    setField(modelFieldKey.value, url);
    toast.success(`已选择模型：${name}`);
  }
  showModelPicker.value = false;
}
</script>

<template>
  <div class="prop-form">
    <template v-for="[group, fields] in groups" :key="group || 'default'">
      <details class="prop-group" :open="true">
        <summary v-if="group">{{ group }}</summary>
        <div class="group-body">
          <div v-for="f in fields" :key="f.key" v-show="isVisible(f)" class="field">
            <label class="field-label">
              {{ f.label }}
              <span v-if="f.required" class="req">*</span>
            </label>

            <!-- 字符串 -->
            <BaseInput
              v-if="f.type === 'string'"
              :model-value="(form[f.key] as string) ?? ''"
              :placeholder="f.placeholder"
              size="sm"
              @update:model-value="(v: string | number | null)=>setField(f.key, v as string | number | boolean | null)"
            />

            <!-- 数字 -->
            <BaseNumberInput
              v-else-if="f.type === 'number'"
              :model-value="(form[f.key] as number) ?? 0"
              :min="f.min"
              :max="f.max"
              :step="f.step"
              @update:model-value="(v:number)=>setField(f.key, v as string | number | boolean | null)"
            />

            <!-- 布尔 -->
            <BaseSwitch
              v-else-if="f.type === 'boolean'"
              :model-value="!!form[f.key]"
              @update:model-value="(v:boolean)=>setField(f.key, v as string | number | boolean | null)"
            />

            <!-- 颜色 -->
            <ColorPicker
              v-else-if="f.type === 'color'"
              :model-value="(form[f.key] as string) ?? '#000000'"
              @update:model-value="(v: string | number | null)=>setField(f.key, v as string | number | boolean | null)"
            />

            <!-- 下拉 -->
            <BaseSelect
              v-else-if="f.type === 'select'"
              :model-value="(form[f.key] as string|number)"
              :options="(f.options ?? []) as Array<{label:string;value:string|number}>"
              :placeholder="f.placeholder"
              size="sm"
              @update:model-value="(v: string | number | null)=>setField(f.key, v as string | number | boolean | null)"
            />

            <!-- 滑块 -->
            <BaseSlider
              v-else-if="f.type === 'slider'"
              :model-value="(form[f.key] as number) ?? f.min ?? 0"
              :min="f.min ?? 0"
              :max="f.max ?? 100"
              :step="f.step ?? 1"
              @update:model-value="(v:number)=>setField(f.key, v as string | number | boolean | null)"
            />

            <!-- JSON -->
            <div v-else-if="f.type === 'json'" class="json-wrap">
              <BaseTextarea :model-value="jsonText(f.key)" :rows="4" @update:model-value="(v: string | number | null)=>onJsonInput(f.key, String(v ?? ''))" />
              <span v-if="jsonError[f.key]" class="err">{{ jsonError[f.key] }}</span>
            </div>

            <!-- 图片 -->
            <div v-else-if="f.type === 'image'" class="image-wrap">
              <BaseInput
                :model-value="(form[f.key] as string) ?? ''"
                placeholder="图片地址"
                size="sm"
                @update:model-value="(v: string | number | null)=>setField(f.key, v as string | number | boolean | null)"
              />
              <img v-if="form[f.key]" :src="(form[f.key] as string)" class="image-preview" alt="预览" />
            </div>

            <!-- 模型资产 -->
            <div v-else-if="f.type === 'model'" class="model-wrap">
              <BaseInput
                :model-value="(form[f.key] as string) ?? ''"
                placeholder="未选择模型"
                size="sm"
                readonly
              />
              <BaseButton type="ghost" size="sm" icon="cube" @click="openModelPicker(f.key)">选择模型</BaseButton>
            </div>

            <span v-if="f.required && isEmpty(form[f.key])" class="hint">必填</span>
            <span v-if="f.description" class="hint">{{ f.description }}</span>
          </div>
        </div>
      </details>
    </template>

    <ModelPickerDialog v-model:visible="showModelPicker" @pick="onModelPicked" />
  </div>
</template>

<style scoped>
.prop-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.prop-group {
  border: 1px solid #eef1f5;
  border-radius: 8px;
  padding: 6px 8px;
  margin-bottom: 10px;
}
.prop-group summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: #425466;
}
.group-body {
  padding: 8px 2px 2px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}
.field-label {
  font-size: 12px;
  color: #495057;
}
.req {
  color: #e03131;
}
.json-wrap,
.image-wrap,
.model-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.image-preview {
  max-width: 100%;
  max-height: 80px;
  border-radius: 4px;
}
.err {
  color: #e03131;
  font-size: 11px;
}
.hint {
  font-size: 11px;
  color: #adb5bd;
}
</style>
