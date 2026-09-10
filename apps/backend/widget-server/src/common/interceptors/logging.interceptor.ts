import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

/**
 * 请求日志与链路追踪拦截器。
 * 为每个入站请求生成 traceId 并贯穿响应体（详细设计 6.3 链路追踪），
 * 同时记录响应耗时，为后续接入 OpenTelemetry 预留切入点。
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { traceId?: string }>();
    const response = http.getResponse<Response>();

    const incoming = request.headers['x-trace-id'];
    const traceId = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    request.traceId = traceId;
    response.setHeader('X-Trace-Id', traceId);

    const start = Date.now();
    const { method, originalUrl } = request;

    return next.handle().pipe(
      tap({
        next: () => {
          const cost = Date.now() - start;
          // 慢接口单独告警，P99 达标线 500ms（详细设计 3.4）
          const message = `${method} ${originalUrl} ${response.statusCode} ${cost}ms trace=${traceId}`;
          if (cost > 500) {
            this.logger.warn(`[慢请求] ${message}`);
          } else {
            this.logger.log(message);
          }
        },
        error: () => {
          const cost = Date.now() - start;
          this.logger.warn(`${method} ${originalUrl} 异常 ${cost}ms trace=${traceId}`);
        },
      }),
    );
  }
}
