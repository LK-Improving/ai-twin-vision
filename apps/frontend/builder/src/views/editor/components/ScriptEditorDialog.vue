<script setup lang="ts">
/**
 * 脚本编辑弹窗：嵌入式代码编辑器（@dt/code-editor，CodeMirror 6），
 * 用于编写沙箱执行的转换/事件脚本。
 * 安全边界：脚本在独立 Worker realm 内执行，无 window/document/fetch/localStorage；
 * 对页面的影响只能经 ctx 能力白名单。本弹窗在保存前跑一次静态守卫，
 * 避免把「运行时必定被拒绝」的脚本存进场景 DSL。
 */
import { computed, ref, watch } from 'vue';
import { CodeEditor } from '@dt/code-editor';
import BaseModal from '@/components/ui/BaseModal.vue';
import { formatGuardIssues, scanScript, SCRIPT_API_DOC, SCRIPT_ENV_NOTES } from '@/sandbox';

const props = defineProps<{ visible: boolean; initial?: string }>();
const emit = defineEmits<{ 'update:visible': [v: boolean]; save: [script: string] }>();

const code = ref(props.initial ?? '');

/** 静态守卫结果：命中即禁止保存（运行时会同样被拒，先给出可读原因） */
const issues = computed(() => scanScript(code.value));
const blocked = computed(() => issues.value.length > 0);

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
  if (blocked.value) return;
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
    <CodeEditor
      v-model="code"
      height="360px"
      placeholder="// 入参 data；事件脚本可用 await ctx.xxx()，return 处理结果"
    />
    <p v-if="blocked" class="se-guard">守卫拦截：{{ formatGuardIssues(issues) }}</p>
    <details class="se-doc">
      <summary>可用能力清单（共 {{ SCRIPT_API_DOC.length }} 项）</summary>
      <ul>
        <li v-for="item in SCRIPT_API_DOC" :key="item.signature">
          <code>{{ item.signature }}</code>
          <span>—— {{ item.desc }}</span>
        </li>
      </ul>
    </details>
    <ul class="se-note">
      <li v-for="note in SCRIPT_ENV_NOTES" :key="note">{{ note }}</li>
    </ul>
  </BaseModal>
</template>

<style scoped>
.se-guard {
  font-size: 12px;
  color: #d93025;
  margin: 8px 0 0;
  line-height: 1.5;
}
.se-doc {
  margin: 10px 0 0;
  font-size: 12px;
  color: #495057;
}
.se-doc summary {
  cursor: pointer;
  color: #1971c2;
}
.se-doc ul {
  margin: 6px 0 0;
  padding-left: 18px;
  max-height: 180px;
  overflow: auto;
}
.se-doc code {
  background: #f1f3f5;
  padding: 0 4px;
  border-radius: 3px;
}
.se-note {
  font-size: 12px;
  color: #868e96;
  margin: 10px 0 0;
  padding-left: 18px;
  line-height: 1.6;
}
</style>
