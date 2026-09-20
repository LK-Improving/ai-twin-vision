<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  config?: Record<string, unknown>;
}>();

const emit = defineEmits<{ (e: 'change', index: number, tab: string): void }>();

const c = computed(() => props.config ?? {});
const tabs = computed<string[]>(() => {
  const t = c.value.tabs;
  if (Array.isArray(t)) return t.filter((x) => typeof x === 'string') as string[];
  if (typeof t === 'string')
    return t
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return ['综合总览', '招商引资', '环保监管', '安全生产', '经济运行'];
});
const activeIndex = ref(Number(c.value.activeIndex ?? 0));
const active = computed(() => tabs.value[activeIndex.value] ?? tabs.value[0]);

function select(i: number) {
  activeIndex.value = i;
  emit('change', i, tabs.value[i]);
}
</script>

<template>
  <div class="dt-nav-tabs">
    <button
      v-for="(tab, i) in tabs"
      :key="tab"
      class="dt-nav-tabs__item"
      :class="{ active: i === activeIndex }"
      @click="select(i)"
    >
      <span class="dt-nav-tabs__text">{{ tab }}</span>
    </button>
  </div>
</template>

<style scoped>
.dt-nav-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(6, 22, 44, 0.7);
  border: 1px solid rgba(0, 234, 255, 0.18);
  box-shadow: inset 0 0 12px rgba(0, 234, 255, 0.08);
}
.dt-nav-tabs__item {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 92px;
  height: 32px;
  padding: 0 18px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #9fc7ff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    color 0.2s,
    background 0.2s,
    box-shadow 0.2s;
}
.dt-nav-tabs__item:hover {
  color: #e6f7ff;
  background: rgba(0, 234, 255, 0.08);
}
.dt-nav-tabs__item.active {
  color: #06162c;
  background: linear-gradient(90deg, #00eaff, #00c6ff);
  box-shadow: 0 0 12px rgba(0, 234, 255, 0.35);
  font-weight: 600;
}
.dt-nav-tabs__item.active::before,
.dt-nav-tabs__item.active::after {
  content: '';
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 6px #ffffff;
  opacity: 0.7;
}
.dt-nav-tabs__item.active::before {
  left: 10px;
}
.dt-nav-tabs__item.active::after {
  right: 10px;
}
</style>
