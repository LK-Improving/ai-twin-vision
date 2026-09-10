import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import type { OperationLogItem, PageResult } from '@dt/shared-types';
import { OperationLogEntity } from './entities';
import { normalizePage } from '../../common/utils/page.util';
import type { OperationLogQueryDto } from './dto/log.dto';
import { PageQueryDto } from '../../common/dto/page-query.dto';

/** 写入操作日志的入参（供拦截器使用） */
export interface CreateOperationLogInput {
  tenantId: string;
  userId: string;
  username: string;
  module: string;
  action: string;
  requestMethod: string;
  requestUrl: string;
  requestParams?: Record<string, unknown> | null;
  responseStatus: number;
  responseTime: number;
  ipAddress: string;
  userAgent?: string | null;
}

/**
 * 日志服务（需求模块六：审计与运维）。
 * 操作日志由 OperationLogInterceptor 自动写入，本服务负责落库与查询。
 */
@Injectable()
export class OperationLogService {
  constructor(
    @InjectRepository(OperationLogEntity)
    private readonly logRepo: Repository<OperationLogEntity>,
  ) {}

  /** 写入一条操作日志（异步失败不影响主流程，由调用方 catch） */
  async record(input: CreateOperationLogInput): Promise<void> {
    await this.logRepo.save(
      this.logRepo.create({
        tenantId: input.tenantId,
        userId: input.userId,
        username: input.username,
        module: input.module,
        action: input.action,
        requestMethod: input.requestMethod,
        requestUrl: input.requestUrl,
        requestParams: input.requestParams ?? null,
        responseStatus: input.responseStatus,
        responseTime: input.responseTime,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent ?? null,
      }),
    );
  }

  /** 分页查询操作日志 */
  async paginate(
    tenantId: string,
    query: OperationLogQueryDto & PageQueryDto,
  ): Promise<PageResult<OperationLogItem>> {
    const { page, limit, skip } = normalizePage(query);
    const qb = this.logRepo
      .createQueryBuilder('log')
      .where('log.tenant_id = :tenantId', { tenantId });

    if (query.userId) qb.andWhere('log.user_id = :userId', { userId: query.userId });
    if (query.module) qb.andWhere('log.module = :module', { module: query.module });
    if (query.startTime) qb.andWhere('log.created_at >= :start', { start: new Date(query.startTime) });
    if (query.endTime) qb.andWhere('log.created_at <= :end', { end: new Date(query.endTime) });
    if (query.keyword) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('log.username ILIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('log.action ILIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('log.request_url ILIKE :kw', { kw: `%${query.keyword}%` });
        }),
      );
    }

    const [rows, total] = await qb
      .orderBy('log.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { total, page, limit, dataList: rows.map((r) => this.toItem(r)) };
  }

  private toItem(entity: OperationLogEntity): OperationLogItem {
    return {
      id: entity.id,
      userId: entity.userId,
      username: entity.username,
      module: entity.module,
      action: entity.action,
      requestMethod: entity.requestMethod,
      requestUrl: entity.requestUrl,
      requestParams: entity.requestParams,
      responseStatus: entity.responseStatus,
      responseTime: entity.responseTime,
      ipAddress: entity.ipAddress,
      userAgent: entity.userAgent,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
