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
  const pct = Math.min(value.value / max, 1);

  return {
    backgroundColor: 'transparent',
    title: {
      text: `${value.value}`,
      subtext: unit,
      left: 'center',
      top: '38%',
      itemGap: 2,
      textStyle: { color: '#ffffff', fontSize: 26, fontWeight: 'bold' },
      subtextStyle: { color: '#9fc7ff', fontSize: 12 },
    },
    series: [
      {
        type: 'gauge' as const,
        radius: '92%',
        center: ['50%', '55%'],
        startAngle: 90,
        endAngle: -270,
        pointer: { show: false },
        progress: { show: false },
        axisLine: {
          lineStyle: {
            width: 10,
            color: [[1, 'rgba(0,234,255,0.12)']],
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: { show: false },
      },
      {
        type: 'gauge' as const,
        radius: '82%',
        center: ['50%', '55%'],
        startAngle: 90,
        endAngle: -270,
        pointer: { show: false },
        progress: {
          show: true,
          width: 14,
          roundCap: true,
          itemStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 1,
              y2: 1,
              colorStops: [
                { offset: 0, color },
                { offset: 1, color: lighten(color, 30) },
              ],
            },
            shadowBlur: 10,
            shadowColor: color,
          },
        },
        axisLine: { lineStyle: { width: 14, color: [[1, 'rgba(58,90,122,0.35)']] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: { show: false },
        data: [{ value: value.value }],
        animationDuration: 1000,
      },
      {
        type: 'pie' as const,
        radius: ['68%', '70%'],
        center: ['50%', '55%'],
        silent: true,
        label: { show: false },
        data: [
          { value: pct, itemStyle: { color: color } },
          { value: 1 - pct, itemStyle: { color: 'transparent' } },
        ],
      },
    ],
  };
}

function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  const f = (n: number) => Math.min(255, Math.round(n + (255 - n) * (amount / 100)));
  return `rgb(${f(rgb.r)}, ${f(rgb.g)}, ${f(rgb.b)})`;
}

function hexToRgb(hex: string) {
  const m =
    /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex) ||
    /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
  if (!m) return { r: 0, g: 234, b: 255 };
  const f = (i: number) => parseInt(m[i].length === 1 ? m[i] + m[i] : m[i], 16);
  return { r: f(1), g: f(2), b: f(3) };
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
