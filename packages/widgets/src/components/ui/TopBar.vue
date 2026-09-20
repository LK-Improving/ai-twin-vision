<script setup lang="ts">
import { computed, ref } from 'vue';

/**
 * 科技大屏顶栏：左侧倾斜装饰 + 主标题，中部导航标签，右侧工具图标与用户信息。
 * 全屏通栏使用（width=1920, height=86 左右）。
 */
const props = defineProps<{
  config?: Record<string, unknown>;
}>();

const emit = defineEmits<{ (e: 'change', index: number, tab: string): void }>();

const c = computed(() => props.config ?? {});
const title = computed(() => (c.value.title as string) ?? '数智指挥大厅');
const subtitle = computed(() => (c.value.subtitle as string) ?? '');
const userName = computed(() => (c.value.userName as string) ?? '王主任');
const showTools = computed(() => c.value.showTools !== false);
const color = computed(() => (c.value.color as string) ?? '#00e0ff');
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

function select(i: number) {
  activeIndex.value = i;
  emit('change', i, tabs.value[i]);
}

const initial = computed(() => userName.value.slice(0, 1));
</script>

<template>
  <div class="dt-topbar" :style="{ '--top-color': color }">
    <!-- 左侧装饰 + 标题 -->
    <div class="dt-topbar__brand">
      <span class="dt-topbar__mark" />
      <span class="dt-topbar__mark dt-topbar__mark--2" />
      <div class="dt-topbar__titles">
        <div class="dt-topbar__title">{{ title }}</div>
        <div v-if="subtitle" class="dt-topbar__subtitle">{{ subtitle }}</div>
      </div>
    </div>

    <!-- 中部导航 -->
    <nav class="dt-topbar__nav">
      <button
        v-for="(tab, i) in tabs"
        :key="tab"
        class="dt-topbar__tab"
        :class="{ active: i === activeIndex }"
        @click="select(i)"
      >
        <span>{{ tab }}</span>
      </button>
    </nav>

    <!-- 右侧工具 + 用户 -->
    <div v-if="showTools" class="dt-topbar__tools">
      <span class="dt-topbar__icon" title="通知">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      </span>
      <span class="dt-topbar__icon" title="全屏">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
        >
          <path
            d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"
          />
        </svg>
      </span>
      <span class="dt-topbar__icon" title="帮助">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8v.4M12 17h.01" />
        </svg>
      </span>
      <span class="dt-topbar__icon" title="设置">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 7 2.6h.1A1.6 1.6 0 0 0 8.7 1V1a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 15 2.6"
          />
        </svg>
      </span>
      <span class="dt-topbar__divider" />
      <span class="dt-topbar__user">
        <span class="dt-topbar__avatar">{{ initial }}</span>
        <span class="dt-topbar__name">{{ userName }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.dt-topbar {
  --top-color: #00e0ff;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  padding: 0 22px;
  background: linear-gradient(180deg, rgba(4, 16, 32, 0.85), rgba(4, 16, 32, 0));
  pointer-events: none;
}
.dt-topbar > * {
  pointer-events: auto;
}

/* ---------- 左侧品牌区 ---------- */
.dt-topbar__brand {
  position: relative;
  flex: 0 0 auto;
  min-width: 460px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding-left: 6px;
}
.dt-topbar__mark {
  position: absolute;
  left: -22px;
  top: 50%;
  width: 10px;
  height: 46px;
  transform: translateY(-50%) skewX(-18deg);
  background: linear-gradient(180deg, var(--top-color), rgba(0, 224, 255, 0.15));
  box-shadow: 0 0 12px var(--top-color);
}
.dt-topbar__mark--2 {
  left: -6px;
  height: 30px;
  opacity: 0.55;
}
.dt-topbar__titles {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.dt-topbar__title {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: 3px;
  line-height: 1.15;
  background: linear-gradient(180deg, #ffffff 10%, #8fe9ff 90%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 10px rgba(0, 224, 255, 0.55));
  animation: title-glow 3.4s ease-in-out infinite;
}
@keyframes title-glow {
  0%,
  100% {
    filter: drop-shadow(0 0 8px rgba(0, 224, 255, 0.45));
  }
  50% {
    filter: drop-shadow(0 0 16px rgba(0, 224, 255, 0.75));
  }
}
.dt-topbar__subtitle {
  margin-top: 2px;
  font-size: 10px;
  letter-spacing: 2px;
  color: #4d8fb5;
}

/* ---------- 中部导航 ---------- */
.dt-topbar__nav {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.dt-topbar__tab {
  position: relative;
  min-width: 104px;
  height: 34px;
  padding: 0 20px;
  border: 1px solid rgba(0, 224, 255, 0.35);
  border-radius: 4px;
  background: linear-gradient(180deg, rgba(10, 40, 68, 0.7), rgba(6, 22, 40, 0.55));
  color: #8fc6e6;
  font-size: 14px;
  letter-spacing: 1px;
  cursor: pointer;
  transform: skewX(-12deg);
  transition: all 0.2s;
}
.dt-topbar__tab > span {
  display: inline-block;
  transform: skewX(12deg);
}
.dt-topbar__tab:hover {
  color: #e6f9ff;
  border-color: rgba(0, 224, 255, 0.7);
}
.dt-topbar__tab.active {
  color: #04121f;
  font-weight: 700;
  border-color: transparent;
  background: linear-gradient(180deg, #7ff0ff, #00c8f0);
  box-shadow: 0 0 16px rgba(0, 224, 255, 0.55);
  animation: top-active 2.4s ease-in-out infinite;
}
@keyframes top-active {
  0%,
  100% {
    box-shadow: 0 0 12px rgba(0, 224, 255, 0.4);
  }
  50% {
    box-shadow: 0 0 24px rgba(0, 224, 255, 0.75);
  }
}

/* ---------- 右侧工具区 ---------- */
.dt-topbar__tools {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 14px;
  color: #8fc6e6;
}
.dt-topbar__icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  color: #86b8d8;
}
.dt-topbar__icon svg {
  width: 100%;
  height: 100%;
}
.dt-topbar__divider {
  width: 1px;
  height: 22px;
  background: rgba(0, 224, 255, 0.28);
}
.dt-topbar__user {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.dt-topbar__avatar {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(140deg, #00e0ff, #1a6fa8);
  color: #04121f;
  font-size: 13px;
  font-weight: 700;
}
.dt-topbar__name {
  font-size: 14px;
  color: #cfeaff;
  letter-spacing: 1px;
}
</style>
