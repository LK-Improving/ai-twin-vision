<script setup lang="ts">
import { useRouter } from 'vue-router';
import BaseButton from '@/components/ui/BaseButton.vue';

const router = useRouter();
</script>

<template>
  <div class="flex h-screen w-screen flex-col items-center justify-center bg-surface-soft text-center">
    <p class="text-7xl font-bold text-gradient">404</p>
    <p class="mt-4 text-lg text-ink-soft">您访问的页面不存在或已被移除</p>
    <BaseButton type="primary" class="mt-6" @click="router.replace('/scenes')">返回场景管理</BaseButton>
  </div>
</template>
