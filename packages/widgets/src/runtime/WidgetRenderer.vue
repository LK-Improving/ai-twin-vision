<script setup lang="ts">
import { computed, type Component } from 'vue';
import type { WidgetNode } from '@dt/shared-types';
defineOptions({ name: 'WidgetRenderer' });
import { ComponentType } from '@dt/shared-types';
import { getWidget } from '../registry';

const props = defineProps<{
  node: WidgetNode;
  runtime?: boolean;
  data?: unknown;
  /**
   * 由父容器（编辑器命中区）提供位置与尺寸时置 true：组件铺满父级，
   * 不再按 rect 自定位。避免父容器与自身各定位一次导致 rect 被叠加两遍（错位）。
   * 预览层保持 false，按设计坐标 rect 绝对定位。
   */
  fill?: boolean;
}>();

/** 查注册表拿到组件定义 */
const def = computed(() => getWidget(props.node.type));
const comp = computed<Component | undefined>(() => def.value?.component);

/** 合并默认属性与节点属性 */
const mergedProps = computed<Record<string, unknown>>(() => {
  const base = def.value?.defaultProps ?? {};
  return { ...base, ...(props.node.props ?? {}) };
});

/** 由 rect 生成绝对定位样式，并叠加 style 覆盖与 visible */
const style = computed<Record<string, string>>(() => {
  const r = props.node.rect ?? { x: 0, y: 0, width: 100, height: 100 };
  // fill=true：父级命中区已按 rect 定位，这里铺满父级即可；否则按 rect 自定位。
  const s: Record<string, string> = props.fill
    ? { position: 'absolute', inset: '0', zIndex: String(r.zIndex ?? 1) }
    : {
        position: 'absolute',
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        zIndex: String(r.zIndex ?? 1),
      };
  if (r.rotate) s.transform = `rotate(${r.rotate}deg)`;
  if (props.node.visible === false) s.display = 'none';
  const override = props.node.style ?? {};
  for (const [k, v] of Object.entries(override)) s[k] = String(v);
  return s;
});

/** 仅容器类组件（PanelBox）渲染子节点 */
const hasContainerChildren = computed(
  () => props.node.type === ComponentType.PANEL && !!props.node.children?.length,
);
</script>

<template>
  <div v-if="comp" :style="style" class="dt-widget">
    <component :is="comp" :config="mergedProps" :data="data">
      <template v-if="hasContainerChildren">
        <WidgetRenderer
          v-for="child in node.children"
          :key="child.id"
          :node="child"
          :runtime="runtime"
          :data="data"
        />
      </template>
    </component>
  </div>
  <div v-else :style="style" class="dt-widget dt-widget--missing">
    未知组件类型：{{ node.type }}
  </div>
</template>

<style scoped>
.dt-widget {
  box-sizing: border-box;
}
.dt-widget--missing {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ff7a45;
  font-size: 12px;
  background: rgba(255, 122, 69, 0.1);
  border: 1px dashed rgba(255, 122, 69, 0.5);
}
</style>
