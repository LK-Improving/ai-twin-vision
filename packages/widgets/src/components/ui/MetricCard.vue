<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  config?: Record<string, unknown>;
}>();

const c = computed(() => props.config ?? {});
const title = computed(() => (c.value.title as string) ?? '指标');
const value = computed(() => {
  const v = c.value.value;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v) || 0;
  return 0;
});
const unit = computed(() => (c.value.unit as string) ?? '');
const trend = computed(() => Number(c.value.trend ?? 0));
const trendUp = computed(() => trend.value >= 0);
const color = computed(() => (c.value.color as string) ?? '#00eaff');
</script>

<template>
  <div class="dt-metric">
    <div class="dt-metric__title">{{ title }}</div>
    <div class="dt-metric__value" :style="{ color }">
      {{ value }}<span class="dt-metric__unit">{{ unit }}</span>
    </div>
    <div class="dt-metric__trend" :class="trendUp ? 'up' : 'down'">
      {{ trendUp ? '▲' : '▼' }} {{ Math.abs(trend) }}
    </div>
  </div>
</template>

<style scoped>
.dt-metric {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 8px 14px;
  box-sizing: border-box;
  color: #cfe8ff;
}
.dt-metric__title {
  font-size: 13px;
  color: #9fc7ff;
}
.dt-metric__value {
  font-size: 30px;
  font-weight: bold;
  line-height: 1.3;
}
.dt-metric__unit {
  font-size: 14px;
  margin-left: 4px;
  opacity: 0.8;
}
.dt-metric__trend {
  font-size: 12px;
}
.dt-metric__trend.up {
  color: #36cfc9;
}
.dt-metric__trend.down {
  color: #ff7a45;
}
</style>
