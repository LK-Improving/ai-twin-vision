<script setup lang="ts">
/**
 * 右侧属性面板：四个 Tab（属性 / 数据 / 事件 / 样式）。
 * - 属性：无选中显示场景级配置；有选中按组件 configSchema 渲染 + 三维 Transform 编辑。
 * - 数据：DataBindingPanel。 事件：EventOrchestrationPanel。 样式：StylePanel。
 */
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useEditorStore } from '@/stores/editor';
import { getWidget } from '@dt/widgets';
import type { ComponentConfigSchema, Transform } from '@dt/shared-types';
import BaseTabs from '@/components/ui/BaseTabs.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import BaseSlider from '@/components/ui/BaseSlider.vue';
import BaseSwitch from '@/components/ui/BaseSwitch.vue';
import BaseNumberInput from '@/components/ui/BaseNumberInput.vue';
import ColorPicker from '@/components/ui/ColorPicker.vue';
import IconBase from '@/components/ui/IconBase.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { useToast } from '@/composables/useToast';
import PropFormRenderer from './PropFormRenderer.vue';
import TransformEditor from './TransformEditor.vue';
import DataBindingPanel from './DataBindingPanel.vue';
import EventOrchestrationPanel from './EventOrchestrationPanel.vue';
import StylePanel from './StylePanel.vue';

const store = useEditorStore();
const toast = useToast();
const { engineConfig, selectedNode, activeRightTab, currentCamera } = storeToRefs(store);

const tabs = [
  { key: 'prop', label: '属性' },
  { key: 'data', label: '数据' },
  { key: 'event', label: '事件' },
  { key: 'style', label: '样式' },
];

/** 选中节点的组件 Schema */
const selectedSchema = computed<ComponentConfigSchema | null>(() => {
  if (selectedNode.value?.kind !== '2D') return null;
  const def = getWidget(selectedNode.value.data.type);
  return def?.configSchema ?? null;
});

/** 标记场景配置已修改（进入脏状态，便于自动保存） */
function touch(): void {
  store.dirty = true;
}

/** 可选数值配置取默认值 */
function n(v: number | undefined, d = 0): number {
  return v ?? d;
}
/** 可选字符串配置取默认值 */
function s(v: string | undefined, d = ''): string {
  return v ?? d;
}
/** 可选布尔配置取默认值 */
function b(v: boolean | undefined, d = false): boolean {
  return v ?? d;
}

const fitOptions = [
  { label: '等比适应', value: 'CONTAIN' },
  { label: '铺满', value: 'FILL' },
  { label: '自适应宽度', value: 'WIDTH' },
];

// -------------------------------------------------------------- 影像/瓦片增删
function addImagery(): void {
  engineConfig.value.cesium.imageryLayers.push({
    id: `img-${Date.now()}`,
    name: '新建底图',
    provider: 'XYZ',
    url: '',
    show: true,
    alpha: 1,
  });
  touch();
}
function removeImagery(id: string): void {
  engineConfig.value.cesium.imageryLayers = engineConfig.value.cesium.imageryLayers.filter((l) => l.id !== id);
  touch();
}
function addTileset(): void {
  engineConfig.value.cesium.tilesets.push({
    id: `tiles-${Date.now()}`,
    name: '新建 3D Tiles',
    url: '',
    show: true,
  });
  touch();
}
function removeTileset(id: string): void {
  engineConfig.value.cesium.tilesets = engineConfig.value.cesium.tilesets.filter((t) => t.id !== id);
  touch();
}

function captureCamera(): void {
  store.captureCameraView(currentCamera.value);
  toast.success('已取当前相机视角');
}

// 三维 Transform 写回
function onTransformChange(t: Transform): void {
  if (selectedNode.value?.kind === '3D') {
    store.updateComponent(selectedNode.value.id, { position: t }, 'xfm');
  }
}

function onPropChange(props: Record<string, unknown>): void {
  if (selectedNode.value?.kind === '2D') {
    store.updateNode(selectedNode.value.id, { props }, 'prop');
  }
}
</script>

<template>
  <div class="property-panel">
    <BaseTabs v-model="activeRightTab" :items="tabs" />

    <div class="panel-body">
      <!-- 属性 -->
      <div v-if="activeRightTab === 'prop'" class="tab-pane">
        <!-- 无选中：场景级配置 -->
        <div v-if="!selectedNode" class="scene-config">
          <section class="cfg-block">
            <h4>Cesium 底图影像</h4>
            <div v-for="layer in engineConfig.cesium.imageryLayers" :key="layer.id" class="cfg-row">
              <BaseSwitch v-model="layer.show" size="sm" @update:model-value="touch" />
              <BaseInput v-model:model-value="layer.name" size="sm" class="flex1" @update:model-value="touch" />
              <BaseInput v-model:model-value="s(layer.url)" size="sm" placeholder="XYZ 瓦片地址" class="flex2" @update:model-value="touch" />
              <IconBase name="trash" :size="16" class="icon-btn" @click="removeImagery(layer.id)" />
            </div>
            <BaseButton type="ghost" size="sm" icon="plus" block @click="addImagery">添加底图</BaseButton>
          </section>

          <section class="cfg-block">
            <h4>地形</h4>
            <div class="cfg-row">
              <span>启用地形</span>
              <BaseSwitch v-model="engineConfig.cesium.terrain.enabled" @update:model-value="touch" />
            </div>
            <div class="cfg-row">
              <span>地形服务地址</span>
              <BaseInput v-model:model-value="s(engineConfig.cesium.terrain.url)" size="sm" class="flex2" placeholder="可选" @update:model-value="touch" />
            </div>
          </section>

          <section class="cfg-block">
            <h4>3D Tiles / 倾斜摄影</h4>
            <div v-for="t in engineConfig.cesium.tilesets" :key="t.id" class="cfg-row">
              <BaseSwitch v-model="t.show" size="sm" @update:model-value="touch" />
              <BaseInput v-model:model-value="t.name" size="sm" class="flex1" @update:model-value="touch" />
              <BaseInput v-model:model-value="s(t.url)" size="sm" class="flex2" placeholder="瓦片地址" @update:model-value="touch" />
              <IconBase name="trash" :size="16" class="icon-btn" @click="removeTileset(t.id)" />
            </div>
            <BaseButton type="ghost" size="sm" icon="plus" block @click="addTileset">添加 3D Tiles</BaseButton>
          </section>

          <section class="cfg-block">
            <h4>初始视角</h4>
            <div class="camera-readout">
              经度 {{ currentCamera.longitude.toFixed(4) }} · 纬度 {{ currentCamera.latitude.toFixed(4) }} · 高 {{ currentCamera.height.toFixed(0) }}
            </div>
            <BaseButton type="primary" size="sm" icon="camera" block @click="captureCamera">取当前相机视角</BaseButton>
          </section>

          <section class="cfg-block">
            <h4>环境特效（雨雪雾）</h4>
            <div class="cfg-row"><span>雨</span><BaseSlider :model-value="n(engineConfig.cesium.environment.rain)" :min="0" :max="1" :step="0.01" class="flex2" @update:model-value="(v:number)=>{engineConfig.cesium.environment.rain=v;touch()}" /></div>
            <div class="cfg-row"><span>雪</span><BaseSlider :model-value="n(engineConfig.cesium.environment.snow)" :min="0" :max="1" :step="0.01" class="flex2" @update:model-value="(v:number)=>{engineConfig.cesium.environment.snow=v;touch()}" /></div>
            <div class="cfg-row"><span>雾</span><BaseSlider :model-value="n(engineConfig.cesium.environment.fog)" :min="0" :max="1" :step="0.01" class="flex2" @update:model-value="(v:number)=>{engineConfig.cesium.environment.fog=v;touch()}" /></div>
          </section>

          <section class="cfg-block">
            <h4>Three.js 光照与后处理</h4>
            <div class="cfg-row"><span>环境光</span><BaseSlider :model-value="n(engineConfig.threejs.environment.ambientIntensity, 1)" :min="0" :max="3" :step="0.05" class="flex2" @update:model-value="(v:number)=>{engineConfig.threejs.environment.ambientIntensity=v;touch()}" /></div>
            <div class="cfg-row"><span>主光强</span><BaseSlider :model-value="n(engineConfig.threejs.environment.directionalIntensity, 1)" :min="0" :max="3" :step="0.05" class="flex2" @update:model-value="(v:number)=>{engineConfig.threejs.environment.directionalIntensity=v;touch()}" /></div>
            <div class="cfg-row"><span>背景色</span><ColorPicker :model-value="s(engineConfig.threejs.environment.background)" class="flex2" @update:model-value="(v:string)=>{engineConfig.threejs.environment.background=v;touch()}" /></div>
            <div class="cfg-row"><span>泛光</span><BaseSwitch :model-value="b(engineConfig.threejs.postProcessing.bloom)" @update:model-value="(v:boolean)=>{engineConfig.threejs.postProcessing.bloom=v;touch()}" /></div>
            <div class="cfg-row"><span>描边</span><BaseSwitch :model-value="b(engineConfig.threejs.postProcessing.outline)" @update:model-value="(v:boolean)=>{engineConfig.threejs.postProcessing.outline=v;touch()}" /></div>
            <div class="cfg-row"><span>环境光遮蔽</span><BaseSwitch :model-value="b(engineConfig.threejs.postProcessing.ssao)" @update:model-value="(v:boolean)=>{engineConfig.threejs.postProcessing.ssao=v;touch()}" /></div>
          </section>

          <section class="cfg-block">
            <h4>LOD 策略</h4>
            <div class="cfg-row"><span>启用 LOD</span><BaseSwitch v-model="engineConfig.threejs.lod.enabled" @update:model-value="touch" /></div>
            <div class="cfg-row"><span>降级 FPS 阈值</span><BaseNumberInput :model-value="n(engineConfig.threejs.lod.autoDegradeFps, 30)" :min="5" :max="120" class="flex1" @update:model-value="(v:number)=>{engineConfig.threejs.lod.autoDegradeFps=v;touch()}" /></div>
          </section>

          <section class="cfg-block">
            <h4>画布与性能</h4>
            <div class="cfg-row">
              <span>画布尺寸</span>
              <BaseNumberInput :model-value="n(engineConfig.canvas?.width, 1920)" :min="320" :max="7680" class="flex1" @update:model-value="(v:number)=>{if(engineConfig.canvas)engineConfig.canvas.width=v;touch()}" />
              <span>×</span>
              <BaseNumberInput :model-value="n(engineConfig.canvas?.height, 1080)" :min="240" :max="4320" class="flex1" @update:model-value="(v:number)=>{if(engineConfig.canvas)engineConfig.canvas.height=v;touch()}" />
            </div>
            <div class="cfg-row">
              <span>适配方式</span>
              <BaseSelect :model-value="s(engineConfig.canvas?.fitMode, 'CONTAIN')" :options="fitOptions" class="flex2" @update:model-value="(v: string | number | null)=>{if(engineConfig.canvas)engineConfig.canvas.fitMode=v as 'CONTAIN' | 'FILL' | 'WIDTH';touch()}" />
            </div>
            <div class="cfg-row"><span>目标 FPS</span><BaseNumberInput :model-value="n(engineConfig.performance?.targetFps, 60)" :min="10" :max="120" class="flex1" @update:model-value="(v:number)=>{if(engineConfig.performance)engineConfig.performance.targetFps=v;touch()}" /></div>
            <div class="cfg-row"><span>显存预算(MB)</span><BaseNumberInput :model-value="n(engineConfig.performance?.maxMemoryMb, 2048)" :min="256" :max="16384" :step="128" class="flex1" @update:model-value="(v:number)=>{if(engineConfig.performance)engineConfig.performance.maxMemoryMb=v;touch()}" /></div>
          </section>
        </div>

        <!-- 有选中：组件属性 + 三维变换 -->
        <div v-else class="node-config">
          <div class="sel-title">
            <IconBase :name="selectedNode.kind === '3D' ? 'cube' : 'panel'" :size="16" />
            <span>{{ selectedNode.data.name }}</span>
            <span class="sel-type">{{ selectedNode.kind === '3D' ? (selectedNode.data as any).componentType : (selectedNode.data as any).type }}</span>
          </div>

          <TransformEditor
            v-if="selectedNode.kind === '3D'"
            :model-value="(selectedNode.data as any).position"
            @change="onTransformChange"
          />
          <PropFormRenderer
            v-if="selectedSchema"
            :schema="selectedSchema"
            :model-value="(selectedNode.data as any).props"
            @change="onPropChange"
          />
          <EmptyState v-else text="该组件无可配置属性" />
        </div>
      </div>

      <!-- 数据 -->
      <div v-else-if="activeRightTab === 'data'" class="tab-pane">
        <DataBindingPanel />
      </div>

      <!-- 事件 -->
      <div v-else-if="activeRightTab === 'event'" class="tab-pane">
        <EventOrchestrationPanel />
      </div>

      <!-- 样式 -->
      <div v-else class="tab-pane">
        <StylePanel />
      </div>
    </div>
  </div>
</template>

<style scoped>
.property-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.scene-config .cfg-block {
  border: 1px solid #eef1f5;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 12px;
}
.cfg-block h4 {
  margin: 0 0 8px;
  font-size: 13px;
  color: #425466;
}
.cfg-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #495057;
}
.flex1 {
  flex: 1;
}
.flex2 {
  flex: 2;
}
.icon-btn {
  color: #adb5bd;
  cursor: pointer;
}
.icon-btn:hover {
  color: #e03131;
}
.camera-readout {
  font-size: 12px;
  color: #868e96;
  margin-bottom: 8px;
}
.node-config .sel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #1f2d3d;
}
.sel-type {
  font-size: 11px;
  color: #adb5bd;
  font-weight: 400;
}
</style>
