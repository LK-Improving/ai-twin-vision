<script setup lang="ts">
import { computed } from 'vue';
import BaseNumberInput from './BaseNumberInput.vue';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    showInput?: boolean;
  }>(),
  { min: 0, max: 100, step: 1, disabled: false, showInput: false },
);

const emit = defineEmits<{ (e: 'update:modelValue', value: number): void }>();

const percent = computed(() => {
  const span = props.max - props.min || 1;
  return Math.min(100, Math.max(0, ((props.modelValue - props.min) / span) * 100));
});

function onInput(e: Event): void {
  const target = e.target as HTMLInputElement;
  emit('update:modelValue', Number(target.value));
}
</script>

<template>
  <div class="flex w-full items-center gap-3">
    <div class="relative flex-1">
      <div class="absolute left-0 top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-[#e5e9f0]" />
      <div
        class="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary-500"
        :style="{ width: percent + '%' }"
      />
      <input
        type="range"
        :value="modelValue"
        :min="min"
        :max="max"
        :step="step"
        :disabled="disabled"
        class="slider-thumb relative z-10 w-full appearance-none bg-transparent"
        @input="onInput"
      />
    </div>
    <BaseNumberInput
      v-if="showInput"
      :model-value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      size="sm"
      class="w-20"
      @update:model-value="(v: number) => emit('update:modelValue', v)"
    />
  </div>
</template>

<style scoped>
.slider-thumb::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  height: 16px;
  width: 16px;
  border-radius: 9999px;
  background: #ffffff;
  border: 2px solid #1677ff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
  cursor: pointer;
}
.slider-thumb::-moz-range-thumb {
  height: 16px;
  width: 16px;
  border-radius: 9999px;
  background: #ffffff;
  border: 2px solid #1677ff;
  cursor: pointer;
}
</style>
