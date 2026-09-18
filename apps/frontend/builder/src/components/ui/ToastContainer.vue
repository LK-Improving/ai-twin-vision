<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import { useAppStore } from '@/stores/app';
import IconBase from './IconBase.vue';

const app = useAppStore();

const ICON: Record<string, string> = {
  success: 'check',
  error: 'close',
  warning: 'warning',
  info: 'info',
};
const COLOR: Record<string, string> = {
  success: 'bg-success-soft text-success',
  error: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-primary-50 text-primary-600',
};

const timers = new Map<number, ReturnType<typeof setTimeout>>();

function schedule(id: number, duration: number): void {
  if (timers.has(id)) return;
  const t = setTimeout(() => {
    app.removeToast(id);
    timers.delete(id);
  }, duration);
  timers.set(id, t);
}

watch(
  () => app.toasts,
  (list) => {
    for (const toast of list) schedule(toast.id, toast.duration);
  },
  { deep: true, immediate: true },
);

onBeforeUnmount(() => {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
});
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed left-1/2 top-4 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      <TransitionGroup name="toast">
        <div
          v-for="toast in app.toasts"
          :key="toast.id"
          class="pointer-events-auto flex min-w-[220px] max-w-[90vw] items-center gap-2.5 rounded-xl border border-[#eef2f7] bg-white px-4 py-2.5 shadow-panel"
        >
          <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            :class="COLOR[toast.type]"
          >
            <IconBase :name="ICON[toast.type]" :size="14" />
          </span>
          <span class="text-sm text-ink">{{ toast.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
</style>
