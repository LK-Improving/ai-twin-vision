<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

const safeValue = computed(() => /^#[0-9a-fA-F]{6}$/.test(props.modelValue) ? props.modelValue : '#1677ff');

function onColor(e: Event): void {
  const target = e.target as HTMLInputElement;
  emit('update:modelValue', target.value);
}

function onText(e: Event): void {
  const target = e.target as HTMLInputElement;
  const v = target.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) emit('update:modelValue', v);
}
</script>

<template>
  <div class="inline-flex items-center gap-2">
    <label
      class="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-[#e5e9f0]"
      :style="{ backgroundColor: safeValue }"
    >
      <input
        type="color"
        :value="safeValue"
        :disabled="disabled"
        class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        @input="onColor"
      />
    </label>
    <input
      type="text"
      :value="modelValue"
      :disabled="disabled"
      maxlength="7"
      class="h-9 w-24 rounded-lg border border-[#e5e9f0] bg-white px-2 text-sm uppercase text-ink outline-none focus:border-primary-400 focus:shadow-glow"
      @input="onText"
    />
  </div>
</template>
