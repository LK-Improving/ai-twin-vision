<script setup lang="ts">
withDefaults(
  defineProps<{
    /** 状态语义：success / warning / danger / info / default */
    type?: 'success' | 'warning' | 'danger' | 'info' | 'default';
    text?: string;
    dot?: boolean;
  }>(),
  { type: 'default', text: '', dot: true },
);

const CLASS: Record<string, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-primary-50 text-primary-600',
  default: 'bg-surface-muted text-ink-soft',
};
const DOT: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-primary-500',
  default: 'bg-ink-muted',
};
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
    :class="CLASS[type]"
  >
    <span v-if="dot" class="h-1.5 w-1.5 rounded-full" :class="DOT[type]" />
    {{ text }}
  </span>
</template>
