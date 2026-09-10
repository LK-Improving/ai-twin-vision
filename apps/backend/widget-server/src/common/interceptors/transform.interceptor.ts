import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { BizCode, type ApiResponse } from '@dt/shared-types';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

/**
 * 统一响应拦截器（详细设计 4.1.2）。
 * 把 Controller 返回的裸数据包装成 { code, message, data, timestamp }。
 * 若返回值已符合响应结构（含 code 与 timestamp），则原样透传。
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<Request & { traceId?: string }>();
    const customMessage = this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return next.handle().pipe(
      map((data) => {
        if (
          data &&
          typeof data === 'object' &&
          'code' in (data as Record<string, unknown>) &&
          'timestamp' in (data as Record<string, unknown>)
        ) {
          return data as unknown as ApiResponse<T>;
        }
        return {
          code: BizCode.SUCCESS,
          message: customMessage ?? 'success',
          data: (data ?? null) as T,
          timestamp: new Date().toISOString(),
          traceId: request?.traceId,
        };
      }),
    );
  }
}
