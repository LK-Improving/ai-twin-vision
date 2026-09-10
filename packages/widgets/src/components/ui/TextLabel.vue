<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  config?: Record<string, unknown>;
}>();

const text = computed(() => (props.config?.text as string) ?? '');
const style = computed<Record<string, string>>(() => {
  const c = props.config ?? {};
  const color = (c.color as string) ?? '#cfe8ff';
  return {
    fontSize: `${(c.fontSize as number) ?? 14}px`,
    color,
    textAlign: (c.align as string) ?? 'left',
    fontWeight: c.bold ? 'bold' : 'normal',
    lineHeight: '1.4',
    textShadow: c.glow ? `0 0 8px ${color}` : 'none',
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };
});
</script>

<template>
  <div class="dt-text" :style="style">{{ text }}</div>
</template>

<style scoped>
.dt-text {
  box-sizing: border-box;
  padding: 4px 8px;
}
</style>
