<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';

type Item = { value: number | string; label: string; icon?: string; color?: string };

const props = defineProps<{
  config?: Record<string, unknown>;
}>();

const c = computed(() => props.config ?? {});
const items = computed<Item[]>(() => {
  const raw = c.value.items;
  if (Array.isArray(raw)) return raw as Item[];
  return [
    { value: 458, label: '制造业企业', color: '#00d8ff' },
    { value: 326, label: '服务业企业', color: '#4fd6a8' },
    { value: 187, label: '科技企业', color: '#ffd166' },
  ];
});
const icon = (it: Item) => it.icon ?? 'M3 21h18M5 21V7l8-4 8 4v14M9 21v-6h6v6';

/** 数字滚动：每个块独立缓动到目标值 */
const display = ref<number[]>(items.value.map(() => 0));
let raf = 0;
function animateAll() {
  cancelAnimationFrame(raf);
  const targets = items.value.map((it) => Number(it.value) || 0);
  const starts = display.value.slice();
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / 900);
    const e = 1 - Math.pow(1 - t, 3);
    display.value = targets.map((tg, i) => starts[i] + (tg - starts[i]) * e);
    if (t < 1) raf = requestAnimationFrame(step);
    else display.value = targets;
  };
  raf = requestAnimationFrame(step);
}
onMounted(animateAll);
watch(items, animateAll, { deep: true });
onBeforeUnmount(() => cancelAnimationFrame(raf));
function displayValue(it: Item, i: number): string | number {
  const isInt = Number.isInteger(Number(it.value));
  return isInt ? Math.round(display.value[i] ?? 0) : it.value;
}
</script>

<template>
  <div class="dt-stat-block">
    <div
      v-for="(it, i) in items"
      :key="it.label"
      class="dt-stat-block__item"
      :style="{ animationDelay: i * 0.08 + 's' }"
    >
      <div class="dt-stat-block__value" :style="{ color: it.color ?? '#00d8ff' }">
        {{ displayValue(it, i) }}
      </div>
      <div class="dt-stat-block__label">{{ it.label }}</div>
      <div class="dt-stat-block__icon" :style="{ color: it.color ?? '#00d8ff' }">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path :d="icon(it)" />
        </svg>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dt-stat-block {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-around;
  box-sizing: border-box;
}
.dt-stat-block__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 130px;
  animation: stat-in 0.5s ease both;
}
@keyframes stat-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.dt-stat-block__value {
  font-size: 40px;
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: 2px;
  text-shadow: 0 0 14px currentColor;
  font-family: 'DIN Alternate', 'Bahnschrift', 'Arial Narrow', sans-serif;
}
.dt-stat-block__label {
  font-size: 13px;
  color: #a9cbe4;
  letter-spacing: 1px;
}
.dt-stat-block__icon {
  width: 34px;
  height: 34px;
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid currentColor;
  background: rgba(255, 255, 255, 0.05);
  box-shadow: 0 0 10px rgba(0, 216, 255, 0.25) inset;
}
.dt-stat-block__icon svg {
  width: 18px;
  height: 18px;
}
</style>
