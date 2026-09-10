<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
  }>(),
  { rows: 3, disabled: false },
);

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

function onInput(e: Event): void {
  const target = e.target as HTMLTextAreaElement;
  emit('update:modelValue', target.value);
}
</script>

<template>
  <textarea
    :value="modelValue"
    :placeholder="placeholder"
    :rows="rows"
    :disabled="disabled"
    class="w-full resize-y rounded-lg border border-[#e5e9f0] bg-white px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-primary-400 focus:shadow-glow disabled:cursor-not-allowed disabled:bg-surface-muted"
    @input="onInput"
  />
</template>
