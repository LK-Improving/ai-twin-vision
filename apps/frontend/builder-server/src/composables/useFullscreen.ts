import { onMounted, onUnmounted, ref } from 'vue';

/**
 * 全屏切换组合式函数
 * @param target 取得全屏目标元素的函数，默认整页 document.documentElement
 */
export function useFullscreen(target?: () => HTMLElement) {
  const isFullscreen = ref(false);

  function sync(): void {
    isFullscreen.value = !!document.fullscreenElement;
  }

  async function toggle(): Promise<void> {
    const el = target ? target() : document.documentElement;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      /* 浏览器可能拒绝无用户手势的全屏请求，忽略即可 */
    }
  }

  onMounted(() => document.addEventListener('fullscreenchange', sync));
  onUnmounted(() => document.removeEventListener('fullscreenchange', sync));

  return { isFullscreen, toggle };
}
