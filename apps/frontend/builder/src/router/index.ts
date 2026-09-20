import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';

/**
 * 路由元信息扩展
 */
declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题（用于 document.title 与面包屑） */
    title?: string;
    /** 所需权限编码，缺失则跳转 /403 */
    permission?: string;
    /** 公开页（无需登录） */
    public?: boolean;
    /** 全屏页（无外壳布局，如预览） */
    fullscreen?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login/LoginView.vue'),
    meta: { title: '登录', public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/BasicLayout.vue'),
    redirect: '/scenes',
    children: [
      {
        path: 'scenes',
        name: 'scenes',
        component: () => import('@/views/scene/SceneListView.vue'),
        meta: { title: '场景管理' },
      },
      {
        path: 'components',
        name: 'components',
        component: () => import('@/views/component/ComponentLibraryView.vue'),
        meta: { title: '组件库', permission: 'component:view' },
      },
      {
        path: 'assets',
        name: 'assets',
        component: () => import('@/views/asset/AssetLibraryView.vue'),
        meta: { title: '资产库', permission: 'file:upload' },
      },
      {
        path: 'data-sources',
        name: 'data-sources',
        component: () => import('@/views/data/DataSourceView.vue'),
        meta: { title: '数据源', permission: 'datasource:view' },
      },
      {
        path: 'devices',
        name: 'devices',
        component: () => import('@/views/data/DeviceView.vue'),
        meta: { title: '设备', permission: 'device:view' },
      },
      {
        path: 'alert-rules',
        name: 'alert-rules',
        component: () => import('@/views/data/AlertRuleView.vue'),
        meta: { title: '告警规则', permission: 'device:manage' },
      },
      {
        path: 'system/users',
        name: 'system-users',
        component: () => import('@/views/system/UserView.vue'),
        meta: { title: '用户管理', permission: 'system:user:manage' },
      },
      {
        path: 'system/roles',
        name: 'system-roles',
        component: () => import('@/views/system/RoleView.vue'),
        meta: { title: '角色管理', permission: 'system:role:manage' },
      },
      {
        path: 'system/logs',
        name: 'system-logs',
        component: () => import('@/views/system/OperationLogView.vue'),
        meta: { title: '操作日志', permission: 'system:log:view' },
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/profile/ProfileView.vue'),
        meta: { title: '个人中心' },
      },
      {
        path: '403',
        name: 'forbidden',
        component: () => import('@/views/error/Forbidden.vue'),
        meta: { title: '无权限', public: true },
      },
    ],
  },
  {
    // 场景编辑器：独立全屏工作台（无外壳）。自身已含完整的顶部工具栏
    // （返回/保存/发布/缩放/面板折叠）与底部状态栏，不需要 BasicLayout 的
    // 侧边栏与顶栏——否则编辑器 100vw/100vh 会溢出容器，且画布被占去 240px+56px。
    path: '/scenes/:id/edit',
    name: 'scene-edit',
    component: () => import('@/views/editor/EditorView.vue'),
    meta: { title: '场景编辑器', permission: 'scene:edit', fullscreen: true },
  },
  {
    path: '/preview/:id',
    name: 'preview',
    // 由 web-editor-dev 同事提供，需登录但无外壳
    component: () => import('@/views/preview/PreviewView.vue'),
    meta: { title: '场景预览', fullscreen: true },
  },
  {
    // 发布大屏公开访问：无需登录，凭证就是 URL 里的发布令牌
    path: '/screen/:token',
    name: 'screen',
    component: () => import('@/views/screen/ScreenView.vue'),
    meta: { title: '大屏', fullscreen: true, public: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/error/NotFound.vue'),
    meta: { title: '页面不存在', public: true },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  const app = useAppStore();
  const titleBase = import.meta.env.VITE_APP_TITLE || '数字孪生低代码平台';

  // 公开页直接放行
  if (to.meta.public) {
    document.title = to.meta.title ? `${to.meta.title} · ${titleBase}` : titleBase;
    app.setBreadcrumbs([]);
    return true;
  }

  // 未登录跳登录并携带回跳
  if (!auth.isLogin) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  // 已登录访问登录页跳首页
  if (to.name === 'login') {
    return { path: (to.query.redirect as string) || '/scenes' };
  }

  // 资料缓存复用，否则拉取
  if (!auth.profile) {
    try {
      await auth.fetchProfile();
    } catch {
      await auth.logout();
      return { path: '/login', query: { redirect: to.fullPath } };
    }
  }

  // 权限校验
  if (to.meta.permission && !auth.hasPermission(to.meta.permission)) {
    return { path: '/403' };
  }

  // 标题与面包屑
  document.title = to.meta.title ? `${to.meta.title} · ${titleBase}` : titleBase;
  const crumbs = to.matched
    .filter((r) => r.meta.title)
    .map((r) => ({ title: r.meta.title as string, to: r.path === '' ? '/' : r.path }));
  app.setBreadcrumbs(crumbs);

  return true;
});
