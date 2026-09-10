import { onUnmounted, ref } from 'vue';

/**
 * 防抖组合式函数
 * 返回 run（防抖执行）与 flush（立即清空定时器）。
 *
 * @example
 * const { run } = useDebounce((kw: string) => search(kw), 300);
 * input.onInput = (e) => run(e.target.value);
 */
export function useDebounce<A extends unknown[]>(fn: (...args: A) => void, delay = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const pending = ref(false);

  function run(...args: A): void {
    pending.value = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      pending.value = false;
      fn(...args);
    }, delay);
  }

  function flush(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending.value = false;
  }

  onUnmounted(flush);

  return { run, flush, pending };
}
