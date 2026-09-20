import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  BizCode,
  type DeviceItem,
  type PageResult,
  type TelemetryHistoryPoint,
  type TelemetryPoint,
} from '@dt/shared-types';
import { DeviceEntity, DevicePropertyEntity, DeviceTelemetryEntity } from './entities';
import { BizException } from '../../common/exceptions/biz.exception';
import { AlertService } from './alert.service';
import { normalizePage } from '../../common/utils/page.util';
import type {
  CreateDeviceDto,
  DeviceQueryDto,
  PushTelemetryDto,
  TelemetryHistoryQueryDto,
  TelemetryQueryDto,
} from './dto/device.dto';
import { PageQueryDto } from '../../common/dto/page-query.dto';

/**
 * IoT 设备服务（需求模块五的数据采集侧）。
 *
 * 说明：设备接入网关（MQTT/OPC-UA/Modbus）在 Phase 3 落地，
 * 当前提供设备登记、在线状态维护与遥测时序的读写接口，
 * 网关就绪后直接调用 pushTelemetry 写入即可，无需改动存储层。
 */
@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(
    @InjectRepository(DeviceEntity)
    private readonly deviceRepo: Repository<DeviceEntity>,
    @InjectRepository(DevicePropertyEntity)
    private readonly propertyRepo: Repository<DevicePropertyEntity>,
    @InjectRepository(DeviceTelemetryEntity)
    private readonly telemetryRepo: Repository<DeviceTelemetryEntity>,
    private readonly alertService: AlertService,
  ) {}

  async paginate(
    tenantId: string,
    query: DeviceQueryDto & PageQueryDto,
  ): Promise<PageResult<DeviceItem>> {
    const { page, limit, skip } = normalizePage(query);
    const qb = this.deviceRepo
      .createQueryBuilder('device')
      .where('device.deleted_at IS NULL')
      .andWhere('device.tenant_id = :tenantId', { tenantId });

    if (query.deviceType)
      qb.andWhere('device.device_type = :deviceType', { deviceType: query.deviceType });
    if (query.protocol) qb.andWhere('device.protocol = :protocol', { protocol: query.protocol });
    if (query.status !== undefined)
      qb.andWhere('device.status = :status', { status: query.status });
    if (query.keyword) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('device.device_code ILIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('device.device_name ILIKE :kw', { kw: `%${query.keyword}%` });
        }),
      );
    }

    const [rows, total] = await qb
      .orderBy('device.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { total, page, limit, dataList: rows.map((r) => this.toItem(r)) };
  }

  async detail(tenantId: string, id: string): Promise<DeviceItem> {
    const entity = await this.findOrFail(tenantId, id);
    return this.toItem(entity);
  }

  async create(tenantId: string, dto: CreateDeviceDto): Promise<DeviceItem> {
    const dup = await this.deviceRepo.findOne({ where: { tenantId, deviceCode: dto.deviceCode } });
    if (dup) throw new BizException(BizCode.COMMON_DUPLICATE_NAME, '设备编码已存在');

    const saved = await this.deviceRepo.save(
      this.deviceRepo.create({
        tenantId,
        deviceCode: dto.deviceCode,
        deviceName: dto.deviceName,
        deviceType: dto.deviceType,
        protocol: dto.protocol,
        connectionConfig: dto.connectionConfig,
        status: 0,
      }),
    );
    return this.toItem(saved);
  }

  async update(
    tenantId: string,
    id: string,
    patch: Partial<Pick<DeviceItem, 'deviceName' | 'deviceType' | 'status'>> & {
      connectionConfig?: Record<string, unknown>;
    },
  ): Promise<DeviceItem> {
    const entity = await this.findOrFail(tenantId, id);
    if (patch.deviceName !== undefined) entity.deviceName = patch.deviceName;
    if (patch.deviceType !== undefined) entity.deviceType = patch.deviceType;
    if (patch.status !== undefined) entity.status = patch.status;
    if (patch.connectionConfig !== undefined) {
      entity.connectionConfig = { ...entity.connectionConfig, ...patch.connectionConfig };
    }
    await this.deviceRepo.save(entity);
    return this.toItem(entity);
  }

  /** 删除设备（软删除；遥测时序数据保留用于历史回溯） */
  async remove(tenantId: string, id: string): Promise<void> {
    const entity = await this.findOrFail(tenantId, id);
    await this.deviceRepo.softDelete({ id });
  }

  /** 设备心跳：更新在线状态与最后在线时间 */
  async heartbeat(tenantId: string, deviceCode: string, online: boolean): Promise<void> {
    const device = await this.deviceRepo.findOne({ where: { tenantId, deviceCode } });
    if (!device) throw new BizException(BizCode.DEVICE_NOT_FOUND);
    device.status = online ? 1 : 0;
    if (online) device.lastOnlineAt = new Date();
    await this.deviceRepo.save(device);
  }

  /** 写入遥测点（网关或模拟数据调用） */
  async pushTelemetry(tenantId: string, dto: PushTelemetryDto): Promise<void> {
    const device = await this.deviceRepo.findOne({
      where: { tenantId, deviceCode: dto.deviceCode },
    });
    if (!device) throw new BizException(BizCode.DEVICE_NOT_FOUND);

    await this.telemetryRepo.insert({
      timestamp: dto.timestamp ? new Date(dto.timestamp) : new Date(),
      deviceId: device.id,
      propertyCode: dto.propertyCode,
      value: dto.value,
    });

    // 收到数据即视为在线
    device.status = 1;
    device.lastOnlineAt = new Date();
    await this.deviceRepo.save(device);

    // 手动注入遥测也参与告警评估（与 MQTT 采集路径一致）
    void this.alertService
      .evaluate(tenantId, { id: device.id, deviceCode: device.deviceCode }, [
        { propertyCode: dto.propertyCode, value: dto.value },
      ])
      .catch((err) =>
        this.logger.warn(`告警评估失败（device=${device.deviceCode}）：${(err as Error).message}`),
      );
  }

  /** 查询设备属性最新值：无 propertyCode 时返回全部属性的最新点 */
  async latestProperty(
    tenantId: string,
    deviceId: string,
    propertyCode?: string,
  ): Promise<unknown> {
    await this.findOrFail(tenantId, deviceId);
    const qb = this.telemetryRepo
      .createQueryBuilder('t')
      .where('t.device_id = :deviceId', { deviceId })
      .orderBy('t.timestamp', 'DESC');

    if (propertyCode) {
      qb.andWhere('t.property_code = :propertyCode', { propertyCode });
      const one = await qb.getOne();
      return one
        ? { propertyCode: one.propertyCode, value: one.value, timestamp: one.timestamp }
        : null;
    }

    // 多属性：按属性分组取各自最新一条
    const rows = await this.telemetryRepo.query(
      `SELECT DISTINCT ON (property_code) property_code, value, timestamp
       FROM iot_device_telemetry
       WHERE device_id = $1
       ORDER BY property_code, timestamp DESC`,
      [deviceId],
    );
    return (rows as Array<{ property_code: string; value: number; timestamp: Date }>).map((r) => ({
      propertyCode: r.property_code,
      value: r.value,
      timestamp: r.timestamp,
    }));
  }

  /** 按时间范围查询遥测序列 */
  async telemetry(
    tenantId: string,
    deviceId: string,
    query: TelemetryQueryDto,
  ): Promise<TelemetryPoint[]> {
    await this.findOrFail(tenantId, deviceId);
    const qb = this.telemetryRepo
      .createQueryBuilder('t')
      .where('t.device_id = :deviceId', { deviceId });

    if (query.propertyCodes) {
      const codes = query.propertyCodes
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      if (codes.length > 0) qb.andWhere('t.property_code IN (:...codes)', { codes });
    }
    if (query.startTime) qb.andWhere('t.timestamp >= :start', { start: new Date(query.startTime) });
    if (query.endTime) qb.andWhere('t.timestamp <= :end', { end: new Date(query.endTime) });

    const rows = await qb
      .orderBy('t.timestamp', 'DESC')
      .take(Math.min(query.limit ?? 1000, 5000))
      .getMany();

    return rows.map((r) => ({
      timestamp: r.timestamp.toISOString(),
      deviceId: r.deviceId,
      propertyCode: r.propertyCode,
      value: r.value,
    }));
  }

  /**
   * 遥测聚合历史（降采样）：按 interval 秒分桶，返回 avg/max/min 与样本数。
   * 使用 epoch 取整分桶而非 date_bin，兼容无 TimescaleDB 扩展的环境（如 Supabase）。
   */
  async telemetryHistory(
    tenantId: string,
    deviceId: string,
    query: TelemetryHistoryQueryDto,
  ): Promise<TelemetryHistoryPoint[]> {
    await this.findOrFail(tenantId, deviceId);

    const end = query.endTime ? new Date(query.endTime) : new Date();
    const start = query.startTime
      ? new Date(query.startTime)
      : new Date(end.getTime() - 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      throw new BizException(BizCode.COMMON_PARAM_INVALID, '时间范围无效');
    }

    // interval：显式指定（10s~1d）；否则按目标 300 桶自动推算并对齐到常规粒度
    let intervalSec = query.interval ? parseIntervalSeconds(query.interval) : 0;
    if (!intervalSec) {
      const raw = Math.max(10, Math.ceil((end.getTime() - start.getTime()) / 1000 / 300));
      const steps = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 86400];
      intervalSec = steps.find((s) => s >= raw) ?? 86400;
    }
    intervalSec = Math.min(Math.max(intervalSec, 10), 86_400);

    const codes = query.propertyCodes
      ? query.propertyCodes
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
      : [];

    const rows = (await this.telemetryRepo.query(
      `SELECT to_timestamp(floor(extract(epoch FROM "timestamp") / $1) * $1) AS bucket,
              property_code,
              AVG(value)::double precision   AS avg_value,
              MAX(value)::double precision   AS max_value,
              MIN(value)::double precision   AS min_value,
              COUNT(*)::int                  AS sample_count
       FROM iot_device_telemetry
       WHERE device_id = $2
         AND "timestamp" >= $3
         AND "timestamp" <= $4
         AND ($5::text[] IS NULL OR cardinality($5::text[]) = 0 OR property_code = ANY($5::text[]))
       GROUP BY bucket, property_code
       ORDER BY property_code ASC, bucket ASC
       LIMIT $6`,
      [intervalSec, deviceId, start, end, codes, 5000],
    )) as Array<{
      bucket: Date | string;
      property_code: string;
      avg_value: number;
      max_value: number;
      min_value: number;
      sample_count: number;
    }>;

    return rows.map((r) => ({
      timestamp: new Date(r.bucket).toISOString(),
      propertyCode: r.property_code,
      aggValue: Number(r.avg_value),
      maxValue: Number(r.max_value),
      minValue: Number(r.min_value),
      sampleCount: Number(r.sample_count),
    }));
  }

  /** 查询设备属性定义 */
  async properties(deviceId: string): Promise<DevicePropertyEntity[]> {
    return this.propertyRepo.find({ where: { deviceId }, order: { propertyCode: 'ASC' } });
  }

  private async findOrFail(tenantId: string, id: string): Promise<DeviceEntity> {
    const entity = await this.deviceRepo.findOne({ where: { id, tenantId } });
    if (!entity) throw new BizException(BizCode.DEVICE_NOT_FOUND);
    return entity;
  }

  private toItem(entity: DeviceEntity): DeviceItem {
    return {
      id: entity.id,
      deviceCode: entity.deviceCode,
      deviceName: entity.deviceName,
      deviceType: entity.deviceType,
      protocol: entity.protocol,
      connectionConfig: entity.connectionConfig ?? {},
      status: entity.status,
      lastOnlineAt: entity.lastOnlineAt ? entity.lastOnlineAt.toISOString() : null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}

/** 解析聚合粒度字符串（1m / 5m / 1h / 30s / 1d）为秒；非法返回 0 */
function parseIntervalSeconds(interval: string): number {
  const match = /^(\d+)([smhd])$/.exec(interval.trim());
  if (!match) return 0;
  const value = Number(match[1]);
  const unitSeconds: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };
  return value > 0 ? value * unitSeconds[match[2]] : 0;
}
