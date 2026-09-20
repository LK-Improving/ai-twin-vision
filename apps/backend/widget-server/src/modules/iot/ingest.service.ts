import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AppConfig } from '../../config/configuration';
import { DeviceEntity, DeviceTelemetryEntity } from './entities';
import { RealtimeGateway } from '../gateway/realtime.gateway';
import { MqttDriver } from './drivers/mqtt.driver';
import { AlertService } from './alert.service';
import type { DeviceSubscription, DriverContext, ProtocolDriver } from './drivers/driver';

/**
 * 设备接入服务（Sprint 1 数据底座）。
 *
 * 职责：
 * 1. 启动时把 protocol=MQTT 的设备按 Broker 分组，交给 MqttDriver 建立长连接；
 * 2. 报文 → 标准遥测点 → 批量落库 iot_device_telemetry；
 * 3. 遥测/上下线通过 RealtimeGateway 广播到订阅房间；
 * 4. 设备 CRUD 后调用 refresh() 重建驱动连接。
 *
 * 说明：OPC-UA / Modbus 驱动实现同一 ProtocolDriver 契约后在 startDrivers 中追加即可。
 */
@Injectable()
export class DeviceIngestService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DeviceIngestService.name);
  /** brokerUrl → 驱动实例 */
  private drivers = new Map<string, ProtocolDriver>();
  /** deviceId → 最近一次状态落库时间（限流 DB 写入） */
  private lastStatusWrite = new Map<string, number>();
  private starting: Promise<void> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly realtime: RealtimeGateway,
    private readonly alertService: AlertService,
    @InjectRepository(DeviceEntity)
    private readonly deviceRepo: Repository<DeviceEntity>,
    @InjectRepository(DeviceTelemetryEntity)
    private readonly telemetryRepo: Repository<DeviceTelemetryEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // 接入失败不应阻断应用启动（如库表尚未初始化）：记录错误，后续可通过 refresh() 重试
    try {
      await this.refresh();
    } catch (error) {
      this.logger.error(`设备接入初始化失败：${(error as Error).message}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([...this.drivers.values()].map((d) => d.stop().catch(() => undefined)));
    this.drivers.clear();
  }

  /** 重建全部驱动连接（设备增删改后调用） */
  async refresh(): Promise<void> {
    if (!this.config.get<AppConfig['realtime']>('realtime')!.mqttIngest.enabled) {
      this.logger.log('MQTT 接入未启用（MQTT_INGEST_ENABLED=false），跳过驱动启动');
      return;
    }
    if (this.starting) return this.starting;
    this.starting = this.doRefresh().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async doRefresh(): Promise<void> {
    // DeleteDateColumn 软删除过滤由 TypeORM 自动生效
    const devices = await this.deviceRepo.find({ where: { protocol: 'MQTT' } });
    const mqttConfig = this.config.get<AppConfig['realtime']>('realtime')!.mqttIngest;

    // 设备按 broker 分组：connectionConfig.url 优先，缺省回落全局 Broker
    const groups = new Map<string, DeviceSubscription[]>();
    for (const device of devices) {
      const cfg = (device.connectionConfig ?? {}) as Record<string, unknown>;
      const topic =
        typeof cfg.topic === 'string' && cfg.topic
          ? cfg.topic
          : `device/${device.deviceCode}/telemetry`;
      const brokerUrl =
        typeof cfg.url === 'string' && cfg.url ? cfg.url : mqttConfig.defaultBrokerUrl;
      const list = groups.get(brokerUrl) ?? [];
      list.push({
        tenantId: device.tenantId,
        deviceId: device.id,
        deviceCode: device.deviceCode,
        topic,
        qos: typeof cfg.qos === 'number' ? cfg.qos : 1,
      });
      groups.set(brokerUrl, list);
    }

    // 停掉不再需要的驱动，启动/保留仍需要的
    await Promise.all(
      [...this.drivers.keys()]
        .filter((url) => !groups.has(url))
        .map((url) =>
          this.drivers
            .get(url)!
            .stop()
            .catch(() => undefined),
        ),
    );

    await Promise.all(
      [...groups.entries()].map(async ([brokerUrl, subscriptions]) => {
        const existing = this.drivers.get(brokerUrl);
        if (existing) return; // 已在运行的连接不动，避免订阅抖动
        await this.startDriver(brokerUrl, subscriptions, mqttConfig);
      }),
    );

    this.logger.log(`MQTT 接入就绪：${devices.length} 台设备，${groups.size} 个 Broker 连接`);
  }

  private async startDriver(
    brokerUrl: string,
    subscriptions: DeviceSubscription[],
    mqttConfig: AppConfig['realtime']['mqttIngest'],
  ): Promise<void> {
    const context: DriverContext = {
      onMessage: (device, _topic, points) => this.handleTelemetry(device, points),
      onStatus: (device, online) => this.handleStatus(device, online),
      onStatusAll: () => {
        // Broker 断线：不批量写库，仅由订阅端感知（Socket.IO 心跳）；恢复后首条报文会再置在线
        this.logger.warn(`Broker 断开：${brokerUrl}`);
      },
      onError: (source, error) => this.logger.warn(`驱动异常 [${source}]：${error.message}`),
    };
    const driver = new MqttDriver(
      {
        url: brokerUrl,
        clientIdPrefix: mqttConfig.clientIdPrefix,
        username: mqttConfig.username,
        password: mqttConfig.password,
      },
      context,
    );
    this.drivers.set(brokerUrl, driver);
    try {
      await driver.start(subscriptions);
    } catch (error) {
      this.drivers.delete(brokerUrl);
      // 必须显式 stop：mqtt.js 的 reconnectPeriod 会让客户端在后台持续重连，
      // 仅从 drivers 表移除会留下一条无人管理的孤儿连接。
      await driver.stop().catch(() => undefined);
      this.logger.error(`MQTT 驱动启动失败 ${brokerUrl}：${(error as Error).message}`);
    }
  }

  /** 遥测批量落库 + 实时广播 */
  private async handleTelemetry(
    device: DeviceSubscription,
    points: Array<{ propertyCode: string; value: number; timestamp?: string | number }>,
  ): Promise<void> {
    const rows = points.map((p) => ({
      deviceId: device.deviceId,
      propertyCode: p.propertyCode,
      value: p.value,
      timestamp: p.timestamp === undefined ? new Date() : new Date(p.timestamp),
    }));
    const valid = rows.filter((r) => !Number.isNaN(r.timestamp.getTime()));
    if (valid.length === 0) return;

    try {
      await this.telemetryRepo.insert(valid);
    } catch (error) {
      this.logger.warn(`遥测落库失败（device=${device.deviceCode}）：${(error as Error).message}`);
      return;
    }

    this.realtime.broadcastTelemetry(device.tenantId, device.deviceId, {
      deviceId: device.deviceId,
      deviceCode: device.deviceCode,
      tenantId: device.tenantId,
      points: valid.map((r) => ({
        propertyCode: r.propertyCode,
        value: r.value,
        timestamp: r.timestamp.toISOString(),
      })),
    });

    // 遥测落库广播后评估告警规则（失败不影响遥测主流程）
    void this.alertService
      .evaluate(
        device.tenantId,
        { id: device.deviceId, deviceCode: device.deviceCode },
        valid.map((r) => ({ propertyCode: r.propertyCode, value: r.value })),
      )
      .catch((err) =>
        this.logger.warn(`告警评估失败（device=${device.deviceCode}）：${(err as Error).message}`),
      );

    // 首条报文即视为上线；状态落库按 MQTT 状态限流窗口节流
    await this.handleStatus(device, true);
  }

  /** 设备上下线：广播 + 状态落库（节流，避免高频报文反复 UPDATE） */
  private async handleStatus(device: DeviceSubscription, online: boolean): Promise<void> {
    this.realtime.broadcastDeviceStatus(device.tenantId, device.deviceId, {
      deviceId: device.deviceId,
      deviceCode: device.deviceCode,
      tenantId: device.tenantId,
      status: online ? 1 : 0,
      lastOnlineAt: online ? new Date().toISOString() : null,
    });

    const now = Date.now();
    const last = this.lastStatusWrite.get(device.deviceId) ?? 0;
    const throttleMs =
      this.config.get<AppConfig['realtime']>('realtime')!.mqttIngest.statusThrottleMs;
    if (!online || now - last < throttleMs) return;
    this.lastStatusWrite.set(device.deviceId, now);

    try {
      await this.deviceRepo.update(
        { id: device.deviceId },
        { status: 1, lastOnlineAt: new Date() },
      );
    } catch {
      // 状态写入失败不影响遥测主流程
    }
  }
}
