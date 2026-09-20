<script setup lang="ts">
import { computed } from 'vue';

type Item = { label: string; value?: number | string; percent: number; color?: string };

const props = defineProps<{
  config?: Record<string, unknown>;
}>();

const c = computed(() => props.config ?? {});
const items = computed<Item[]>(() => {
  const raw = c.value.items;
  if (Array.isArray(raw)) return raw as Item[];
  return [
    { label: '大型企业', value: 590, percent: 50, color: '#00e0ff' },
    { label: '中型企业', value: 60, percent: 5.3, color: '#36cfc9' },
    { label: '小型企业', value: 150, percent: 20, color: '#ffcc00' },
    { label: '微型企业', value: 380, percent: 33.3, color: '#9254de' },
  ];
});
const showValue = computed(() => c.value.showValue !== false);
</script>

<template>
  <div class="dt-progress">
    <div v-for="it in items" :key="it.label" class="dt-progress__row">
      <span class="dt-progress__dot" :style="{ background: it.color ?? '#00e0ff' }" />
      <span class="dt-progress__label">{{ it.label }}</span>
      <span v-if="showValue" class="dt-progress__value">{{ it.value }}</span>
      <span class="dt-progress__bar">
        <i :style="{ width: `${Math.min(100, it.percent)}%`, background: it.color ?? '#00e0ff' }" />
      </span>
      <span class="dt-progress__pct">{{ it.percent }}%</span>
    </div>
  </div>
</template>

<style scoped>
.dt-progress {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  box-sizing: border-box;
}
.dt-progress__row {
  display: grid;
  grid-template-columns: 8px 74px 48px 1fr 52px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #9fc7e6;
}
.dt-progress__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  box-shadow: 0 0 6px currentColor;
}
.dt-progress__label {
  white-space: nowrap;
}
.dt-progress__value {
  color: #ffffff;
  font-weight: 600;
  text-align: right;
}
.dt-progress__bar {
  position: relative;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.dt-progress__bar i {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 3px;
  box-shadow: 0 0 8px rgba(0, 224, 255, 0.5);
  transition: width 0.6s ease;
}
.dt-progress__pct {
  text-align: right;
  color: #6fa8cc;
}
</style>
