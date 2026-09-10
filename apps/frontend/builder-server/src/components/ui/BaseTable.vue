<script setup lang="ts">
import { useSlots } from 'vue';
import EmptyState from './EmptyState.vue';
import SpinnerBox from './SpinnerBox.vue';

export interface TableColumn {
  key: string;
  title: string;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
}

const props = withDefaults(
  defineProps<{
    columns: TableColumn[];
    /** 行数据类型由业务侧决定，插槽内自行断言（用 unknown 便于 as 收敛） */
    data: unknown[];
    loading?: boolean;
    rowKey?: string;
    emptyText?: string;
  }>(),
  { loading: false, rowKey: 'id', emptyText: '暂无数据' },
);

const slots = useSlots();

function hasCellSlot(key: string): boolean {
  return Boolean(slots[`cell-${key}`]);
}

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function alignClass(align?: 'left' | 'center' | 'right'): string {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}
</script>

<template>
  <div class="relative overflow-hidden rounded-xl border border-[#eef2f7] bg-white">
    <div class="max-h-[70vh] overflow-auto">
      <table class="w-full border-collapse text-sm">
        <thead class="sticky top-0 z-10 bg-surface-soft text-ink-soft">
          <tr>
            <th
              v-for="col in columns"
              :key="col.key"
              class="whitespace-nowrap border-b border-[#eef2f7] px-3 py-2.5 font-medium"
              :class="alignClass(col.align)"
              :style="col.width ? { width: typeof col.width === 'number' ? col.width + 'px' : col.width } : {}"
            >
              {{ col.title }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in data"
            :key="String((row as Record<string, unknown>)?.[rowKey] ?? index)"
            class="border-b border-[#f2f5f9] transition-colors last:border-0 hover:bg-surface-soft"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              class="px-3 py-2.5 align-middle text-ink"
              :class="alignClass(col.align)"
            >
              <slot v-if="hasCellSlot(col.key)" :name="`cell-${col.key}`" :row="row" :index="index" />
              <template v-else>{{ cellText((row as Record<string, unknown>)?.[col.key]) }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading && data.length === 0" class="py-10">
      <EmptyState :text="emptyText" />
    </div>

    <div
      v-if="loading"
      class="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/60"
    >
      <SpinnerBox size="md" text="加载中" />
    </div>
  </div>
</template>
