<script setup lang="ts">
/**
 * 脚本编辑弹窗：等宽字体 + 行号，用于编写沙箱执行的转换/事件脚本。
 * 安全边界说明：脚本在受限作用域运行，仅能访问入参，无法访问 window/document/全局对象。
 */
import { computed, ref, watch } from 'vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseTextarea from '@/components/ui/BaseTextarea.vue';

const props = defineProps<{ visible: boolean; initial?: string }>();
const emit = defineEmits<{ 'update:visible': [v: boolean]; save: [script: string] }>();

const code = ref(props.initial ?? '');
const lineNumbers = computed(() =>
  code.value.split('\n').map((_, i) => i + 1).join('\n'),
);

watch(
  () => props.visible,
  (v) => {
    if (v) code.value = props.initial ?? '';
  },
);

function close(): void {
  emit('update:visible', false);
}
function save(): void {
  emit('save', code.value);
  emit('update:visible', false);
}
</script>

<template>
  <BaseModal
    :visible="visible"
    title="脚本编辑器（沙箱执行）"
    width="720"
    confirm-text="保存脚本"
    @update:visible="emit('update:visible', $event)"
    @confirm="save"
    @cancel="close"
  >
    <div class="script-editor">
      <div class="se-gutter"><pre>{{ lineNumbers }}</pre></div>
      <BaseTextarea v-model="code" :rows="16" class="se-input" placeholder="// 仅可访问入参 data，return 处理结果" />
    </div>
    <p class="se-note">
      安全边界：脚本在受限作用域执行，仅能访问入参（如 data），无法访问 window / document / 全局对象，也不允许网络与 DOM 操作。
    </p>
  </BaseModal>
</template>

<style scoped>
.script-editor {
  display: flex;
  border: 1px solid #e3e8ef;
  border-radius: 6px;
  overflow: hidden;
  background: #0b1220;
}
.se-gutter {
  background: #111a2e;
  color: #4b6584;
  padding: 8px 8px 8px 10px;
  font-family: monospace;
  font-size: 13px;
  line-height: 1.6;
  text-align: right;
  user-select: none;
  border-right: 1px solid #1f2d3d;
}
.se-gutter pre {
  margin: 0;
}
.se-input {
  flex: 1;
  border: none;
  background: transparent;
  color: #cfe8ff;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
}
.se-input :deep(textarea) {
  background: transparent !important;
  color: #cfe8ff !important;
  font-family: monospace !important;
}
.se-note {
  font-size: 12px;
  color: #868e96;
  margin: 10px 0 0;
  line-height: 1.5;
}
</style>
