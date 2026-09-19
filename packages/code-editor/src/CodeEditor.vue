<script setup lang="ts">
/**
 * 嵌入式代码编辑器（CodeMirror 6 封装）。
 *
 * 职责边界：只管「编辑器实例生命周期 + v-model 同步」，不掺业务规则；
 * 脚本安全校验仍由宿主（@dt/data-processor 的静态守卫）负责，避免两处各判一次。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    /** 语法高亮语言，目前只内置 javascript（沙箱脚本即 JS） */
    language?: 'javascript' | 'none';
    placeholder?: string;
    readOnly?: boolean;
    /** 编辑器高度，支持任意 CSS 长度 */
    height?: string;
  }>(),
  { language: 'javascript', placeholder: '', readOnly: false, height: '320px' },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;

/** 深色主题：贴合原脚本编辑器的暗色底，避免出现两层背景 */
const darkTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: '#0b1220', color: '#cfe8ff', fontSize: '13px' },
  '.cm-scroller': { fontFamily: "'SFMono-Regular', Consolas, monospace", lineHeight: '1.6' },
  '.cm-content': { caretColor: '#7cc4ff', padding: '8px 0' },
  '.cm-gutters': {
    backgroundColor: '#111a2e',
    color: '#4b6584',
    border: 'none',
    borderRight: '1px solid #1f2d3d',
  },
  '.cm-activeLine': { backgroundColor: 'rgba(124,196,255,.06)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(124,196,255,.10)' },
  '.cm-selectionBackground, ::selection': { backgroundColor: 'rgba(25,113,194,.35)' },
  '&.cm-focused': { outline: 'none' },
});

function buildExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLine(),
    drawSelection(),
    history(),
    indentOnInput(),
    bracketMatching(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorView.lineWrapping,
    darkTheme,
    EditorView.editable.of(!props.readOnly),
    EditorState.readOnly.of(props.readOnly),
    ...(props.language === 'javascript' ? [javascript({ jsx: false })] : []),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) emit('update:modelValue', update.state.doc.toString());
    }),
  ];
}

onMounted(() => {
  if (!host.value) return;
  view = new EditorView({
    state: EditorState.create({ doc: props.modelValue ?? '', extensions: buildExtensions() }),
    parent: host.value,
  });
});

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});

// 外部改动（如清空模板、载入已存脚本）才需要同步进文档；
// 比对 doc 可避免「打字 → emit → 回写 → 光标跳动」的死循环。
watch(
  () => props.modelValue,
  (value) => {
    const next = value ?? '';
    if (!view || view.state.doc.toString() === next) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
  },
);

defineExpose({
  /** 供宿主聚焦编辑器（打开弹窗时用） */
  focus: (): void => view?.focus(),
});
</script>

<template>
  <div ref="host" class="dt-code-editor" :style="{ height }" :data-placeholder="placeholder" />
</template>

<style scoped>
.dt-code-editor {
  border: 1px solid #1f2d3d;
  border-radius: 6px;
  overflow: hidden;
  background: #0b1220;
}
.dt-code-editor :deep(.cm-editor) {
  height: 100%;
}
</style>
