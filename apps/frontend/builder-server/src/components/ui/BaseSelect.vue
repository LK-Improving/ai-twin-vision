<script setup lang="ts">
import { computed } from 'vue';
import IconBase from './IconBase.vue';

interface Option {
  label: string;
  value: string | number;
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null;
    options: Option[];
    placeholder?: string;
    size?: 'sm' | 'md';
    disabled?: boolean;
    clearable?: boolean;
  }>(),
  { size: 'md', disabled: false, clearable: false, placeholder: '请选择' },
);

const emit = defineEmits<{ (e: 'update:modelValue', value: string | number | null): void }>();

// select 元素无法表达 null，用空字符串占位
const innerValue = computed(() => (props.modelValue === null ? '' : String(props.modelValue)));

function onChange(e: Event): void {
  const target = e.target as HTMLSelectElement;
  const raw = target.value;
  if (raw === '') {
    emit('update:modelValue', null);
    return;
  }
  const matched = props.options.find((o) => String(o.value) === raw);
  emit('update:modelValue', matched ? matched.value : raw);
}

function clear(): void {
  emit('update:modelValue', null);
}

const showClear = computed(() => props.clearable && !props.disabled && props.modelValue !== null);
</script>

<template>
  <div class="relative inline-flex w-full items-center">
    <select
      :value="innerValue"
      :disabled="disabled"
      class="w-full appearance-none rounded-lg border border-[#e5e9f0] bg-white pr-8 text-sm text-ink outline-none transition-colors focus:border-primary-400 focus:shadow-glow disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted"
      :class="size === 'sm' ? 'h-8 pl-2.5' : 'h-9 pl-3'"
      @change="onChange"
    >
      <option v-if="clearable || placeholder" value="">{{ placeholder }}</option>
      <option v-for="opt in options" :key="String(opt.value)" :value="String(opt.value)">
        {{ opt.label }}
      </option>
    </select>
    <button
      v-if="showClear"
      type="button"
      class="absolute right-7 flex h-5 w-5 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink"
      @click="clear"
    >
      <IconBase name="close" :size="12" />
    </button>
    <IconBase
      name="chevron-down"
      :size="14"
      class="pointer-events-none absolute right-2.5 text-ink-muted"
    />
  </div>
</template>
