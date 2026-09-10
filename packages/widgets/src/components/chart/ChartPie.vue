<script setup lang="ts">
import { ref } from 'vue';
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
  const nameField = (c.nameField as string) ?? 'name';
  const valueField = (c.valueField as string) ?? 'value';
  const colors = ((c.colors as string[]) ?? [
    '#00eaff',
    '#36cfc9',
    '#ffcc00',
    '#ff7a45',
    '#9254de',
  ]) as string[];
  const doughnut = !!c.doughnut;

  const data = raw.map((d) => ({
    name: String(d[nameField]),
    value: Number(d[valueField]) || 0,
  }));

  return {
    backgroundColor: 'transparent',
    color: colors,
    title: c.title
      ? { text: c.title as string, textStyle: { color: '#cfe8ff', fontSize: 14 } }
      : undefined,
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: c.legend
      ? { orient: 'vertical', right: 8, top: 'center', textStyle: { color: '#cfe8ff' } }
      : undefined,
    series: [
      {
        name: c.title ? (c.title as string) : '占比',
        type: 'pie',
        radius: doughnut ? ['45%', '70%'] : '65%',
        center: ['45%', '52%'],
        itemStyle: { borderColor: 'rgba(11,18,32,0.6)', borderWidth: 2 },
        label: { color: '#cfe8ff' },
        data,
      },
    ],
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
