<script setup lang="ts">
import IconBase from './IconBase.vue';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    title?: string;
    width?: string;
  }>(),
  { title: '', width: '420px' },
);

const emit = defineEmits<{ (e: 'update:visible', value: boolean): void }>();

function close(): void {
  emit('update:visible', false);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer-fade">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex justify-end bg-[rgba(15,23,42,0.4)]"
        @click.self="close"
      >
        <aside
          class="flex h-full flex-col bg-white shadow-panel"
          :style="{ width: width }"
        >
          <header class="flex items-center justify-between border-b border-[#eef2f7] px-5 py-3.5">
            <h3 class="text-base font-semibold text-ink">{{ title }}</h3>
            <button
              type="button"
              class="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
              @click="close"
            >
              <IconBase name="close" :size="16" />
            </button>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="border-t border-[#eef2f7] px-5 py-3">
            <slot name="footer" />
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.22s ease;
}
.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}
</style>
