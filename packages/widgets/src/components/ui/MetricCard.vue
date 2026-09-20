<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';

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
const showTrend = computed(() => c.value.trend !== undefined && c.value.trend !== null);
const trendUp = computed(() => trend.value >= 0);
const color = computed(() => (c.value.color as string) ?? '#00d8ff');
const icon = computed(
  () => (c.value.icon as string) ?? 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
);
/** 紧凑模式：适合面板内嵌的小指标 */
const compact = computed(() => c.value.compact === true);

/** 数字滚动：从 0 缓动到目标值，数据更新时再次滚动 */
const display = ref(0);
let raf = 0;
function animateTo(target: number) {
  cancelAnimationFrame(raf);
  const start = display.value;
  const startTime = performance.now();
  const duration = 900;
  const step = (now: number) => {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    display.value = start + (target - start) * eased;
    if (t < 1) raf = requestAnimationFrame(step);
    else display.value = target;
  };
  raf = requestAnimationFrame(step);
}
onMounted(() => animateTo(value.value));
watch(value, (v) => animateTo(v));
onBeforeUnmount(() => cancelAnimationFrame(raf));
const displayText = computed(() => {
  const isInt = Number.isInteger(value.value);
  return isInt ? String(Math.round(display.value)) : display.value.toFixed(1);
});
</script>

<template>
  <div
    class="dt-metric"
    :class="{ 'dt-metric--compact': compact }"
    :style="{ '--metric-color': color }"
  >
    <div class="dt-metric__icon">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path :d="icon" />
      </svg>
    </div>
    <div class="dt-metric__main">
      <div class="dt-metric__title">{{ title }}</div>
      <div class="dt-metric__value">
        <span class="dt-metric__num">{{ displayText }}</span>
        <span v-if="unit" class="dt-metric__unit">{{ unit }}</span>
      </div>
    </div>
    <div v-if="showTrend" class="dt-metric__trend" :class="trendUp ? 'up' : 'down'">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
      >
        <path v-if="trendUp" d="M6 15l6-6 6 6" />
        <path v-else d="M6 9l6 6 6-6" />
      </svg>
      <span>{{ Math.abs(trend) }}%</span>
    </div>
  </div>
</template>

<style scoped>
.dt-metric {
  --metric-color: #00d8ff;
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  box-sizing: border-box;
  color: #cfe8ff;
  border: 1px solid rgba(46, 168, 216, 0.28);
  border-radius: 3px;
  background: linear-gradient(135deg, rgba(10, 40, 70, 0.72), rgba(5, 18, 34, 0.62));
  overflow: hidden;
}
.dt-metric::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(180deg, var(--metric-color), transparent);
  opacity: 0.9;
}
.dt-metric__icon {
  position: relative;
  overflow: hidden;
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: var(--metric-color);
  background: linear-gradient(140deg, rgba(0, 216, 255, 0.22), rgba(0, 216, 255, 0.04));
  border: 1px solid rgba(0, 216, 255, 0.3);
  box-shadow:
    0 0 10px rgba(0, 216, 255, 0.2),
    inset 0 0 10px rgba(0, 216, 255, 0.12);
}
/* 图标上周期性掠过的高光，增强质感 */
.dt-metric__icon::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    120deg,
    transparent 35%,
    rgba(255, 255, 255, 0.55) 50%,
    transparent 65%
  );
  transform: translateX(-130%);
  animation: metric-sheen 3.4s ease-in-out infinite;
  pointer-events: none;
}
@keyframes metric-sheen {
  0% {
    transform: translateX(-130%);
  }
  60%,
  100% {
    transform: translateX(130%);
  }
}
.dt-metric__icon svg {
  width: 22px;
  height: 22px;
}
.dt-metric__main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.dt-metric__title {
  font-size: 12px;
  color: #8fb8d8;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}
.dt-metric__value {
  display: flex;
  align-items: baseline;
  gap: 3px;
}
.dt-metric__num {
  font-size: 26px;
  font-weight: 800;
  line-height: 1.1;
  color: #ffffff;
  letter-spacing: 0.5px;
  text-shadow: 0 0 12px rgba(0, 216, 255, 0.4);
  font-family: 'DIN Alternate', 'Bahnschrift', 'Arial Narrow', sans-serif;
}
.dt-metric__unit {
  font-size: 12px;
  font-weight: 400;
  color: #9fc7e6;
}
.dt-metric__trend {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: 600;
}
.dt-metric__trend svg {
  width: 12px;
  height: 12px;
}
.dt-metric__trend.up {
  color: #ff5a5a;
}
.dt-metric__trend.down {
  color: #35d69b;
}

/* 紧凑模式 */
.dt-metric--compact {
  padding: 6px 10px;
  gap: 8px;
}
.dt-metric--compact .dt-metric__icon {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
}
.dt-metric--compact .dt-metric__icon svg {
  width: 15px;
  height: 15px;
}
.dt-metric--compact .dt-metric__num {
  font-size: 20px;
}
</style>
