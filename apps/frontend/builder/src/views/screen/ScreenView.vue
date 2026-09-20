<script setup lang="ts">
/**
 * 发布大屏公开运行时（/screen/:token）。
 *
 * 复用预览页的渲染与数据运行时，仅切换数据来源：
 * - 快照走 /public/screens/:token，无需登录；
 * - 实时通道用发布令牌换取短时效票据（见 PreviewView.loadPublicSnapshot）。
 * 这里做薄壳是为了让路由与权限语义清晰，不重复实现运行时。
 */
import { useRoute } from 'vue-router';
import PreviewView from '../preview/PreviewView.vue';

const route = useRoute();
const token = String(route.params.token ?? '');
</script>

<template>
  <PreviewView :screen-token="token" />
</template>
