import { ref } from 'vue';
import { PAGE_DEFAULTS } from '@dt/shared-types';

/**
 * 通用分页状态组合式函数
 * 返回 page / limit / total 与变更方法，配合 BasePagination 使用。
 */
export function usePagination(options?: { limit?: number }) {
  const page = ref(PAGE_DEFAULTS.page);
  const limit = ref(options?.limit ?? PAGE_DEFAULTS.limit);
  const total = ref(0);

  /** 页码变化（来自 BasePagination 的 update:page） */
  function onChangePage(value: number): void {
    page.value = value;
  }

  /** 每页条数变化，重置到第一页 */
  function onChangeLimit(value: number): void {
    limit.value = value;
    page.value = 1;
  }

  /** 回到第一页 */
  function reset(): void {
    page.value = 1;
  }

  return { page, limit, total, onChangePage, onChangeLimit, reset };
}
