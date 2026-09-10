import { SetMetadata } from '@nestjs/common';

export const OPERATION_LOG_KEY = 'operationLog';

export interface OperationLogMeta {
  /** 业务模块，如「场景管理」 */
  module: string;
  /** 操作动作，如「创建场景」 */
  action: string;
  /** 是否记录请求参数（含敏感信息的接口应关闭） */
  recordParams?: boolean;
}

/**
 * 标记需要写入操作日志的接口（sys_operation_log）。
 * 由 OperationLogInterceptor 异步落库，不阻塞主流程。
 */
export const OperationLog = (meta: OperationLogMeta) => SetMetadata(OPERATION_LOG_KEY, meta);
