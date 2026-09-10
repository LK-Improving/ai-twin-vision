import * as echarts from 'echarts';
import { onMounted, onBeforeUnmount, watch, type Ref } from 'vue';

export type EChartsOptionBuilder = () => echarts.EChartsOption;

/**
 * ECharts 组合式封装。
 *
 * 统一处理：初始化、容器尺寸变化（window resize）、配置变化（watch 后 setOption）、卸载 dispose。
 * 组件只需传入「构建 option 的函数」与「需要监听的依赖 getter」。
 */
export function useEcharts(
  elRef: Ref<HTMLElement | null>,
  buildOption: EChartsOptionBuilder,
  watchSource?: () => unknown,
) {
  let chart: echarts.ECharts | null = null;

  const resize = () => chart?.resize();

  onMounted(() => {
    if (elRef.value) {
      chart = echarts.init(elRef.value, undefined, { renderer: 'canvas' });
      chart.setOption(buildOption());
    }
    window.addEventListener('resize', resize);
  });

  if (watchSource) {
    watch(
      watchSource,
      () => {
        if (chart) {
          // 第二个参数 true：不合并，按新配置完全重绘
          chart.setOption(buildOption(), true);
        }
      },
      { deep: true },
    );
  }

  onBeforeUnmount(() => {
    window.removeEventListener('resize', resize);
    chart?.dispose();
    chart = null;
  });

  return {
    resize,
    getInstance: () => chart,
  };
}
