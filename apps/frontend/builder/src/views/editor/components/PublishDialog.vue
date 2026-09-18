<script setup lang="ts">
/**
 * 发布弹窗：填写变更日志，并展示发布前校验清单。
 * 确认后调用 store.publish(changeLog)。
 */
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useEditorStore } from '@/stores/editor';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseTextarea from '@/components/ui/BaseTextarea.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import IconBase from '@/components/ui/IconBase.vue';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ 'update:visible': [v: boolean] }>();

const store = useEditorStore();
const { sceneDetail, components, page, engineConfig, dirty, saving } = storeToRefs(store);
const changeLog = ref('');

watch(
  () => props.visible,
  (v) => {
    if (v) changeLog.value = '';
  },
);

/** 发布前校验清单 */
const checks = computed(() => [
  { label: '场景已命名', ok: !!sceneDetail.value?.name },
  { label: '画布已保存（无未保存改动）', ok: !dirty.value },
  { label: '至少存在一个三维实体或 2D 组件', ok: components.value.length > 0 || page.value.nodes.length > 0 },
  { label: '引擎配置有效（含画布尺寸）', ok: !!(engineConfig.value.canvas?.width && engineConfig.value.canvas?.height) },
]);
const allPass = computed(() => checks.value.every((c) => c.ok));

async function confirm(): Promise<void> {
  const ok = await store.publish(changeLog.value);
  if (ok) emit('update:visible', false);
}
function close(): void {
  emit('update:visible', false);
}
</script>

<template>
  <BaseModal
    :visible="visible"
    title="发布场景"
    width="480"
    :loading="saving"
    confirm-text="确认发布"
    @update:visible="emit('update:visible', $event)"
    @confirm="confirm"
    @cancel="close"
  >
    <div class="publish-dialog">
      <div class="pd-block">
        <label>变更日志</label>
        <BaseTextarea v-model:model-value="changeLog" :rows="3" placeholder="描述本次发布的主要变更…" />
      </div>

      <div class="pd-block">
        <label>发布前校验</label>
        <ul class="check-list">
          <li v-for="c in checks" :key="c.label" :class="{ ok: c.ok, fail: !c.ok }">
            <IconBase :name="c.ok ? 'check' : 'close'" :size="14" />
            <span>{{ c.label }}</span>
          </li>
        </ul>
        <p v-if="!allPass" class="pd-warn">存在未通过项，建议先完成校验再发布（仍可直接发布）。</p>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.publish-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pd-block label {
  display: block;
  font-size: 13px;
  color: #425466;
  margin-bottom: 6px;
}
.check-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.check-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 0;
  font-size: 13px;
}
.check-list li.ok {
  color: #0ca678;
}
.check-list li.fail {
  color: #e8590c;
}
.pd-warn {
  font-size: 12px;
  color: #e8590c;
  margin: 4px 0 0;
}
</style>
