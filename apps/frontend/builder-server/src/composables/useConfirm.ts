import { reactive } from 'vue';

/**
 * 全局确认弹窗组合式函数
 * 基于模块级单例状态，ConfirmDialog 组件读取同一 state 渲染，
 * 业务层通过 confirm() 拿到 Promise<boolean>。
 */

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** 确认按钮 loading（如删除前需二次校验接口） */
  loading?: boolean;
  /** 危险操作（确认按钮变红） */
  danger?: boolean;
}

interface ConfirmState {
  visible: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  loading: boolean;
  danger: boolean;
  resolve: ((value: boolean) => void) | null;
}

const state = reactive<ConfirmState>({
  visible: false,
  title: '提示',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  loading: false,
  danger: false,
  resolve: null,
});

export function useConfirm() {
  function confirm(options: ConfirmOptions): Promise<boolean> {
    state.title = options.title ?? '提示';
    state.message = options.message;
    state.confirmText = options.confirmText ?? '确定';
    state.cancelText = options.cancelText ?? '取消';
    state.loading = options.loading ?? false;
    state.danger = options.danger ?? false;
    state.visible = true;
    return new Promise<boolean>((resolve) => {
      state.resolve = resolve;
    });
  }

  /** 用户点击确认 */
  function confirmOk(): void {
    const resolve = state.resolve;
    state.visible = false;
    state.resolve = null;
    resolve?.(true);
  }

  /** 用户点击取消或关闭 */
  function confirmCancel(): void {
    const resolve = state.resolve;
    state.visible = false;
    state.resolve = null;
    resolve?.(false);
  }

  return { state, confirm, confirmOk, confirmCancel };
}
