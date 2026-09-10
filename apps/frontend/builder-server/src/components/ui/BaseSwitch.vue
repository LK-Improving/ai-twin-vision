<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    disabled?: boolean;
    size?: 'sm' | 'md';
  }>(),
  { disabled: false, size: 'md' },
);

const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();

const trackClass = computed(() => {
  const base = 'relative inline-flex items-center rounded-full transition-colors duration-200';
  const dim = props.size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const on = props.modelValue ? 'bg-primary-500' : 'bg-[#d6dbe4]';
  return `${base} ${dim} ${on} ${props.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`;
});

const knobClass = computed(() => {
  const dim = props.size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const shift = props.modelValue ? (props.size === 'sm' ? 'translate-x-4' : 'translate-x-5') : 'translate-x-0.5';
  return `inline-block rounded-full bg-white shadow transition-transform duration-200 ${dim} ${shift}`;
});

function toggle(): void {
  if (props.disabled) return;
  emit('update:modelValue', !props.modelValue);
}
</script>

<template>
  <button type="button" :class="trackClass" role="switch" :aria-checked="modelValue" @click="toggle">
    <span :class="knobClass" />
  </button>
</template>
