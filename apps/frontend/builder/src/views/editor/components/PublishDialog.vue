<script setup lang="ts">
/**
 * 发布弹窗：填写变更日志，并展示发布前校验清单。
 * 确认后调用 store.publish(changeLog)。
 */
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useEditorStore } from '@/stores/editor';
import { useToast } from '@/composables/useToast';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseTextarea from '@/components/ui/BaseTextarea.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import IconBase from '@/components/ui/IconBase.vue';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ 'update:visible': [v: boolean] }>();

const store = useEditorStore();
const { sceneDetail, components, page, engineConfig, dirty, saving, publishToken } =
  storeToRefs(store);
const changeLog = ref('');
const toast = useToast();

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
  {
    label: '至少存在一个三维实体或 2D 组件',
    ok: components.value.length > 0 || page.value.nodes.length > 0,
  },
  {
    label: '引擎配置有效（含画布尺寸）',
    ok: !!(engineConfig.value.canvas?.width && engineConfig.value.canvas?.height),
  },
]);
const allPass = computed(() => checks.value.every((c) => c.ok));

/** 发布成功后留在弹窗内展示访问链接，方便直接复制 */
const published = ref(false);

const screenUrl = computed(() => {
  const token = publishToken.value;
  if (!token) return '';
  return `${window.location.origin}/screen/${token}`;
});

async function confirm(): Promise<void> {
  const ok = await store.publish(changeLog.value);
  // 没有拿到令牌时不阻塞关闭（例如后端尚未升级）
  if (ok && publishToken.value) {
    published.value = true;
    return;
  }
  if (ok) emit('update:visible', false);
}

async function copyLink(): Promise<void> {
  if (!screenUrl.value) return;
  try {
    await navigator.clipboard.writeText(screenUrl.value);
    toast.success('链接已复制');
  } catch {
    toast.error('复制失败，请手动选择链接');
  }
}

function close(): void {
  published.value = false;
  emit('update:visible', false);
}
</script>

<template>
  <BaseModal
    :visible="visible"
    :title="published ? '发布成功' : '发布场景'"
    width="480"
    :loading="saving"
    :confirm-text="published ? '完成' : '确认发布'"
    :cancel-text="published ? null : '取消'"
    @update:visible="emit('update:visible', $event)"
    @confirm="published ? close() : confirm()"
    @cancel="close"
  >
    <div v-if="published" class="publish-dialog">
      <div class="pd-success">
        <IconBase name="check" :size="16" />
        <span>场景已发布，可通过下面的链接公开访问（无需登录）。</span>
      </div>
      <div class="pd-link">
        <input readonly :value="screenUrl" @focus="($event.target as HTMLInputElement).select()" />
        <BaseButton size="sm" icon="copy" @click="void copyLink()">复制</BaseButton>
      </div>
      <p class="pd-tip">链接中的令牌在首次发布时生成，重新发布不会改变，已发出的链接持续有效。</p>
    </div>
    <div v-else class="publish-dialog">
      <div class="pd-block">
        <label>变更日志</label>
        <BaseTextarea
          v-model:model-value="changeLog"
          :rows="3"
          placeholder="描述本次发布的主要变更…"
        />
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
.pd-success {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #e6fcf5;
  color: #0ca678;
  font-size: 13px;
}
.pd-link {
  display: flex;
  gap: 8px;
  align-items: center;
}
.pd-link input {
  flex: 1;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #e5e9f0;
  border-radius: 8px;
  font-size: 12px;
  color: #425466;
  background: #f8fafc;
}
.pd-tip {
  font-size: 12px;
  color: #8492a6;
  margin: 0;
}
</style>
