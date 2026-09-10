<script setup lang="ts">
import { ref, computed } from 'vue';
import type { EChartsOption } from 'echarts';
import { useEcharts } from '../../composables/useEcharts';

const props = defineProps<{
  config?: Record<string, unknown>;
  data?: unknown;
}>();

const el = ref<HTMLElement | null>(null);

const value = computed<number>(() => {
  const c = props.config ?? {};
  if (Array.isArray(props.data) && props.data.length > 0) {
    const d = props.data[0] as Record<string, unknown>;
    const vf = (c.valueField as string) ?? 'value';
    if (typeof d[vf] === 'number') return d[vf] as number;
  }
  return Number(c.value ?? 0) || 0;
});

function buildOption(): EChartsOption {
  const c = props.config ?? {};
  const max = Number(c.max ?? 100);
  const unit = (c.unit as string) ?? '';
  const color = (c.color as string) ?? '#00eaff';

  return {
    backgroundColor: 'transparent',
    series: [{
      {
        type: 'gauge' as const,
        min: 0,
        max,
        radius: '88%',
        center: ['50%', '58%'],
        progress: { show: true, width: 12, itemStyle: { color } },
        axisLine: { lineStyle: { width: 12, color: [[1, 'rgba(58,90,122,0.4)']] } },
        axisTick: { show: false },
        splitLine: { length: 10, lineStyle: { color: '#3a5a7a' } },
        axisLabel: { color: '#9fc7ff', fontSize: 10, distance: 12 },
        pointer: { itemStyle: { color } },
        anchor: { show: true, size: 8, itemStyle: { color } },
        detail: {
          valueAnimation: true,
          formatter: `{value} ${unit}`,
          color: '#cfe8ff',
          fontSize: 22,
          offsetCenter: [0, '70%'],
        },
        title: {
          show: !!c.title,
          text: (c.title as string) ?? '',
          color: '#9fc7ff',
          fontSize: 12,
          offsetCenter: [0, '100%'],
        },
        data: [{ value: value.value, name: (c.title as string) ?? '' }],
      },
    ],
  };
}

const { resize } = useEcharts(el, buildOption, () => [props.config, props.data, value.value]);
defineExpose({ resize });
</script>

<template>
  <div ref="el" class="dt-chart"></div>
</template>

<style scoped>
.dt-chart {
  width: 100%;
  height: 100%;
}
</style>
