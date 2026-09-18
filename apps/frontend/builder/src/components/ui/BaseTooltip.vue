<script setup lang="ts">
withDefaults(
  defineProps<{
    content: string;
    placement?: 'top' | 'bottom' | 'left' | 'right';
  }>(),
  { placement: 'top' },
);

// 仅用 CSS 控制显隐，无 JS 依赖
const POSITION: Record<string, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
};
</script>

<template>
  <span class="relative inline-flex group">
    <slot />
    <span
      class="pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white shadow-card group-hover:block"
      :class="POSITION[placement]"
    >
      {{ content }}
    </span>
  </span>
</template>
