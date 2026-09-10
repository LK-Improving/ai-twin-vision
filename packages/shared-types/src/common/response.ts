/**
 * 统一响应格式（详细设计文档 4.1.2）
 * 所有接口均返回该结构，前端 Axios 拦截器据此解包。
 */
export interface ApiResponse<T = unknown> {
  /** 业务状态码：200 成功，其余见 BizCode */
  code: number;
  /** 提示信息 */
  message: string;
  /** 业务数据 */
  data: T;
  /** 服务器 ISO 时间戳 */
  timestamp: string;
  /** 链路追踪 ID（OpenTelemetry traceId），便于问题追溯 */
  traceId?: string;
}

/**
 * 分页查询参数（详细设计文档 4.1.3）
 * sort 支持 `-createdAt` 降序 / `createdAt` 升序
 */
export interface PageQuery {
  page?: number;
  limit?: number;
  sort?: string;
  keyword?: string;
}

/** 分页响应结构 */
export interface PageResult<T> {
  total: number;
  page: number;
  limit: number;
  dataList: T[];
}

/**
 * 分页默认值。
 * 显式标注为 number（不用 as const），否则下游 ref(PAGE_DEFAULTS.page)
 * 会被推断成字面量类型 1，导致赋值 number 报错。
 */
export const PAGE_DEFAULTS: { page: number; limit: number; maxLimit: number } = {
  page: 1,
  limit: 20,
  maxLimit: 200,
};

/** 排序方向 */
export type SortOrder = 'ASC' | 'DESC';

/** 解析后的排序描述 */
export interface ParsedSort {
  field: string;
  order: SortOrder;
}

/**
 * 解析 sort 查询串为字段与方向。
 * `-createdAt` → { field: 'createdAt', order: 'DESC' }
 */
export function parseSort(sort?: string, fallbackField = 'createdAt'): ParsedSort {
  if (!sort || !sort.trim()) {
    return { field: fallbackField, order: 'DESC' };
  }
  const raw = sort.trim();
  return raw.startsWith('-')
    ? { field: raw.slice(1), order: 'DESC' }
    : { field: raw, order: 'ASC' };
}
