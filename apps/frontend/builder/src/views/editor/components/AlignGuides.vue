<script setup lang="ts">
/**
 * 对齐参考线：拖动节点时根据与其它节点的边缘/中心对齐显示辅助线。
 * 使用屏幕坐标渲染（由设计坐标 × scale + offset 反算）。
 */
import { computed } from 'vue';

interface GuideLine {
  orientation: 'v' | 'h';
  position: number;
}

const props = defineProps<{
  guides: GuideLine[];
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}>();

const lines = computed(() =>
  props.guides.map((g) => {
    if (g.orientation === 'v') {
      const x = props.offsetX + g.position * props.scale;
      return { key: `v-${g.position}`, style: { left: `${x}px`, top: '0', width: '1px', height: `${props.height}px` } };
    }
    const y = props.offsetY + g.position * props.scale;
    return { key: `h-${g.position}`, style: { left: '0', top: `${y}px`, width: `${props.width}px`, height: '1px' } };
  }),
);
</script>

<template>
  <div class="align-guides">
    <div v-for="l in lines" :key="l.key" class="guide-line" :style="l.style" />
  </div>
</template>

<style scoped>
.align-guides {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.guide-line {
  position: absolute;
  background: #ff7a45;
  opacity: 0.8;
}
</style>
