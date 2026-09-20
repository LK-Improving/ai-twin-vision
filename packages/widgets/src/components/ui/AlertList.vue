<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';

type AlertItem = {
  level: 'red' | 'orange' | 'yellow' | string;
  name: string;
  time?: string;
  status?: string;
};

const props = defineProps<{
  config?: Record<string, unknown>;
  data?: unknown;
}>();

const c = computed(() => props.config ?? {});
const items = computed<AlertItem[]>(() => {
  if (Array.isArray(props.data) && props.data.length > 0) return props.data as AlertItem[];
  const rows = c.value.items;
  if (Array.isArray(rows)) return rows as AlertItem[];
  return [
    {
      level: 'red',
      name: '化工园区 A 区废水排放 COD 超标 30%',
      time: '2024-05-15 09:20:00',
      status: '未处理',
    },
    {
      level: 'orange',
      name: '3 号厂房消防系统压力异常',
      time: '2024-05-15 09:23:45',
      status: '处理中',
    },
    {
      level: 'yellow',
      name: '西区空气监测站 PM2.5 轻度超标',
      time: '2024-05-15 09:30:12',
      status: '已处理',
    },
  ];
});

const autoScroll = computed(() => !!c.value.autoScroll);
const listRef = ref<HTMLElement | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  if (!autoScroll.value || !listRef.value) return;
  const el = listRef.value;
  timer = setInterval(() => {
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
      el.scrollTop = 0;
    } else {
      el.scrollTop += 1;
    }
  }, 60);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

const colors: Record<string, string> = {
  red: '#ff4d4f',
  orange: '#ff8c00',
  yellow: '#fadb14',
};
const labels: Record<string, string> = {
  red: '红色预警',
  orange: '橙色预警',
  yellow: '黄色预警',
};
</script>

<template>
  <div ref="listRef" class="dt-alert-list">
    <div
      v-for="(item, i) in items"
      :key="i"
      class="dt-alert-list__item"
      :style="{ borderLeftColor: colors[item.level] ?? item.level, animationDelay: i * 0.06 + 's' }"
    >
      <span
        class="dt-alert-list__badge"
        :class="{ 'is-red': item.level === 'red' }"
        :style="{ background: colors[item.level] ?? item.level }"
      >
        {{ labels[item.level] ?? item.level }}
      </span>
      <span class="dt-alert-list__name">{{ item.name }}</span>
      <span v-if="item.time" class="dt-alert-list__time">{{ item.time }}</span>
      <span v-if="item.status" class="dt-alert-list__status">{{ item.status }}</span>
    </div>
  </div>
</template>

<style scoped>
.dt-alert-list {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding-right: 4px;
  box-sizing: border-box;
}
.dt-alert-list__item {
  position: relative;
  display: grid;
  grid-template-columns: 72px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  border-left: 3px solid #ff4d4f;
  font-size: 12px;
  color: #cfe8ff;
  animation: alert-in 0.4s ease both;
}
@keyframes alert-in {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
/* 红色告警徽标呼吸脉冲，凸显紧急程度 */
.dt-alert-list__badge.is-red {
  animation: alert-pulse 1.6s ease-in-out infinite;
}
@keyframes alert-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(255, 77, 79, 0.6);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(255, 77, 79, 0);
  }
}
.dt-alert-list__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 3px;
  color: #06162c;
  font-size: 11px;
  font-weight: 600;
}
.dt-alert-list__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dt-alert-list__time {
  color: #7aa3c9;
  font-size: 11px;
}
.dt-alert-list__status {
  grid-column: 4;
  padding: 2px 6px;
  border-radius: 3px;
  color: #06162c;
  background: rgba(0, 234, 255, 0.18);
  font-size: 11px;
}
</style>
