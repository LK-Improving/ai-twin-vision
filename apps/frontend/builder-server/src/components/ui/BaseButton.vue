<script setup lang="ts">
import { computed } from 'vue';
import IconBase from './IconBase.vue';

type BtnType = 'primary' | 'default' | 'text' | 'danger' | 'ghost';
type BtnSize = 'sm' | 'md' | 'lg';

const props = withDefaults(
  defineProps<{
    type?: BtnType;
    size?: BtnSize;
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
    icon?: string;
  }>(),
  { type: 'default', size: 'md', loading: false, disabled: false, block: false, icon: '' },
);

const emit = defineEmits<{ (e: 'click', ev: MouseEvent): void }>();

const typeClass = computed(() => {
  switch (props.type) {
    case 'primary':
      return 'bg-primary-500 text-white border border-primary-500 hover:bg-primary-600 active:bg-primary-700 shadow-sm';
    case 'danger':
      return 'bg-danger text-white border border-danger hover:bg-red-700 active:bg-red-800 shadow-sm';
    case 'text':
      return 'bg-transparent text-primary border border-transparent hover:bg-primary-50';
    case 'ghost':
      return 'bg-transparent text-primary border border-primary-300 hover:bg-primary-50';
    default:
      return 'bg-white text-ink border border-[#e5e9f0] hover:bg-surface-muted hover:border-primary-200';
  }
});

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'h-8 px-3 text-xs gap-1';
    case 'lg':
      return 'h-11 px-6 text-base gap-2';
    default:
      return 'h-9 px-4 text-sm gap-1.5';
  }
});

const isDisabled = computed(() => props.disabled || props.loading);

function onClick(ev: MouseEvent): void {
  if (isDisabled.value) return;
  emit('click', ev);
}
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center justify-center rounded-lg font-medium transition-colors duration-150 outline-none focus-visible:shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
    :class="[typeClass, sizeClass, block ? 'w-full' : '']"
    :disabled="isDisabled"
    @click="onClick"
  >
    <span v-if="loading" class="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
    <IconBase v-else-if="icon" :name="icon" :size="size === 'sm' ? 14 : 16" />
    <slot />
  </button>
</template>
