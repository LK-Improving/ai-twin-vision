<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  config?: Record<string, unknown>;
}>();
const emit = defineEmits<{ (e: 'click'): void }>();

const c = computed(() => props.config ?? {});
const label = computed(() => (c.value.label as string) ?? '按钮');
const color = computed(() => (c.value.color as string) ?? '#00eaff');
const round = computed(() => !!c.value.round);

const style = computed<Record<string, string>>(() => ({
  color: color.value,
  borderColor: color.value,
  borderRadius: round.value ? '999px' : '4px',
}));
</script>

<template>
  <button class="dt-btn" :style="style" @click="emit('click')">
    {{ label }}
  </button>
</template>

<style scoped>
.dt-btn {
  width: 100%;
  height: 100%;
  background: rgba(0, 234, 255, 0.08);
  border: 1px solid;
  cursor: pointer;
  font-size: 14px;
  letter-spacing: 1px;
  transition: background 0.2s;
}
.dt-btn:hover {
  background: rgba(0, 234, 255, 0.2);
}
</style>
