<script setup lang="ts">
import { computed } from 'vue';
import IconBase from './IconBase.vue';
import BaseSelect from './BaseSelect.vue';

const props = withDefaults(
  defineProps<{
    page: number;
    limit: number;
    total: number;
  }>(),
  {},
);

const emit = defineEmits<{
  (e: 'update:page', value: number): void;
  (e: 'update:limit', value: number): void;
}>();

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.limit)));
const start = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.limit + 1));
const end = computed(() => Math.min(props.total, props.page * props.limit));

// 计算可见页码（最多 7 个，靠近边缘时折叠）
const pages = computed<number[]>(() => {
  const tp = totalPages.value;
  const cur = props.page;
  if (tp <= 7) return Array.from({ length: tp }, (_, i) => i + 1);
  const arr: number[] = [1];
  const left = Math.max(2, cur - 1);
  const right = Math.min(tp - 1, cur + 1);
  if (left > 2) arr.push(-1);
  for (let i = left; i <= right; i += 1) arr.push(i);
  if (right < tp - 1) arr.push(-1);
  arr.push(tp);
  return arr;
});

const limitOptions = [
  { label: '10 条/页', value: 10 },
  { label: '20 条/页', value: 20 },
  { label: '50 条/页', value: 50 },
  { label: '100 条/页', value: 100 },
];

function go(p: number): void {
  if (p < 1 || p > tp()) return;
  emit('update:page', p);
}
function tp(): number {
  return totalPages.value;
}
function onLimit(v: string | number | null): void {
  if (v === null) return;
  emit('update:limit', Number(v));
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft">
    <div class="flex items-center gap-2">
      <span>共 {{ total }} 条</span>
      <span v-if="total > 0">（{{ start }}-{{ end }}）</span>
    </div>
    <div class="flex items-center gap-2">
      <BaseSelect
        :model-value="limit"
        :options="limitOptions"
        size="sm"
        class="w-28"
        @update:model-value="onLimit"
      />
      <div class="inline-flex items-center gap-1">
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e5e9f0] bg-white hover:bg-surface-muted disabled:opacity-40"
          :disabled="page <= 1"
          @click="go(page - 1)"
        >
          <IconBase name="chevron-left" :size="15" />
        </button>
        <template v-for="p in pages" :key="p">
          <span v-if="p === -1" class="px-1 text-ink-muted">…</span>
          <button
            v-else
            type="button"
            class="h-8 min-w-8 rounded-lg border px-2 text-sm transition-colors"
            :class="
              p === page
                ? 'border-primary-500 bg-primary-500 text-white'
                : 'border-[#e5e9f0] bg-white hover:bg-surface-muted'
            "
            @click="go(p)"
          >
            {{ p }}
          </button>
        </template>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e5e9f0] bg-white hover:bg-surface-muted disabled:opacity-40"
          :disabled="page >= totalPages"
          @click="go(page + 1)"
        >
          <IconBase name="chevron-right" :size="15" />
        </button>
      </div>
    </div>
  </div>
</template>
