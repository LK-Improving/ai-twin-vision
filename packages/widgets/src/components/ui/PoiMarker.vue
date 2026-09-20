<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  config?: Record<string, unknown>;
}>();

const c = computed(() => props.config ?? {});
const label = computed(() => (c.value.label as string) ?? '标注');
const color = computed(() => (c.value.color as string) ?? '#ffd666');
const icon = computed(
  () => (c.value.icon as string) ?? 'M12 2C8 8 4 12 4 16a8 8 0 1 0 16 0c0-4-4-8-8-14z',
);
const pulse = computed(() => c.value.pulse !== false);
</script>

<template>
  <div class="dt-poi" :style="{ '--poi-color': color }">
    <div class="dt-poi__pin" :class="{ pulse }">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path :d="icon" />
      </svg>
    </div>
    <div class="dt-poi__label">
      <span class="dt-poi__text">{{ label }}</span>
    </div>
  </div>
</template>

<style scoped>
.dt-poi {
  --poi-color: #ffd666;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px 2px 2px;
  border-radius: 999px;
  background: rgba(6, 22, 44, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(3px);
  color: var(--poi-color);
}
.dt-poi__pin {
  position: relative;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--poi-color);
  color: #06162c;
  box-shadow: 0 0 10px var(--poi-color);
}
.dt-poi__pin svg {
  width: 14px;
  height: 14px;
}
.dt-poi__pin.pulse::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1px solid var(--poi-color);
  animation: poi-pulse 1.6s infinite;
}
.dt-poi__label {
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
  text-shadow: 0 0 6px rgba(0, 0, 0, 0.5);
}
@keyframes poi-pulse {
  0% {
    transform: scale(1);
    opacity: 0.9;
  }
  100% {
    transform: scale(1.7);
    opacity: 0;
  }
}
</style>
