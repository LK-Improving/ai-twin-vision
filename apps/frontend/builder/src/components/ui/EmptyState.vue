<script setup lang="ts">
import IconBase from './IconBase.vue';

withDefaults(
  defineProps<{
    text?: string;
    description?: string;
  }>(),
  { text: '暂无数据', description: '' },
);
</script>

<template>
  <div class="flex flex-col items-center justify-center px-4 py-6 text-center">
    <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-muted text-ink-muted">
      <IconBase name="layers" :size="26" />
    </div>
    <p class="mt-3 text-sm font-medium text-ink-soft">{{ text }}</p>
    <p v-if="description" class="mt-1 text-xs text-ink-muted">{{ description }}</p>
  </div>
</template>
