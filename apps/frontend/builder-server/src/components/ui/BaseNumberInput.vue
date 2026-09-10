<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    suffix?: string;
    size?: 'sm' | 'md';
  }>(),
  { min: undefined, max: undefined, step: 1, disabled: false, suffix: '', size: 'md' },
);

const emit = defineEmits<{ (e: 'update:modelValue', value: number): void }>();

const display = computed(() => (Number.isFinite(props.modelValue) ? props.modelValue : 0));

function clamp(v: number): number {
  let next = v;
  if (props.min !== undefined) next = Math.max(props.min, next);
  if (props.max !== undefined) next = Math.min(props.max, next);
  return next;
}

function onInput(e: Event): void {
  const target = e.target as HTMLInputElement;
  emit('update:modelValue', clamp(Number(target.value)));
}

function stepDir(dir: 1 | -1): void {
  emit('update:modelValue', clamp(display.value + dir * (props.step ?? 1)));
}
</script>

<template>
  <div
    class="inline-flex items-center rounded-lg border border-[#e5e9f0] bg-white text-sm text-ink transition-colors focus-within:border-primary-400 focus-within:shadow-glow"
    :class="size === 'sm' ? 'h-8' : 'h-9'"
  >
    <button
      type="button"
      class="flex h-full w-7 items-center justify-center text-ink-muted hover:text-primary disabled:opacity-40"
      :disabled="disabled"
      @click="stepDir(-1)"
    >
      −
    </button>
    <input
      type="number"
      :value="display"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      class="w-full min-w-0 border-x border-[#e5e9f0] bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      @input="onInput"
    />
    <span v-if="suffix" class="px-1.5 text-xs text-ink-muted">{{ suffix }}</span>
    <button
      type="button"
      class="flex h-full w-7 items-center justify-center text-ink-muted hover:text-primary disabled:opacity-40"
      :disabled="disabled"
      @click="stepDir(1)"
    >
      +
    </button>
  </div>
</template>
