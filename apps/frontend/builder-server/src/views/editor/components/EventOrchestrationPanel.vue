<script setup lang="ts">
/**
 * 事件编排面板：为选中节点配置「触发事件 → 动作序列」。
 * 支持新增/删除绑定、增删/排序/启停动作、按 ActionType 渲染差异化参数表单、
 * 条件表达式与延迟；CAMERA_FLY_TO 可「取当前视角」，RUN_SCRIPT 用脚本弹窗编辑。
 */
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useEditorStore } from '@/stores/editor';
import { getWidget } from '@dt/widgets';
import { ActionType } from '@dt/shared-types';
import type { EventBinding, EventAction, WidgetNode } from '@dt/shared-types';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseTextarea from '@/components/ui/BaseTextarea.vue';
import BaseSwitch from '@/components/ui/BaseSwitch.vue';
import BaseNumberInput from '@/components/ui/BaseNumberInput.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import ColorPicker from '@/components/ui/ColorPicker.vue';
import IconBase from '@/components/ui/IconBase.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ScriptEditorDialog from './ScriptEditorDialog.vue';
import { useToast } from '@/composables/useToast';

const store = useEditorStore();
const toast = useToast();
const { selectedNode, page, currentCamera } = storeToRefs(store);

const node = computed<WidgetNode | null>(
  () => (selectedNode.value?.kind === '2D' ? (selectedNode.value.data as WidgetNode) : null),
);

const bindings = computed<EventBinding[]>(() =>
  node.value ? page.value.events.filter((e) => e.sourceId === node.value!.id) : [],
);

/** 可触发的事件（组件声明 + 通用事件） */
const eventOptions = computed(() => {
  const def = node.value ? getWidget(node.value.type) : null;
  const emits = (def?.configSchema.emits ?? []).map((e) => ({ label: e.label, value: e.name }));
  const common = [
    { label: '点击', value: 'click' },
    { label: '双击', value: 'dblclick' },
    { label: '悬停', value: 'hover' },
    { label: '数据变化', value: 'dataChange' },
    { label: '实体拾取', value: 'entityPick' },
  ];
  const seen = new Set<string>();
  return [...emits, ...common].filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
});

const actionTypeOptions = [
  { label: '调用组件动作', value: ActionType.CALL_COMPONENT },
  { label: '显示/隐藏组件', value: ActionType.TOGGLE_VISIBLE },
  { label: '相机飞行', value: ActionType.CAMERA_FLY_TO },
  { label: '高亮实体', value: ActionType.HIGHLIGHT_ENTITY },
  { label: '打开面板', value: ActionType.OPEN_PANEL },
  { label: '页面跳转', value: ActionType.NAVIGATE },
  { label: '请求接口', value: ActionType.REQUEST_API },
  { label: '设置变量', value: ActionType.SET_VARIABLE },
  { label: '执行脚本', value: ActionType.RUN_SCRIPT },
];

/** 可作为目标/高亮的对象（3D 实体 + 2D 节点） */
const targetOptions = computed(() => [
  ...store.components.map((c) => ({ label: `${c.name || c.componentType}（3D）`, value: c.id })),
  ...page.value.nodes.map((n) => ({ label: `${n.name}（2D）`, value: n.id })),
]);
const panelOptions = computed(() =>
  page.value.nodes
    .filter((n) => n.type === 'PANEL')
    .map((n) => ({ label: n.name, value: n.id })),
);
const variableOptions = computed(() =>
  (page.value.variables ?? []).map((v) => ({ label: v.label || v.key, value: v.key })),
);

const showScript = ref(false);
const scriptBinding = ref<{ bId: string; aId: string } | null>(null);

function addBinding(event: string): void {
  if (!node.value) return;
  store.addEventBinding(node.value.id, event);
}
function removeBinding(id: string): void {
  store.removeEventBinding(id);
}
function addAction(bindingId: string): void {
  store.addEventAction(bindingId, { type: ActionType.CALL_COMPONENT });
}
function removeAction(bindingId: string, actionId: string): void {
  store.removeEventAction(bindingId, actionId);
}
function moveAction(bindingId: string, from: number, to: number): void {
  store.moveEventAction(bindingId, from, to);
}

/** 更新某个动作的 params（合并并写回） */
function updateParams(bindingId: string, action: EventAction, patch: Record<string, unknown>): void {
  store.updateEventAction(bindingId, action.id, { params: { ...(action.params ?? {}), ...patch } });
}

/** 取当前相机视角写入 CAMERA_FLY_TO 参数 */
function captureView(bindingId: string, action: EventAction): void {
  updateParams(bindingId, action, { view: { ...currentCamera.value } });
  toast.success('已写入当前相机视角');
}

function openScript(bindingId: string, action: EventAction): void {
  scriptBinding.value = { bId: bindingId, aId: action.id };
  showScript.value = true;
}
function onScriptSaved(script: string): void {
  if (scriptBinding.value) {
    const b = page.value.events.find((e) => e.id === scriptBinding.value!.bId);
    const a = b?.actions.find((x) => x.id === scriptBinding.value!.aId);
    if (b && a) updateParams(b.id, a, { script });
  }
  showScript.value = false;
}
</script>

<template>
  <div class="event-panel">
    <EmptyState v-if="!node" text="请选择一个组件以编排事件" />

    <template v-else>
      <div class="ep-toolbar">
        <span class="ep-node">节点：{{ node.name }}</span>
        <BaseSelect
          :model-value="''"
          :options="eventOptions"
          placeholder="选择触发事件…"
          size="sm"
          class="flex1"
          @update:model-value="(v: string | number | null)=>addBinding(String(v ?? ''))"
        />
      </div>

      <div v-if="!bindings.length" class="ep-empty">暂无事件绑定，从上方选择触发事件开始编排。</div>

      <div v-for="b in bindings" :key="b.id" class="ep-binding">
        <div class="ep-b-head">
          <BaseSwitch :model-value="b.enabled !== false" size="sm" @update:model-value="(v:boolean)=>store.updateEventBinding(b.id,{enabled:v})" />
          <span class="ep-event">{{ eventOptions.find(o=>o.value===b.event)?.label || b.event }}</span>
          <BaseButton type="ghost" size="sm" icon="plus" @click="addAction(b.id)">动作</BaseButton>
          <IconBase name="trash" :size="16" class="icon-btn" @click="removeBinding(b.id)" />
        </div>

        <div v-for="(a, i) in b.actions" :key="a.id" class="ep-action">
          <div class="ep-a-head">
            <span class="ep-a-idx">#{{ i + 1 }}</span>
            <BaseSelect
              :model-value="a.type"
              :options="actionTypeOptions"
              size="sm"
              class="flex1"
              @update:model-value="(v: string | number | null)=>store.updateEventAction(b.id,a.id,{type:String(v ?? '') as ActionType})"
            />
            <IconBase name="arrow-up" :size="14" class="icon-btn" @click="moveAction(b.id,i,i-1)" />
            <IconBase name="arrow-down" :size="14" class="icon-btn" @click="moveAction(b.id,i,i+1)" />
            <IconBase name="trash" :size="14" class="icon-btn" @click="removeAction(b.id,a.id)" />
          </div>

          <!-- 参数表单：按 ActionType 渲染 -->
          <div class="ep-a-body">
            <template v-if="a.type === ActionType.CALL_COMPONENT || a.type === ActionType.TOGGLE_VISIBLE">
              <div class="ep-row"><span>目标</span>
                <BaseSelect :model-value="String(a.params?.targetId ?? '')" :options="targetOptions" placeholder="选择目标" size="sm" class="flex1" @update:model-value="(v: string | number | null)=>updateParams(b.id,a,{targetId:String(v ?? '')})" />
              </div>
              <div v-if="a.type === ActionType.CALL_COMPONENT" class="ep-row"><span>动作名</span>
                <BaseInput :model-value="(a.params?.action as string)" placeholder="如 refresh" size="sm" class="flex1" @update:model-value="(v: string | number | null)=>updateParams(b.id,a,{action:String(v ?? '')})" />
              </div>
            </template>

            <template v-else-if="a.type === ActionType.CAMERA_FLY_TO">
              <BaseButton type="ghost" size="sm" icon="camera" @click="captureView(b.id,a)">取当前视角</BaseButton>
              <div class="ep-row"><span>经度</span><BaseNumberInput :model-value="(a.params?.view as any)?.longitude" :step="0.0001" class="flex1" @update:model-value="(v:number)=>updateParams(b.id,a,{view:{...(a.params?.view as any),longitude:v}})" /></div>
              <div class="ep-row"><span>纬度</span><BaseNumberInput :model-value="(a.params?.view as any)?.latitude" :step="0.0001" class="flex1" @update:model-value="(v:number)=>updateParams(b.id,a,{view:{...(a.params?.view as any),latitude:v}})" /></div>
              <div class="ep-row"><span>高程</span><BaseNumberInput :model-value="(a.params?.view as any)?.height" class="flex1" @update:model-value="(v:number)=>updateParams(b.id,a,{view:{...(a.params?.view as any),height:v}})" /></div>
            </template>

            <template v-else-if="a.type === ActionType.HIGHLIGHT_ENTITY">
              <div class="ep-row"><span>实体</span>
                <BaseSelect :model-value="String(a.params?.targetId ?? '')" :options="targetOptions" placeholder="选择实体" size="sm" class="flex1" @update:model-value="(v: string | number | null)=>updateParams(b.id,a,{targetId:String(v ?? '')})" />
              </div>
              <div class="ep-row"><span>颜色</span>
                <ColorPicker :model-value="(a.params?.color as string) || '#ffcc00'" class="flex1" @update:model-value="(v: string | number | null)=>updateParams(b.id,a,{color:String(v ?? '')})" />
              </div>
            </template>

            <template v-else-if="a.type === ActionType.OPEN_PANEL">
              <div class="ep-row"><span>面板</span>
                <BaseSelect :model-value="String(a.params?.targetId ?? '')" :options="panelOptions" placeholder="选择面板" size="sm" class="flex1" @update:model-value="(v: string | number | null)=>updateParams(b.id,a,{targetId:String(v ?? '')})" />
              </div>
            </template>

            <template v-else-if="a.type === ActionType.NAVIGATE">
              <div class="ep-row"><span>URL</span>
                <BaseInput :model-value="(a.params?.url as string)" placeholder="https://…" size="sm" class="flex1" @update:model-value="(v: string | number | null)=>updateParams(b.id,a,{url:String(v ?? '')})" />
              </div>
            </template>

            <template v-else-if="a.type === ActionType.REQUEST_API">
              <div class="ep-row">
                <span>方法</span>
                <BaseSelect :model-value="(a.params?.method as string) || 'GET'" :options="[{label:'GET',value:'GET'},{label:'POST',value:'POST'},{label:'PUT',value:'PUT'},{label:'DELETE',value:'DELETE'}]" size="sm" class="flex1" @update:model-value="(v: string | number | null)=>updateParams(b.id,a,{method:String(v ?? '')})" />
              </div>
              <div class="ep-row"><span>地址</span>
                <BaseInput :model-value="(a.params?.url as string)" placeholder="/api/…" size="sm" class="flex1" @update:model-value="(v: string | number | null)=>updateParams(b.id,a,{url:String(v ?? '')})" />
              </div>
              <BaseTextarea :model-value="(a.params?.body as string)" :rows="3" placeholder="请求体 JSON" @update:model-value="(v: string | number | null)=>updateParams(b.id,a,{body:String(v ?? '')})" />
            </template>

            <template v-else-if="a.type === ActionType.SET_VARIABLE">
              <div class="ep-row"><span>变量</span>
                <BaseSelect :model-value="String(a.params?.variable ?? '')" :options="variableOptions" placeholder="选择变量" size="sm" class="flex1" @update:model-value="(v: string | number | null)=>updateParams(b.id,a,{variable:String(v ?? '')})" />
              </div>
              <div class="ep-row"><span>取值</span>
                <BaseInput :model-value="(a.params?.value as string)" placeholder="变量值" size="sm" class="flex1" @update:model-value="(v: string | number | null)=>updateParams(b.id,a,{value:String(v ?? '')})" />
              </div>
            </template>

            <template v-else-if="a.type === ActionType.RUN_SCRIPT">
              <BaseButton type="ghost" size="sm" icon="code" @click="openScript(b.id,a)">编辑脚本</BaseButton>
              <div class="ep-script-preview">{{ (a.params?.script as string) || '（未编写）' }}</div>
            </template>

            <!-- 通用：条件与延迟 -->
            <div class="ep-row"><span>条件</span>
              <BaseInput :model-value="a.condition ?? ''" placeholder="如 data.value > 10" size="sm" class="flex1" @update:model-value="(v: string | number | null)=>store.updateEventAction(b.id,a.id,{condition:String(v ?? '')})" />
            </div>
            <div class="ep-row"><span>延迟(ms)</span>
              <BaseNumberInput :model-value="a.delay ?? 0" :min="0" :step="100" class="flex1" @update:model-value="(v:number)=>store.updateEventAction(b.id,a.id,{delay:v})" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <ScriptEditorDialog v-model:visible="showScript" :initial="(page.events.find(e=>e.id===scriptBinding?.bId)?.actions.find(a=>a.id===scriptBinding?.aId)?.params?.script as string || '')" @save="onScriptSaved" />
  </div>
</template>

<style scoped>
.event-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ep-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ep-node {
  font-size: 12px;
  color: #868e96;
}
.flex1 {
  flex: 1;
}
.ep-empty {
  font-size: 12px;
  color: #adb5bd;
  padding: 12px 0;
}
.ep-binding {
  border: 1px solid #eef1f5;
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 10px;
}
.ep-b-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.ep-event {
  font-weight: 600;
  font-size: 13px;
  color: #1f2d3d;
}
.ep-action {
  border: 1px dashed #e3e8ef;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 8px;
  background: #fafcff;
}
.ep-a-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.ep-a-idx {
  font-size: 12px;
  color: #00b8d9;
  font-weight: 700;
}
.ep-a-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ep-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #495057;
}
.ep-row > span:first-child {
  width: 56px;
  flex-shrink: 0;
}
.icon-btn {
  color: #adb5bd;
  cursor: pointer;
}
.icon-btn:hover {
  color: #e03131;
}
.ep-script-preview {
  font-family: monospace;
  font-size: 11px;
  color: #868e96;
  background: #f1f3f5;
  border-radius: 4px;
  padding: 6px;
  max-height: 60px;
  overflow: auto;
  white-space: pre-wrap;
}
</style>
