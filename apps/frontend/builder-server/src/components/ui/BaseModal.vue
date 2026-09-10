<script setup lang="ts">
import { watch } from 'vue';
import IconBase from './IconBase.vue';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    title?: string;
    width?: string;
    loading?: boolean;
    hideFooter?: boolean;
    confirmText?: string;
  }>(),
  { width: '520px', loading: false, hideFooter: false, confirmText: '确定' },
);

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

function close(): void {
  emit('update:visible', false);
  emit('cancel');
}

function confirm(): void {
  emit('confirm');
}

// 打开时锁定背景滚动
watch(
  () => props.visible,
  (v) => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = v ? 'hidden' : '';
    }
  },
);
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.45)] px-4"
        @click.self="close"
      >
        <div
          class="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-panel"
          :style="{ maxWidth: width }"
        >
          <header class="flex items-center justify-between border-b border-[#eef2f7] px-5 py-3.5">
            <h3 class="text-base font-semibold text-ink">{{ title ?? '提示' }}</h3>
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

          <footer
            v-if="!hideFooter"
            class="flex items-center justify-end gap-2 border-t border-[#eef2f7] px-5 py-3"
          >
            <slot name="footer">
              <button
                type="button"
                class="h-9 rounded-lg border border-[#e5e9f0] bg-white px-4 text-sm text-ink hover:bg-surface-muted"
                @click="close"
              >
                取消
              </button>
              <button
                type="button"
                class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary-500 px-4 text-sm text-white hover:bg-primary-600 disabled:opacity-60"
                :disabled="loading"
                @click="confirm"
              >
                <span
                  v-if="loading"
                  class="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin"
                />
                {{ confirmText }}
              </button>
            </slot>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
