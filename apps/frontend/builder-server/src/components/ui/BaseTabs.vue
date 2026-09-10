<script setup lang="ts">
import IconBase from './IconBase.vue';

export interface TabItem {
  key: string;
  label: string;
  icon?: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    items: TabItem[];
  }>(),
  {},
);

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

function select(key: string): void {
  emit('update:modelValue', key);
}
</script>

<template>
  <div class="inline-flex items-center gap-1 rounded-xl bg-surface-muted p-1">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors"
      :class="
        modelValue === item.key
          ? 'bg-white text-primary-600 shadow-card'
          : 'text-ink-soft hover:text-ink'
      "
      @click="select(item.key)"
    >
      <IconBase v-if="item.icon" :name="item.icon" :size="15" />
      {{ item.label }}
    </button>
  </div>
</template>
