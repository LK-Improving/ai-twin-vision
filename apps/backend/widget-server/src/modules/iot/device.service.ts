import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { BizCode, type DeviceItem, type PageResult, type TelemetryPoint } from '@dt/shared-types';
import { DeviceEntity, DevicePropertyEntity, DeviceTelemetryEntity } from './entities';
import { BizException } from '../../common/exceptions/biz.exception';
import { normalizePage } from '../../common/utils/page.util';
import type {
  CreateDeviceDto,
  DeviceQueryDto,
  PushTelemetryDto,
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
  ) {}

  async paginate(tenantId: string, query: DeviceQueryDto & PageQueryDto): Promise<PageResult<DeviceItem>> {
    const { page, limit, skip } = normalizePage(query);
    const qb = this.deviceRepo
      .createQueryBuilder('device')
      .where('device.deleted_at IS NULL')
      .andWhere('device.tenant_id = :tenantId', { tenantId });

    if (query.deviceType) qb.andWhere('device.device_type = :deviceType', { deviceType: query.deviceType });
    if (query.protocol) qb.andWhere('device.protocol = :protocol', { protocol: query.protocol });
    if (query.status !== undefined) qb.andWhere('device.status = :status', { status: query.status });
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
    const device = await this.deviceRepo.findOne({ where: { tenantId, deviceCode: dto.deviceCode } });
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
  }

  /** 查询设备属性最新值：无 propertyCode 时返回全部属性的最新点 */
  async latestProperty(tenantId: string, deviceId: string, propertyCode?: string): Promise<unknown> {
    await this.findOrFail(tenantId, deviceId);
    const qb = this.telemetryRepo
      .createQueryBuilder('t')
      .where('t.device_id = :deviceId', { deviceId })
      .orderBy('t.timestamp', 'DESC');

    if (propertyCode) {
      qb.andWhere('t.property_code = :propertyCode', { propertyCode });
      const one = await qb.getOne();
      return one ? { propertyCode: one.propertyCode, value: one.value, timestamp: one.timestamp } : null;
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
      const codes = query.propertyCodes.split(',').map((c) => c.trim()).filter(Boolean);
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
