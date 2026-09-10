<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps<{
  config?: Record<string, unknown>;
  data?: unknown;
}>();

const c = computed(() => props.config ?? {});
const columns = computed<Array<{ key: string; label: string }>>(
  () => (c.value.columns as Array<{ key: string; label: string }>) ?? [],
);
const rows = computed<Array<Record<string, unknown>>>(() => {
  if (Array.isArray(props.data) && props.data.length) {
    return props.data as Array<Record<string, unknown>>;
  }
  return (c.value.rows as Array<Record<string, unknown>>) ?? [];
});
const zebra = computed(() => c.value.zebra !== false);
const autoScroll = computed(() => !!c.value.autoScroll);
const scrollSpeed = computed(() => Number(c.value.scrollSpeed ?? 30));

const viewport = ref<HTMLElement | null>(null);
let timer: number | undefined;

function tick(): void {
  const el = viewport.value;
  if (!el) return;
  if (el.scrollHeight - el.clientHeight <= 1) return;
  el.scrollTop += 1;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight) {
    el.scrollTop = 0;
  }
}

onMounted(() => {
  if (autoScroll.value && rows.value.length > 0) {
    timer = window.setInterval(tick, Math.max(10, 1000 / scrollSpeed.value));
  }
});

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
});

const headerStyle = { color: '#9fc7ff', background: 'rgba(0,234,255,0.08)' };
</script>

<template>
  <div class="dt-table">
    <div class="dt-table__head" :style="headerStyle">
      <div v-for="col in columns" :key="col.key" class="dt-table__cell">{{ col.label }}</div>
    </div>
    <div ref="viewport" class="dt-table__body">
      <div
        v-for="(row, i) in rows"
        :key="i"
        class="dt-table__row"
        :class="{ stripe: zebra && i % 2 === 1 }"
      >
        <div v-for="col in columns" :key="col.key" class="dt-table__cell">
          {{ row[col.key] }}
        </div>
      </div>
      <div v-if="rows.length === 0" class="dt-table__empty">暂无数据</div>
    </div>
  </div>
</template>

<style scoped>
.dt-table {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: #cfe8ff;
  font-size: 13px;
  box-sizing: border-box;
}
.dt-table__head,
.dt-table__row {
  display: flex;
}
.dt-table__head {
  border-bottom: 1px solid rgba(0, 234, 255, 0.3);
}
.dt-table__cell {
  flex: 1;
  padding: 6px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dt-table__body {
  flex: 1;
  overflow-y: auto;
}
.dt-table__row.stripe {
  background: rgba(255, 255, 255, 0.04);
}
.dt-table__empty {
  padding: 16px;
  text-align: center;
  color: #6b89a8;
}
</style>
