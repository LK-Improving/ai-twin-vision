import { HttpException } from '@nestjs/common';
import { BizCode, resolveBizMessage, toHttpStatus } from '@dt/shared-types';

/**
 * 业务异常。
 * 抛出后由 AllExceptionsFilter 统一转换为标准响应体
 * { code, message, data, timestamp }（详细设计 2.4 错误处理规范）。
 */
export class BizException extends HttpException {
  /** 业务错误码（见 BizCode） */
  readonly bizCode: number;
  /** 附加数据，便于前端定位（如校验失败字段） */
  readonly payload?: unknown;

  constructor(bizCode: number, message?: string, payload?: unknown) {
    super(message ?? resolveBizMessage(bizCode), toHttpStatus(bizCode));
    this.bizCode = bizCode;
    this.payload = payload;
  }

  /** 资源不存在 */
  static notFound(bizCode: number = BizCode.COMMON_RESOURCE_NOT_FOUND, message?: string) {
    return new BizException(bizCode, message);
  }

  /** 参数非法 */
  static invalidParam(message?: string, payload?: unknown) {
    return new BizException(BizCode.COMMON_PARAM_INVALID, message, payload);
  }

  /** 权限不足 */
  static forbidden(message?: string) {
    return new BizException(BizCode.PERMISSION_DENIED, message);
  }

  /** 未认证 */
  static unauthorized(bizCode: number = BizCode.TOKEN_INVALID, message?: string) {
    return new BizException(bizCode, message);
  }
}
