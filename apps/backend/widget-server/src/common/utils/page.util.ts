import { PAGE_DEFAULTS, parseSort, type PageQuery, type PageResult } from '@dt/shared-types';
import type { SelectQueryBuilder, ObjectLiteral } from 'typeorm';

/** 规范化分页参数，防止越界与注入 */
export function normalizePage(query: PageQuery): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Number(query.page) || PAGE_DEFAULTS.page);
  const limit = Math.min(
    PAGE_DEFAULTS.maxLimit,
    Math.max(1, Number(query.limit) || PAGE_DEFAULTS.limit),
  );
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * 把 sort 查询串转换为安全的排序子句。
 * 只接受白名单字段，避免 SQL 注入（详细设计 3.5）。
 */
export function resolveOrderBy(
  sort: string | undefined,
  allowedFields: Record<string, string>,
  fallback: { column: string; order: 'ASC' | 'DESC' },
): { column: string; order: 'ASC' | 'DESC' } {
  const parsed = parseSort(sort, '');
  if (!parsed.field) return fallback;
  const column = allowedFields[parsed.field];
  if (!column) return fallback;
  return { column, order: parsed.order };
}

/** 组装分页响应体 */
export function buildPageResult<T>(
  dataList: T[],
  total: number,
  page: number,
  limit: number,
): PageResult<T> {
  return { total, page, limit, dataList };
}

/**
 * 对 QueryBuilder 应用分页并返回标准分页结果。
 * 统一入口便于后续接入慢查询监控。
 */
export async function paginate<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  query: PageQuery,
): Promise<PageResult<T>> {
  const { page, limit, skip } = normalizePage(query);
  const [dataList, total] = await qb.skip(skip).take(limit).getManyAndCount();
  return buildPageResult(dataList, total, page, limit);
}
