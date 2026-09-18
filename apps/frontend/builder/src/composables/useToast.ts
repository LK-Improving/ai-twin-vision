import { useAppStore } from '@/stores/app';

/**
 * 全局提示组合式函数
 * 写入 app store 的提示队列，由挂在 App.vue 根部的 ToastContainer 渲染。
 *
 * @example
 * const toast = useToast();
 * toast.success('保存成功');
 * toast.error('操作失败');
 */
export function useToast() {
  const app = useAppStore();

  return {
    success: (message: string, duration?: number) => app.pushToast('success', message, duration),
    error: (message: string, duration?: number) => app.pushToast('error', message, duration),
    warning: (message: string, duration?: number) => app.pushToast('warning', message, duration),
    info: (message: string, duration?: number) => app.pushToast('info', message, duration),
  };
}
