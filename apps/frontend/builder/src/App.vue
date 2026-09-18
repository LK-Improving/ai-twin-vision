<script setup lang="ts">
import ToastContainer from '@/components/ui/ToastContainer.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
</script>

<template>
  <router-view />
  <!-- 全局提示与确认弹窗，统一挂在应用根部 -->
  <ToastContainer />
  <ConfirmDialog />
</template>
