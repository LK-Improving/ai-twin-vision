import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DeviceEntity,
  DevicePropertyEntity,
  DeviceTelemetryEntity,
  AlertRuleEntity,
  AlertEventEntity,
} from './entities';
import { DeviceService } from './device.service';
import { DeviceIngestService } from './ingest.service';
import { DeviceController } from './device.controller';
import { AlertService } from './alert.service';
import { AlertController } from './alert.controller';
import { GatewayModule } from '../gateway/gateway.module';

/**
 * IoT 模块（需求模块五的采集侧）：设备登记、心跳、遥测时序读写。
 * Sprint 1 起接入实时链路：GatewayModule 提供广播通道，DeviceIngestService
 * 拉起协议驱动（MQTT）把设备报文落库并推送前端。
 * Sprint 2 起补充最小告警：AlertService 在遥测落库后评估规则并广播。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeviceEntity,
      DevicePropertyEntity,
      DeviceTelemetryEntity,
      AlertRuleEntity,
      AlertEventEntity,
    ]),
    GatewayModule,
  ],
  controllers: [DeviceController, AlertController],
  providers: [DeviceService, DeviceIngestService, AlertService],
  exports: [DeviceService, AlertService],
})
export class IotModule {}
