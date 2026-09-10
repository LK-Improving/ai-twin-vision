import { defineStore } from 'pinia';
import { ref } from 'vue';

/** 全局提示类型 */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

/** 单条提示 */
export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

/** 面包屑项 */
export interface BreadcrumbItem {
  title: string;
  to?: string;
}

/**
 * 全局应用状态：侧边栏折叠、全屏、面包屑、全局加载、提示队列。
 * 提示队列由 useToast 写入，ToastContainer 消费。
 */
export const useAppStore = defineStore('app', () => {
  /** 侧边栏是否折叠 */
  const sidebarCollapsed = ref(false);
  /** 是否全屏 */
  const isFullscreen = ref(false);
  /** 面包屑 */
  const breadcrumbs = ref<BreadcrumbItem[]>([]);
  /** 全局加载遮罩 */
  const globalLoading = ref(false);
  /** 提示队列 */
  const toasts = ref<ToastItem[]>([]);

  /** 切换侧边栏折叠态 */
  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  /** 设置侧边栏折叠态 */
  function setSidebar(collapsed: boolean): void {
    sidebarCollapsed.value = collapsed;
  }

  /** 设置全屏态 */
  function setFullscreen(value: boolean): void {
    isFullscreen.value = value;
  }

  /** 设置面包屑 */
  function setBreadcrumbs(items: BreadcrumbItem[]): void {
    breadcrumbs.value = items;
  }

  /** 设置全局加载 */
  function setGlobalLoading(value: boolean): void {
    globalLoading.value = value;
  }

  /** 推送一条提示，返回其 id */
  function pushToast(type: ToastType, message: string, duration = 3000): number {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    toasts.value.push({ id, type, message, duration });
    return id;
  }

  /** 移除指定提示 */
  function removeToast(id: number): void {
    const idx = toasts.value.findIndex((t) => t.id === id);
    if (idx >= 0) toasts.value.splice(idx, 1);
  }

  /** 清空提示 */
  function clearToasts(): void {
    toasts.value = [];
  }

  return {
    sidebarCollapsed,
    isFullscreen,
    breadcrumbs,
    globalLoading,
    toasts,
    toggleSidebar,
    setSidebar,
    setFullscreen,
    setBreadcrumbs,
    setGlobalLoading,
    pushToast,
    removeToast,
    clearToasts,
  };
});
