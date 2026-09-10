import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { ChangePasswordRequest, PermissionCode, UserProfile } from '@dt/shared-types';
import {
  changePasswordApi,
  getProfileApi,
  loginApi,
  logoutApi,
  refreshTokenApi,
} from '@/services/api/auth';
import {
  clearAuth,
  getAccessToken,
  getDeviceId,
  getProfile,
  getRefreshToken,
  setProfile,
  setTokens,
} from '@/utils/storage';
import { useToast } from '@/composables/useToast';

/**
 * 认证状态：双 Token、用户资料、权限/角色判定。
 * Token 持久化到 localStorage（见 utils/storage），资料做缓存以便路由守卫快速复用。
 */
export const useAuthStore = defineStore('auth', () => {
  const profile = ref<UserProfile | null>(getProfile<UserProfile>());
  const loading = ref(false);

  /** 是否已登录（以 accessToken 是否存在为准） */
  const isLogin = computed(() => !!getAccessToken());

  /** 是否为超级管理员 */
  const isSuperAdmin = computed(() => profile.value?.roles.includes('SUPER_ADMIN') ?? false);

  /** 登录：换取双 Token 并拉取资料 */
  async function login(username: string, password: string, remember = true): Promise<void> {
    loading.value = true;
    try {
      const tokens = await loginApi({ username, password, deviceId: getDeviceId() });
      if (remember) {
        setTokens({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
        });
      }
      await fetchProfile();
    } finally {
      loading.value = false;
    }
  }

  /** 拉取当前用户资料（优先复用缓存，失败则清登录态） */
  async function fetchProfile(): Promise<void> {
    const data = await getProfileApi();
    profile.value = data;
    setProfile(data);
  }

  /** 刷新令牌（无感续期由 request 拦截器自动处理，此处提供显式入口） */
  async function refreshTokens(): Promise<boolean> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const tokens = await refreshTokenApi({ refreshToken, deviceId: getDeviceId() });
      setTokens({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      });
      return true;
    } catch {
      return false;
    }
  }

  /** 修改密码 */
  async function changePassword(payload: ChangePasswordRequest): Promise<void> {
    await changePasswordApi(payload);
    useToast().success('密码修改成功，请重新登录');
    await logout();
  }

  /** 退出登录 */
  async function logout(): Promise<void> {
    try {
      await logoutApi();
    } catch {
      /* 忽略退出接口异常 */
    } finally {
      profile.value = null;
      clearAuth();
    }
  }

  /** 按钮级权限判定 */
  function hasPermission(code: string): boolean {
    return profile.value?.permissions.includes(code as PermissionCode) ?? false;
  }

  /** 角色判定 */
  function hasRole(code: string): boolean {
    return profile.value?.roles.includes(code) ?? false;
  }

  return {
    profile,
    loading,
    isLogin,
    isSuperAdmin,
    login,
    fetchProfile,
    refreshTokens,
    changePassword,
    logout,
    hasPermission,
    hasRole,
  };
});
