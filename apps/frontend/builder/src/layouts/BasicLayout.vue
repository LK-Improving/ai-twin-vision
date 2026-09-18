<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import { useFullscreen } from '@/composables/useFullscreen';
import { getHealthApi } from '@/services/api/health';
import type { HealthStatus } from '@dt/shared-types';
import IconBase from '@/components/ui/IconBase.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseButton from '@/components/ui/BaseButton.vue';

const router = useRouter();
const auth = useAuthStore();
const app = useAppStore();
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

interface MenuItem {
  label: string;
  icon: string;
  to: string;
  permission?: string;
}
interface MenuGroup {
  group: string;
  items: MenuItem[];
}

const groups: MenuGroup[] = [
  {
    group: '场景管理',
    items: [{ label: '场景管理', icon: 'cube', to: '/scenes', permission: 'scene:view' }],
  },
  {
    group: '资产与组件',
    items: [
      { label: '组件库', icon: 'layers', to: '/components', permission: 'component:view' },
      { label: '资产库', icon: 'image', to: '/assets', permission: 'file:upload' },
    ],
  },
  {
    group: '数据接入',
    items: [
      { label: '数据源', icon: 'database', to: '/data-sources', permission: 'datasource:view' },
      { label: '设备', icon: 'device', to: '/devices', permission: 'device:view' },
    ],
  },
  {
    group: '系统管理',
    items: [
      { label: '用户管理', icon: 'user', to: '/system/users', permission: 'system:user:manage' },
      { label: '角色管理', icon: 'lock', to: '/system/roles', permission: 'system:role:manage' },
      { label: '操作日志', icon: 'table', to: '/system/logs', permission: 'system:log:view' },
    ],
  },
];

const visibleGroups = computed(() =>
  groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => !it.permission || auth.hasPermission(it.permission)),
    }))
    .filter((g) => g.items.length > 0),
);

/* ---------------- 用户下拉 ---------------- */
const userMenuOpen = ref(false);
const profile = computed(() => auth.profile);
const avatarText = computed(() => profile.value?.realName?.[0] ?? profile.value?.username?.[0] ?? 'U');

function toggleUserMenu(): void {
  userMenuOpen.value = !userMenuOpen.value;
}
function goProfile(): void {
  userMenuOpen.value = false;
  router.push('/profile');
}
async function doLogout(): Promise<void> {
  userMenuOpen.value = false;
  await auth.logout();
  router.push('/login');
}

/* ---------------- 修改密码弹窗 ---------------- */
const pwdVisible = ref(false);
const pwdLoading = ref(false);
const oldPwd = ref('');
const newPwd = ref('');
const confirmPwd = ref('');
const pwdError = ref('');

async function submitPwd(): Promise<void> {
  pwdError.value = '';
  if (!oldPwd.value || !newPwd.value) {
    pwdError.value = '请填写原密码与新密码';
    return;
  }
  if (newPwd.value !== confirmPwd.value) {
    pwdError.value = '两次输入的新密码不一致';
    return;
  }
  pwdLoading.value = true;
  try {
    await auth.changePassword({ oldPassword: oldPwd.value, newPassword: newPwd.value });
    pwdVisible.value = false;
    oldPwd.value = '';
    newPwd.value = '';
    confirmPwd.value = '';
    await router.push('/login');
  } catch {
    pwdError.value = '修改失败，请检查原密码';
  } finally {
    pwdLoading.value = false;
  }
}

/* ---------------- 健康状态轮询 ---------------- */
const health = ref<HealthStatus | null>(null);
const healthDot = computed(() => {
  const s = health.value?.status;
  if (s === 'ok') return 'bg-success';
  if (s === 'degraded') return 'bg-warning';
  if (s === 'down') return 'bg-danger';
  return 'bg-ink-muted';
});

let timer: ReturnType<typeof setInterval> | null = null;
async function pollHealth(): Promise<void> {
  try {
    health.value = await getHealthApi();
  } catch {
    health.value = { status: 'down', uptime: 0, version: '', dependencies: {}, timestamp: '' };
  }
}
onMounted(() => {
  pollHealth();
  timer = setInterval(pollHealth, 30000);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-surface-soft text-ink">
    <!-- 侧边栏 -->
    <aside
      class="flex shrink-0 flex-col border-r border-[#eef2f7] bg-white transition-all duration-200"
      :class="app.sidebarCollapsed ? 'w-16' : 'w-60'"
    >
      <div class="flex h-14 items-center gap-2 border-b border-[#eef2f7] px-4">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white">
          <IconBase name="globe" :size="18" />
        </div>
        <span v-if="!app.sidebarCollapsed" class="truncate text-sm font-semibold text-gradient">
          数字孪生低代码平台
        </span>
      </div>

      <nav class="flex-1 overflow-y-auto px-2 py-3">
        <template v-for="g in visibleGroups" :key="g.group">
          <p
            v-if="!app.sidebarCollapsed"
            class="px-3 pb-1 pt-3 text-xs font-medium text-ink-muted"
          >
            {{ g.group }}
          </p>
          <router-link
            v-for="it in g.items"
            :key="it.to"
            :to="it.to"
            class="group mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
            :class="[
              app.sidebarCollapsed ? 'justify-center' : '',
              $route.path.startsWith(it.to)
                ? 'bg-primary-50 text-primary-600 font-medium'
                : 'text-ink-soft hover:bg-surface-muted hover:text-ink',
            ]"
          >
            <IconBase :name="it.icon" :size="18" />
            <span v-if="!app.sidebarCollapsed">{{ it.label }}</span>
          </router-link>
        </template>
      </nav>
    </aside>

    <!-- 主区 -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- 顶栏 -->
      <header class="flex h-14 shrink-0 items-center justify-between border-b border-[#eef2f7] bg-white px-4">
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-muted"
            @click="app.toggleSidebar()"
          >
            <IconBase name="menu" :size="18" />
          </button>
          <nav class="flex items-center gap-1.5 text-sm text-ink-soft">
            <template v-for="(c, i) in app.breadcrumbs" :key="i">
              <span v-if="i > 0" class="text-ink-muted">/</span>
              <span :class="i === app.breadcrumbs.length - 1 ? 'text-ink font-medium' : ''">{{
                c.title
              }}</span>
            </template>
          </nav>
        </div>

        <div class="flex items-center gap-2">
          <!-- 健康状态 -->
          <div class="flex items-center gap-1.5 rounded-lg bg-surface-soft px-2.5 py-1.5 text-xs text-ink-soft">
            <span class="h-2 w-2 rounded-full" :class="healthDot" />
            <span>{{ health?.status === 'ok' ? '服务正常' : health?.status === 'degraded' ? '服务降级' : '服务异常' }}</span>
          </div>
          <!-- 全屏 -->
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-muted"
            :title="isFullscreen ? '退出全屏' : '全屏'"
            @click="toggleFullscreen()"
          >
            <IconBase :name="isFullscreen ? 'close' : 'fullscreen'" :size="18" />
          </button>
          <!-- 用户菜单 -->
          <div class="relative">
            <button
              type="button"
              class="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-muted"
              @click="toggleUserMenu"
            >
              <span class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 text-sm font-medium text-white">
                {{ avatarText }}
              </span>
              <span class="hidden text-sm text-ink-soft sm:inline">{{ profile?.realName || profile?.username }}</span>
              <IconBase name="chevron-down" :size="14" class="text-ink-muted" />
            </button>
            <Transition name="dropdown">
              <div
                v-if="userMenuOpen"
                class="absolute right-0 top-11 z-40 w-44 overflow-hidden rounded-xl border border-[#eef2f7] bg-white py-1 shadow-panel"
              >
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-soft hover:bg-surface-muted"
                  @click="goProfile"
                >
                  <IconBase name="user" :size="15" /> 个人中心
                </button>
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-soft hover:bg-surface-muted"
                  @click="(userMenuOpen = false), (pwdVisible = true)"
                >
                  <IconBase name="lock" :size="15" /> 修改密码
                </button>
                <div class="my-1 border-t border-[#eef2f7]" />
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft"
                  @click="doLogout"
                >
                  <IconBase name="logout" :size="15" /> 退出登录
                </button>
              </div>
            </Transition>
          </div>
        </div>
      </header>

      <!-- 内容区 -->
      <main class="min-h-0 flex-1 overflow-y-auto bg-tech-grid">
        <router-view v-slot="{ Component }">
          <Transition name="fade-slide" mode="out-in">
            <component :is="Component" />
          </Transition>
        </router-view>
      </main>
    </div>

    <!-- 修改密码弹窗 -->
    <BaseModal v-model:visible="pwdVisible" title="修改密码" :loading="pwdLoading" confirm-text="确定修改" @confirm="submitPwd">
      <div class="space-y-3">
        <div>
          <label class="mb-1 block text-sm text-ink-soft">原密码</label>
          <BaseInput v-model="oldPwd" type="password" placeholder="请输入原密码" />
        </div>
        <div>
          <label class="mb-1 block text-sm text-ink-soft">新密码</label>
          <BaseInput v-model="newPwd" type="password" placeholder="请输入新密码" />
        </div>
        <div>
          <label class="mb-1 block text-sm text-ink-soft">确认新密码</label>
          <BaseInput v-model="confirmPwd" type="password" placeholder="再次输入新密码" />
        </div>
        <p v-if="pwdError" class="text-sm text-danger">{{ pwdError }}</p>
      </div>
    </BaseModal>
  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
