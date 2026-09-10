<script setup lang="ts">
import { ref } from 'vue';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { useEcharts } from '../../composables/useEcharts';

const props = defineProps<{
  config?: Record<string, unknown>;
  data?: unknown;
}>();

const el = ref<HTMLElement | null>(null);

function buildOption(): EChartsOption {
  const c = props.config ?? {};
  const raw = (Array.isArray(props.data) ? props.data : ((c.data as unknown[]) ?? [])) as Array<
    Record<string, unknown>
  >;
  const xField = (c.xField as string) ?? 'name';
  const yField = (c.yField as string) ?? 'value';
  const legend = !!c.legend;
  const horizontal = !!c.horizontal;
  const colors = ((c.colors as string[]) ?? ['#00eaff', '#36cfc9', '#ffcc00']) as string[];
  const grid = (c.grid as Record<string, unknown>) ?? { left: 44, right: 24, top: 44, bottom: 32 };

  const names = raw.map((d) => d[xField]);
  const values = raw.map((d) => Number(d[yField]) || 0);

  const barSeries = {
    name: yField,
    type: 'bar' as const,
    data: values,
    itemStyle: {
      borderRadius: [4, 4, 0, 0],
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: colors[0] ?? '#00eaff' },
        { offset: 1, color: 'rgba(0,234,255,0.2)' },
      ]),
    },
  };

  return {
    backgroundColor: 'transparent',
    color: colors,
    title: c.title
      ? { text: c.title as string, textStyle: { color: '#cfe8ff', fontSize: 14 } }
      : undefined,
    tooltip: { trigger: 'axis' },
    legend: legend ? { data: [yField], textStyle: { color: '#cfe8ff' }, top: 8 } : undefined,
    grid: grid as echarts.EChartsOption['grid'],
    xAxis: horizontal
      ? {
          type: 'value' as const,
          axisLine: { lineStyle: { color: '#3a5a7a' } },
          axisLabel: { color: '#9fc7ff' },
          splitLine: { lineStyle: { color: 'rgba(58,90,122,0.3)' } },
        }
      : {
          type: 'category' as const,
          data: names as string[],
          axisLine: { lineStyle: { color: '#3a5a7a' } },
          axisLabel: { color: '#9fc7ff' },
        },
    yAxis: horizontal
      ? {
          type: 'category' as const,
          data: names as string[],
          axisLine: { lineStyle: { color: '#3a5a7a' } },
          axisLabel: { color: '#9fc7ff' },
        }
      : {
          type: 'value' as const,
          axisLine: { lineStyle: { color: '#3a5a7a' } },
          axisLabel: { color: '#9fc7ff' },
          splitLine: { lineStyle: { color: 'rgba(58,90,122,0.3)' } },
        },
    series: [horizontal ? { ...barSeries, yAxisIndex: 0, xAxisIndex: 0 } : barSeries],
  };
}

const { resize } = useEcharts(el, buildOption, () => [props.config, props.data]);
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
