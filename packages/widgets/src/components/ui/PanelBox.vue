<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  config?: Record<string, unknown>;
}>();

const emit = defineEmits<{ (e: 'tab-change', index: number, tab: string): void }>();

const c = computed(() => props.config ?? {});
const title = computed(() => (c.value.title as string) ?? '');
const borderColor = computed(() => (c.value.borderColor as string) ?? '#2ea8d8');
const glow = computed(() => c.value.glow !== false);
const icon = computed(() => (c.value.icon as string) ?? '');
const iconColor = computed(() => (c.value.iconColor as string) ?? '#00e0ff');
const headerTabs = computed<string[]>(() => {
  const t = c.value.headerTabs;
  if (Array.isArray(t)) return t.filter((x) => typeof x === 'string') as string[];
  if (typeof t === 'string')
    return t
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
});
const activeTab = ref(Number(c.value.activeTab ?? 0));

function pickTab(i: number) {
  activeTab.value = i;
  emit('tab-change', i, headerTabs.value[i]);
}
</script>

<template>
  <div
    class="dt-panel"
    :class="{ 'dt-panel--glow': glow }"
    :style="{ '--panel-color': borderColor }"
  >
    <div class="dt-panel__head">
      <span class="dt-panel__accent" />
      <span v-if="icon" class="dt-panel__icon" :style="{ color: iconColor }" v-html="icon"></span>
      <span class="dt-panel__title">{{ title }}</span>
      <span class="dt-panel__line" />
      <span v-if="headerTabs.length" class="dt-panel__tabs">
        <button
          v-for="(t, i) in headerTabs"
          :key="t"
          class="dt-panel__tab"
          :class="{ active: i === activeTab }"
          @click="pickTab(i)"
        >
          {{ t }}
        </button>
      </span>
    </div>
    <div class="dt-panel__body">
      <slot />
    </div>
    <span class="dt-panel__scan" />
    <span class="dt-panel__corner dt-panel__corner--tl" />
    <span class="dt-panel__corner dt-panel__corner--tr" />
    <span class="dt-panel__corner dt-panel__corner--bl" />
    <span class="dt-panel__corner dt-panel__corner--br" />
  </div>
</template>

<style scoped>
.dt-panel {
  --panel-color: #2ea8d8;
  width: 100%;
  height: 100%;
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(46, 168, 216, 0.32);
  border-radius: 3px;
  background: linear-gradient(180deg, rgba(9, 30, 54, 0.82), rgba(4, 14, 28, 0.74));
  box-shadow: inset 0 1px 0 rgba(120, 220, 255, 0.1);
  overflow: hidden;
  animation: panel-in 0.5s ease both;
}
@keyframes panel-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.dt-panel--glow {
  animation:
    panel-in 0.5s ease both,
    panel-breathe 4.5s ease-in-out infinite;
}
@keyframes panel-breathe {
  0%,
  100% {
    box-shadow:
      inset 0 1px 0 rgba(120, 220, 255, 0.12),
      0 0 12px rgba(0, 176, 255, 0.08);
  }
  50% {
    box-shadow:
      inset 0 1px 0 rgba(120, 220, 255, 0.12),
      0 0 24px rgba(0, 176, 255, 0.2);
  }
}
/* 横向扫光，缓慢掠过面板，增强科技感 */
.dt-panel__scan {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -45%;
  width: 45%;
  background: linear-gradient(90deg, transparent, rgba(0, 224, 255, 0.12), transparent);
  pointer-events: none;
  z-index: 0;
  animation: panel-scan 7s linear infinite;
}
@keyframes panel-scan {
  0% {
    left: -45%;
  }
  55%,
  100% {
    left: 110%;
  }
}
.dt-panel__head {
  position: relative;
  z-index: 1;
  flex: 0 0 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 0 14px;
  background: linear-gradient(
    90deg,
    rgba(0, 170, 255, 0.18),
    rgba(0, 170, 255, 0.03) 55%,
    rgba(0, 170, 255, 0)
  );
  border-bottom: 1px solid rgba(46, 168, 216, 0.22);
}
/* 标题左侧竖向强调条 */
.dt-panel__accent {
  position: absolute;
  left: 0;
  top: 7px;
  bottom: 7px;
  width: 3px;
  background: linear-gradient(180deg, #7ff0ff, var(--panel-color));
  box-shadow: 0 0 8px var(--panel-color);
}
.dt-panel__icon {
  display: inline-flex;
  width: 15px;
  height: 15px;
  line-height: 0;
}
.dt-panel__icon svg {
  width: 100%;
  height: 100%;
}
.dt-panel__title {
  flex: 0 0 auto;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #dff3ff;
  text-shadow: 0 0 10px rgba(0, 190, 255, 0.45);
}
.dt-panel__line {
  flex: 1 1 auto;
  height: 1px;
  background: linear-gradient(90deg, rgba(0, 200, 255, 0.55), rgba(0, 200, 255, 0));
}
.dt-panel__tabs {
  flex: 0 0 auto;
  display: inline-flex;
  gap: 4px;
}
.dt-panel__tab {
  padding: 2px 8px;
  border: 1px solid rgba(46, 168, 216, 0.4);
  border-radius: 2px;
  background: transparent;
  color: #7fb0cc;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.18s;
}
.dt-panel__tab:hover {
  color: #dff3ff;
  border-color: rgba(0, 216, 255, 0.8);
}
.dt-panel__tab.active {
  color: #04121f;
  font-weight: 600;
  background: linear-gradient(180deg, #7ff0ff, #00c8f0);
  border-color: transparent;
}
.dt-panel__body {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  padding: 8px 10px 10px;
  min-height: 0;
  overflow: hidden;
}
/* 四角直角装饰 */
.dt-panel__corner {
  position: absolute;
  width: 11px;
  height: 11px;
  border: 0 solid rgba(0, 216, 255, 0.75);
  pointer-events: none;
  z-index: 3;
}
.dt-panel__corner--tl {
  top: 0;
  left: 0;
  border-top-width: 2px;
  border-left-width: 2px;
}
.dt-panel__corner--tr {
  top: 0;
  right: 0;
  border-top-width: 2px;
  border-right-width: 2px;
}
.dt-panel__corner--bl {
  bottom: 0;
  left: 0;
  border-bottom-width: 2px;
  border-left-width: 2px;
}
.dt-panel__corner--br {
  bottom: 0;
  right: 0;
  border-bottom-width: 2px;
  border-right-width: 2px;
}
</style>
