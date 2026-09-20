import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';
import { BizCode, type ApiResponse } from '@dt/shared-types';
import { BizException } from '../exceptions/biz.exception';
import type { Request } from 'express';

/**
 * 全局异常过滤器。
 * 无论何种异常，对外都返回统一响应结构，避免泄漏堆栈（详细设计 2.4 / 3.5）。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { traceId?: string }>();
    const response = ctx.getResponse();

    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let bizCode: number = BizCode.INTERNAL_ERROR;
    let message = '服务器内部错误';
    let data: unknown = null;

    if (exception instanceof BizException) {
      httpStatus = exception.getStatus();
      bizCode = exception.bizCode;
      message = exception.message;
      data = exception.payload ?? null;
    } else if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      bizCode = httpStatus;
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        const body = res as { message?: string | string[]; error?: string };
        // ValidationPipe 会返回 message 数组
        if (Array.isArray(body.message)) {
          bizCode = BizCode.COMMON_PARAM_INVALID;
          message = body.message[0] ?? '参数校验失败';
          data = body.message;
        } else {
          message = body.message ?? body.error ?? exception.message;
        }
      }
    } else if (exception instanceof QueryFailedError) {
      // 数据库异常不外泄 SQL 明文
      httpStatus = HttpStatus.BAD_REQUEST;
      const driverError = exception as QueryFailedError & { code?: string; detail?: string };
      if (driverError.code === '23505') {
        bizCode = BizCode.COMMON_DUPLICATE_NAME;
        message = '数据已存在，违反唯一约束';
      } else if (driverError.code === '23503') {
        bizCode = BizCode.COMMON_OPERATION_FAILED;
        message = '存在关联数据，操作被拒绝';
      } else {
        bizCode = BizCode.COMMON_OPERATION_FAILED;
        message = '数据库操作失败';
      }
      // 非生产环境回带 PG 错误码/详情，便于快速定位（如 22001 列宽溢出）；生产不外泄
      if (process.env.NODE_ENV !== 'production') {
        data = { dbCode: driverError.code ?? null, dbDetail: driverError.detail ?? null };
      }
      this.logger.error(`数据库异常 ${driverError.code ?? ''}: ${exception.message}`);
    } else if (exception instanceof Error) {
      message = process.env.NODE_ENV === 'production' ? '服务器内部错误' : exception.message;
    }

    // 5xx 打印完整堆栈，4xx 仅告警，避免日志噪音
    if (httpStatus >= 500) {
      this.logger.error(
        `[${request?.method}] ${request?.url} → ${httpStatus} ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`[${request?.method}] ${request?.url} → ${httpStatus} ${message}`);
    }

    const body: ApiResponse<unknown> = {
      code: bizCode,
      message,
      data,
      timestamp: new Date().toISOString(),
      traceId: request?.traceId,
    };

    httpAdapter.reply(response, body, httpStatus);
  }
}
