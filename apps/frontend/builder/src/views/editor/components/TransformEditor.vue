<script setup lang="ts">
/**
 * 三维实体 Transform 编辑器。
 * 宏观场景编辑 cartographic（经纬高），微观场景编辑 position（局部坐标）。
 * 同时支持旋转（欧拉角）与缩放（统一比例或三轴）。
 */
import { computed } from 'vue';
import type { Transform, Vector3Like } from '@dt/shared-types';
import BaseNumberInput from '@/components/ui/BaseNumberInput.vue';
import BaseSlider from '@/components/ui/BaseSlider.vue';

const props = defineProps<{ modelValue: Transform }>();
const emit = defineEmits<{ change: [value: Transform] }>();

const isGeo = computed(() => !!props.modelValue.cartographic);

function emitNext(patch: Partial<Transform>): void {
  emit('change', { ...props.modelValue, ...patch });
}

const carto = computed(() => props.modelValue.cartographic ?? { longitude: 0, latitude: 0, height: 0 });
const pos = computed(() => props.modelValue.position ?? { x: 0, y: 0, z: 0 });
const rot = computed<Vector3Like>(() => props.modelValue.rotation ?? { x: 0, y: 0, z: 0 });
const scaleVal = computed(() => {
  const s = props.modelValue.scale;
  if (typeof s === 'number') return s;
  if (s) return s.x;
  return 1;
});

function setCarto(field: 'longitude' | 'latitude' | 'height', v: number): void {
  emitNext({ cartographic: { ...carto.value, [field]: v } });
}
function setPos(field: keyof Vector3Like, v: number): void {
  emitNext({ position: { ...pos.value, [field]: v } });
}
function setRot(field: keyof Vector3Like, v: number): void {
  emitNext({ rotation: { ...rot.value, [field]: v } });
}
function setScale(v: number): void {
  emitNext({ scale: v });
}
</script>

<template>
  <div class="transform-editor">
    <h4 class="te-title">{{ isGeo ? '地理坐标（经纬高）' : '局部坐标（米）' }}</h4>

    <template v-if="isGeo">
      <div class="te-row"><span>经度</span><BaseNumberInput :model-value="carto.longitude" :step="0.0001" class="flex1" @update:model-value="(v:number)=>setCarto('longitude', v)" /></div>
      <div class="te-row"><span>纬度</span><BaseNumberInput :model-value="carto.latitude" :step="0.0001" class="flex1" @update:model-value="(v:number)=>setCarto('latitude', v)" /></div>
      <div class="te-row"><span>高程</span><BaseNumberInput :model-value="carto.height" class="flex1" @update:model-value="(v:number)=>setCarto('height', v)" /></div>
    </template>
    <template v-else>
      <div class="te-row"><span>X</span><BaseNumberInput :model-value="pos.x" class="flex1" @update:model-value="(v:number)=>setPos('x', v)" /></div>
      <div class="te-row"><span>Y</span><BaseNumberInput :model-value="pos.y" class="flex1" @update:model-value="(v:number)=>setPos('y', v)" /></div>
      <div class="te-row"><span>Z</span><BaseNumberInput :model-value="pos.z" class="flex1" @update:model-value="(v:number)=>setPos('z', v)" /></div>
    </template>

    <h4 class="te-title">旋转（度）</h4>
    <div class="te-row"><span>偏航 X</span><BaseNumberInput :model-value="rot.x" class="flex1" @update:model-value="(v:number)=>setRot('x', v)" /></div>
    <div class="te-row"><span>俯仰 Y</span><BaseNumberInput :model-value="rot.y" class="flex1" @update:model-value="(v:number)=>setRot('y', v)" /></div>
    <div class="te-row"><span>翻滚 Z</span><BaseNumberInput :model-value="rot.z" class="flex1" @update:model-value="(v:number)=>setRot('z', v)" /></div>

    <h4 class="te-title">缩放</h4>
    <div class="te-row">
      <span>比例</span>
      <BaseSlider :model-value="scaleVal" :min="0.01" :max="100" :step="0.01" class="flex1" @update:model-value="(v:number)=>setScale(v)" />
      <span class="te-val">{{ scaleVal.toFixed(2) }}</span>
    </div>
  </div>
</template>

<style scoped>
.transform-editor {
  border: 1px solid #eef1f5;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 12px;
}
.te-title {
  font-size: 12px;
  color: #868e96;
  margin: 8px 0 6px;
  font-weight: 600;
}
.te-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
  color: #495057;
}
.te-row > span:first-child {
  width: 56px;
  flex-shrink: 0;
}
.flex1 {
  flex: 1;
}
.te-val {
  width: 40px;
  text-align: right;
  color: #868e96;
}
</style>
