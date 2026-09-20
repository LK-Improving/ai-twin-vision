<script setup lang="ts">
import { computed } from 'vue';
import IconBase from './IconBase.vue';

const props = withDefaults(
  defineProps<{
    /** 允许空值：配置项常为可选字段，绑定 undefined 时按空串渲染而非 "undefined" */
    modelValue: string | number | null | undefined;
    placeholder?: string;
    type?: string;
    size?: 'sm' | 'md';
    disabled?: boolean;
    clearable?: boolean;
    maxlength?: number;
  }>(),
  { type: 'text', size: 'md', disabled: false, clearable: false },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'enter', value: string): void;
}>();

/** 空值统一回落为空串，避免输入框里出现 "undefined" / "null" */
const displayValue = computed(() => props.modelValue ?? '');

const showClear = computed(
  () => props.clearable && !props.disabled && String(displayValue.value).length > 0,
);

function onInput(e: Event): void {
  const target = e.target as HTMLInputElement;
  emit('update:modelValue', target.value);
}

function onEnter(e: KeyboardEvent): void {
  emit('enter', String(displayValue.value));
}

function clear(): void {
  emit('update:modelValue', '');
}
</script>

<template>
  <div class="relative inline-flex w-full items-center">
    <input
      :value="displayValue"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :maxlength="maxlength"
      class="w-full rounded-lg border border-[#e5e9f0] bg-white text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-primary-400 focus:shadow-glow disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted"
      :class="size === 'sm' ? 'h-8 px-2.5' : 'h-9 px-3'"
      @input="onInput"
      @keyup.enter="onEnter"
    />
    <button
      v-if="showClear"
      type="button"
      class="absolute right-2 flex h-5 w-5 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink"
      @click="clear"
    >
      <IconBase name="close" :size="12" />
    </button>
  </div>
</template>
