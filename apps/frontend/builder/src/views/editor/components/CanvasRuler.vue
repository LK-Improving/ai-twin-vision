<script setup lang="ts">
/**
 * 画布标尺（顶部水平 + 左侧垂直）。
 * 反映缩放与平移：每 100 设计像素一个主刻度，刻度文字标注设计坐标。
 */
import { computed } from 'vue';

const props = defineProps<{
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  canvasWidth: number;
  canvasHeight: number;
}>();

const SIZE = 18;
const STEP = 100; // 设计坐标步长

/** 生成水平刻度（按视口宽度循环，支持任意平移/负坐标） */
const vTicks = computed(() => {
  const out: Array<{ x: number; label: string }> = [];
  const stepPx = STEP * props.scale;
  if (stepPx < 8) return out;
  const startDesign = Math.floor(-props.offsetX / props.scale / STEP) * STEP;
  // 无限画布：结束刻度由视口宽度推导，不能再用 canvasWidth 当边界
  const endDesign = startDesign + props.width / props.scale + STEP;
  for (let d = startDesign; d <= endDesign; d += STEP) {
    const x = props.offsetX + d * props.scale;
    if (x < SIZE || x > props.width) continue;
    out.push({ x, label: String(d) });
  }
  return out;
});

const hTicks = computed(() => {
  const out: Array<{ y: number; label: string }> = [];
  const stepPx = STEP * props.scale;
  if (stepPx < 8) return out;
  const startDesign = Math.floor(-props.offsetY / props.scale / STEP) * STEP;
  const endDesign = startDesign + props.height / props.scale + STEP;
  for (let d = startDesign; d <= endDesign; d += STEP) {
    const y = props.offsetY + d * props.scale;
    if (y < SIZE || y > props.height) continue;
    out.push({ y, label: String(d) });
  }
  return out;
});
</script>

<template>
  <div class="canvas-ruler" :style="{ pointerEvents: 'none' }">
    <!-- 水平标尺 -->
    <div
      class="ruler ruler-h"
      :style="{ left: SIZE + 'px', width: width - SIZE + 'px', height: SIZE + 'px' }"
    >
      <div
        v-for="t in vTicks"
        :key="'v' + t.x"
        class="tick"
        :style="{ left: t.x - offsetX - SIZE + 'px' }"
      >
        <span class="tick-label">{{ t.label }}</span>
      </div>
    </div>
    <!-- 垂直标尺 -->
    <div
      class="ruler ruler-v"
      :style="{ top: SIZE + 'px', height: height - SIZE + 'px', width: SIZE + 'px' }"
    >
      <div
        v-for="t in hTicks"
        :key="'h' + t.y"
        class="tick tick-v"
        :style="{ top: t.y - offsetY - SIZE + 'px' }"
      >
        <span class="tick-label">{{ t.label }}</span>
      </div>
    </div>
    <!-- 左上角 -->
    <div class="ruler-corner" :style="{ width: SIZE + 'px', height: SIZE + 'px' }" />
  </div>
</template>

<style scoped>
.canvas-ruler {
  position: absolute;
  inset: 0;
  z-index: 5;
}
.ruler {
  position: absolute;
  background: rgba(255, 255, 255, 0.85);
  border-right: 1px solid #e3e8ef;
  border-bottom: 1px solid #e3e8ef;
  overflow: hidden;
}
.ruler-h {
  top: 0;
  border-top: 1px solid #e3e8ef;
}
.ruler-v {
  left: 0;
  border-left: 1px solid #e3e8ef;
}
.ruler-corner {
  position: absolute;
  left: 0;
  top: 0;
  background: #f1f3f5;
  border-right: 1px solid #e3e8ef;
  border-bottom: 1px solid #e3e8ef;
}
.tick {
  position: absolute;
  top: 0;
  width: 1px;
  height: 6px;
  background: #adb5bd;
}
.tick-v {
  left: 0;
  width: 6px;
  height: 1px;
}
.tick-label {
  position: absolute;
  top: 6px;
  left: 2px;
  font-size: 9px;
  color: #868e96;
  white-space: nowrap;
}
.tick-v .tick-label {
  top: 2px;
  left: 7px;
}
</style>
