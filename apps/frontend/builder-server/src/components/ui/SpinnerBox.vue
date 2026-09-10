<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg';
    text?: string;
  }>(),
  { size: 'md', text: '' },
);

const dim = {
  sm: 'h-5 w-5 border-2',
  md: 'h-8 w-8 border-[3px]',
  lg: 'h-12 w-12 border-4',
};
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2">
    <span
      class="inline-block animate-spin rounded-full border-primary-500 border-t-transparent"
      :class="[dim[size]]"
    />
    <span v-if="text" class="text-sm text-ink-soft">{{ text }}</span>
  </div>
</template>
