<script setup lang="ts">
import { useConfirm } from '@/composables/useConfirm';
import BaseModal from './ui/BaseModal.vue';

const { state, confirmOk, confirmCancel } = useConfirm();
</script>

<template>
  <BaseModal
    :visible="state.visible"
    :title="state.title"
    width="420px"
    :loading="state.loading"
    :confirm-text="state.confirmText"
    @update:visible="(v: boolean) => !v && confirmCancel()"
    @confirm="confirmOk"
    @cancel="confirmCancel"
  >
    <p class="text-sm leading-6 text-ink-soft">{{ state.message }}</p>
    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <button
          type="button"
          class="h-9 rounded-lg border border-[#e5e9f0] bg-white px-4 text-sm text-ink hover:bg-surface-muted"
          :disabled="state.loading"
          @click="confirmCancel"
        >
          {{ state.cancelText }}
        </button>
        <button
          type="button"
          class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-4 text-sm text-white disabled:opacity-60"
          :class="state.danger ? 'bg-danger hover:bg-red-700' : 'bg-primary-500 hover:bg-primary-600'"
          :disabled="state.loading"
          @click="confirmOk"
        >
          <span
            v-if="state.loading"
            class="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin"
          />
          {{ state.confirmText }}
        </button>
      </div>
    </template>
  </BaseModal>
</template>
