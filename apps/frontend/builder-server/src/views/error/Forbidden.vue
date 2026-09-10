<script setup lang="ts">
import { useRouter } from 'vue-router';
import BaseButton from '@/components/ui/BaseButton.vue';
import IconBase from '@/components/ui/IconBase.vue';

const router = useRouter();
</script>

<template>
  <div class="flex h-screen w-screen flex-col items-center justify-center bg-surface-soft text-center">
    <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-warning-soft text-warning">
      <IconBase name="lock" :size="30" />
    </div>
    <p class="mt-5 text-2xl font-bold text-ink">无访问权限</p>
    <p class="mt-2 text-sm text-ink-soft">当前账号没有访问该页面的权限，请联系管理员申请</p>
    <BaseButton type="primary" class="mt-6" @click="router.replace('/scenes')">返回场景管理</BaseButton>
  </div>
</template>
