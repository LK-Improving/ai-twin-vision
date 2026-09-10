import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import {
  OPERATION_LOG_KEY,
  type OperationLogMeta,
} from '../decorators/operation-log.decorator';
import { OperationLogService } from '../../modules/log/operation-log.service';
import type { RequestUser } from '../decorators/current-user.decorator';
import type { Request, Response } from 'express';

/**
 * 操作日志拦截器（需求模块六：操作日志与监控）。
 * 仅对标记 @OperationLog 的接口落库，写入失败不影响主流程。
 */
@Injectable()
export class OperationLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly operationLogService: OperationLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<OperationLogMeta>(OPERATION_LOG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: RequestUser }>();
    const response = http.getResponse<Response>();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.write(meta, request, response.statusCode, Date.now() - start),
        error: (error) => {
          const status = typeof error?.getStatus === 'function' ? error.getStatus() : 500;
          this.write(meta, request, status, Date.now() - start);
        },
      }),
    );
  }

  private write(
    meta: OperationLogMeta,
    request: Request & { user?: RequestUser },
    status: number,
    cost: number,
  ): void {
    const user = request.user;
    if (!user) return;

    const params = meta.recordParams === false ? null : this.pickParams(request);

    void this.operationLogService
      .record({
        tenantId: user.tenantId,
        userId: user.userId,
        username: user.username,
        module: meta.module,
        action: meta.action,
        requestMethod: request.method,
        requestUrl: request.originalUrl.slice(0, 500),
        requestParams: params,
        responseStatus: status,
        responseTime: cost,
        ipAddress: this.resolveIp(request),
        userAgent: (request.headers['user-agent'] ?? '').slice(0, 500),
      })
      .catch(() => undefined);
  }

  /** 收集请求参数并剔除敏感字段 */
  private pickParams(request: Request): Record<string, unknown> {
    const raw: Record<string, unknown> = {
      ...(request.params ?? {}),
      ...(request.query ?? {}),
    };
    if (request.body && typeof request.body === 'object') {
      for (const [key, value] of Object.entries(request.body as Record<string, unknown>)) {
        raw[key] = /password|secret|token/i.test(key) ? '******' : value;
      }
    }
    // 避免超大 JSONB（如整份场景快照）写入日志表
    const serialized = JSON.stringify(raw);
    if (serialized.length > 4000) {
      return { _truncated: true, size: serialized.length };
    }
    return raw;
  }

  private resolveIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded)
      ? forwarded[0]
      : (forwarded ?? request.socket?.remoteAddress ?? '');
    return ip.split(',')[0].trim().slice(0, 45) || '0.0.0.0';
  }
}
