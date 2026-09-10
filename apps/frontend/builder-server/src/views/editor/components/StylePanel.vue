<script setup lang="ts">
/**
 * 样式面板：位置尺寸、透明度、背景、边框圆角阴影、字体、层级操作与对齐分布。
 */
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useEditorStore } from '@/stores/editor';
import type { WidgetNode, WidgetRect } from '@dt/shared-types';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseNumberInput from '@/components/ui/BaseNumberInput.vue';
import BaseSlider from '@/components/ui/BaseSlider.vue';
import ColorPicker from '@/components/ui/ColorPicker.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import IconBase from '@/components/ui/IconBase.vue';
import EmptyState from '@/components/ui/EmptyState.vue';

const store = useEditorStore();
const { selectedNode, page } = storeToRefs(store);

const node = computed<WidgetNode | null>(
  () => (selectedNode.value?.kind === '2D' ? (selectedNode.value.data as WidgetNode) : null),
);

function setRect(patch: Record<string, unknown>): void {
  if (!node.value) return;
  store.updateNode(node.value.id, { rect: patch as any }, 'style');
}
function setStyle(key: string, value: unknown): void {
  if (!node.value) return;
  const style = { ...(node.value.style ?? {}) };
  if (value === '' || value == null) delete style[key];
  else style[key] = value as string | number;
  store.updateNode(node.value.id, { style }, 'style');
}
function styleVal(key: string, fallback = ''): string {
  return node.value?.style?.[key] != null ? String(node.value.style[key]) : fallback;
}

// -------------------------------------------------------------- 层级操作
function siblings(): WidgetNode[] {
  return page.value.nodes;
}
function zOrder(action: 'up' | 'down' | 'top' | 'bottom'): void {
  if (!node.value) return;
  const list = siblings()
    .map((n) => ({ id: n.id, z: n.rect.zIndex ?? 0 }))
    .sort((a, b) => a.z - b.z);
  const idx = list.findIndex((x) => x.id === node.value!.id);
  if (idx < 0) return;
  let target = idx;
  if (action === 'up') target = Math.min(list.length - 1, idx + 1);
  else if (action === 'down') target = Math.max(0, idx - 1);
  else if (action === 'top') target = list.length - 1;
  else target = 0;
  // 重新分配连续 zIndex，避免冲突
  const reordered = [...list];
  const [it] = reordered.splice(idx, 1);
  reordered.splice(target, 0, it);
  reordered.forEach((x, i) => {
    if (x.id !== node.value!.id) store.updateNode(x.id, { rect: { zIndex: i + 1 } as unknown as WidgetRect }, 'z');
  });
  setRect({ zIndex: target + 1 });
}

const alignButtons = [
  { type: 'left', icon: 'align-left', label: '左对齐' },
  { type: 'right', icon: 'align-right', label: '右对齐' },
  { type: 'top', icon: 'align-top', label: '顶对齐' },
  { type: 'bottom', icon: 'align-bottom', label: '底对齐' },
  { type: 'centerH', icon: 'align-center-h', label: '水平居中' },
  { type: 'centerV', icon: 'align-center-v', label: '垂直居中' },
  { type: 'distributeH', icon: 'distribute-h', label: '水平等间距' },
  { type: 'distributeV', icon: 'distribute-v', label: '垂直等间距' },
] as const;
</script>

<template>
  <div class="style-panel">
    <EmptyState v-if="!node" text="请选择一个组件以编辑样式" />

    <template v-else>
      <section class="sp-block">
        <h4>位置与尺寸</h4>
        <div class="sp-grid2">
          <label>X<input type="number" :value="node.rect.x" @input="setRect({ x: +($event.target as HTMLInputElement).value })" /></label>
          <label>Y<input type="number" :value="node.rect.y" @input="setRect({ y: +($event.target as HTMLInputElement).value })" /></label>
          <label>宽<input type="number" :value="node.rect.width" @input="setRect({ width: +($event.target as HTMLInputElement).value })" /></label>
          <label>高<input type="number" :value="node.rect.height" @input="setRect({ height: +($event.target as HTMLInputElement).value })" /></label>
          <label>旋转<input type="number" :value="node.rect.rotate ?? 0" @input="setRect({ rotate: +($event.target as HTMLInputElement).value })" /></label>
          <label>层级Z<input type="number" :value="node.rect.zIndex ?? 1" @input="setRect({ zIndex: +($event.target as HTMLInputElement).value })" /></label>
        </div>
      </section>

      <section class="sp-block">
        <h4>外观</h4>
        <div class="sp-row"><span>透明度</span><BaseSlider :model-value="+(styleVal('opacity', '1'))" :min="0" :max="1" :step="0.01" class="flex1" @update:model-value="(v:number)=>setStyle('opacity', String(v))" /></div>
        <div class="sp-row"><span>背景</span><ColorPicker :model-value="styleVal('background', '#ffffff')" class="flex1" @update:model-value="(v: string | number | null)=>setStyle('background', String(v ?? ''))" /></div>
        <div class="sp-row"><span>圆角</span><BaseNumberInput :model-value="+(styleVal('borderRadius', '0'))" :min="0" class="flex1" @update:model-value="(v:number)=>setStyle('borderRadius', String(v))" /></div>
        <div class="sp-row"><span>边框色</span><ColorPicker :model-value="styleVal('borderColor', '#000000')" class="flex1" @update:model-value="(v: string | number | null)=>setStyle('borderColor', String(v ?? ''))" /></div>
        <div class="sp-row"><span>阴影</span><BaseInput :model-value="styleVal('boxShadow','')" placeholder="如 0 2px 8px rgba(0,0,0,.2)" size="sm" class="flex1" @update:model-value="(v: string | number | null)=>setStyle('boxShadow', String(v ?? ''))" /></div>
      </section>

      <section class="sp-block">
        <h4>字体</h4>
        <div class="sp-row"><span>字号</span><BaseNumberInput :model-value="+(styleVal('fontSize', '14'))" :min="8" :max="120" class="flex1" @update:model-value="(v:number)=>setStyle('fontSize', String(v))" /></div>
        <div class="sp-row"><span>颜色</span><ColorPicker :model-value="styleVal('color', '#333333')" class="flex1" @update:model-value="(v: string | number | null)=>setStyle('color', String(v ?? ''))" /></div>
        <div class="sp-row"><span>字重</span>
          <BaseSelect :model-value="styleVal('fontWeight', 'normal')" :options="[{label:'常规',value:'normal'},{label:'加粗',value:'bold'},{label:'中等',value:'500'}]" size="sm" class="flex1" @update:model-value="(v: string | number | null)=>setStyle('fontWeight', String(v ?? ''))" />
        </div>
        <div class="sp-row"><span>行高</span><BaseNumberInput :model-value="+(styleVal('lineHeight', '1.4'))" :min="0.8" :max="3" :step="0.1" class="flex1" @update:model-value="(v:number)=>setStyle('lineHeight', String(v))" /></div>
        <div class="sp-row"><span>对齐</span>
          <BaseSelect :model-value="styleVal('textAlign', 'left')" :options="[{label:'左',value:'left'},{label:'中',value:'center'},{label:'右',value:'right'}]" size="sm" class="flex1" @update:model-value="(v: string | number | null)=>setStyle('textAlign', String(v ?? ''))" />
        </div>
      </section>

      <section class="sp-block">
        <h4>层级</h4>
        <div class="sp-btn-row">
          <BaseButton type="ghost" size="sm" icon="arrow-up" @click="zOrder('up')">上移一层</BaseButton>
          <BaseButton type="ghost" size="sm" icon="arrow-down" @click="zOrder('down')">下移一层</BaseButton>
          <BaseButton type="ghost" size="sm" icon="to-top" @click="zOrder('top')">置顶</BaseButton>
          <BaseButton type="ghost" size="sm" icon="to-bottom" @click="zOrder('bottom')">置底</BaseButton>
        </div>
      </section>

      <section class="sp-block">
        <h4>对齐与分布</h4>
        <div class="sp-align-grid">
          <BaseButton v-for="b in alignButtons" :key="b.type" type="ghost" size="sm" :title="b.label" @click="store.alignNodes(b.type)">
            <IconBase :name="b.icon" :size="15" />
          </BaseButton>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.style-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sp-block {
  border: 1px solid #eef1f5;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 12px;
}
.sp-block h4 {
  margin: 0 0 8px;
  font-size: 13px;
  color: #425466;
}
.sp-grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.sp-grid2 label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #495057;
}
.sp-grid2 input {
  width: 100%;
  border: 1px solid #e3e8ef;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
}
.sp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #495057;
}
.sp-row > span:first-child {
  width: 56px;
  flex-shrink: 0;
}
.flex1 {
  flex: 1;
}
.sp-btn-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.sp-align-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
</style>
