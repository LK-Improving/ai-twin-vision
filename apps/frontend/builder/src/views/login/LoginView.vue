<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import IconBase from '@/components/ui/IconBase.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const username = ref('admin');
const password = ref('Admin@123');
const remember = ref(true);
const errorMsg = ref('');
const loading = ref(false);

async function submit(): Promise<void> {
  errorMsg.value = '';
  if (!username.value || !password.value) {
    errorMsg.value = '请输入用户名和密码';
    return;
  }
  loading.value = true;
  try {
    await auth.login(username.value, password.value, remember.value);
    const redirect = (route.query.redirect as string) || '/scenes';
    router.replace(redirect);
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '登录失败';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-surface-soft">
    <!-- 左侧品牌视觉（纯 CSS 绘制科技感网格 / 光晕） -->
    <div class="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-[#0b1220] via-[#0e1b33] to-[#0a1530] lg:block">
      <div class="absolute inset-0 bg-tech-grid opacity-40" />
      <div class="halo absolute inset-0" />
      <div class="absolute left-12 top-12 flex items-center gap-3 text-white">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500">
          <IconBase name="globe" :size="22" />
        </div>
        <span class="text-lg font-semibold">数字孪生低代码平台</span>
      </div>
      <div class="absolute left-12 top-1/2 max-w-md -translate-y-1/2 text-white">
        <h1 class="text-4xl font-bold leading-snug">Cesium 宏观 + Three.js 微观<br />双引擎数字孪生底座</h1>
        <p class="mt-4 text-sm leading-7 text-white/70">
          面向能源、制造、园区的企业级数字孪生低代码平台，可视化编排场景、组件与数据接入，一键发布大屏。
        </p>
        <div class="mt-8 flex gap-3">
          <span class="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80">场景管理</span>
          <span class="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80">组件库</span>
          <span class="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80">数据源接入</span>
        </div>
      </div>
    </div>

    <!-- 右侧登录表单 -->
    <div class="flex w-full items-center justify-center bg-surface-soft px-6 lg:w-1/2">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex items-center gap-3 lg:hidden">
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500 text-white">
            <IconBase name="globe" :size="22" />
          </div>
          <span class="text-lg font-semibold text-gradient">数字孪生低代码平台</span>
        </div>

        <h2 class="text-2xl font-bold text-ink">欢迎登录</h2>
        <p class="mt-1 text-sm text-ink-soft">请输入账号信息以进入控制台</p>

        <form class="mt-7 space-y-4" @submit.prevent="submit">
          <div>
            <label class="mb-1 block text-sm text-ink-soft">用户名</label>
            <BaseInput v-model="username" placeholder="请输入用户名" @enter="submit" />
          </div>
          <div>
            <label class="mb-1 block text-sm text-ink-soft">密码</label>
            <BaseInput v-model="password" type="password" placeholder="请输入密码" @enter="submit" />
          </div>

          <div class="flex items-center justify-between text-sm">
            <label class="flex cursor-pointer items-center gap-2 text-ink-soft">
              <input v-model="remember" type="checkbox" class="h-4 w-4 rounded border-[#e5e9f0] text-primary-500" />
              记住我
            </label>
            <a class="text-primary-600 hover:underline" @click.prevent>忘记密码？</a>
          </div>

          <p v-if="errorMsg" class="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{{ errorMsg }}</p>

          <BaseButton type="primary" block size="lg" :loading="loading" @click="submit">
            登录
          </BaseButton>
        </form>

        <div class="mt-6 rounded-lg bg-surface-muted px-3 py-2.5 text-xs text-ink-soft">
          演示账号：<span class="font-medium text-ink">admin</span> / <span class="font-medium text-ink">Admin@123</span>
        </div>
      </div>
    </div>
  </div>
</template>
