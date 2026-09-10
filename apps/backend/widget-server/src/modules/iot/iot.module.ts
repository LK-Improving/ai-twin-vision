import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceEntity, DevicePropertyEntity, DeviceTelemetryEntity } from './entities';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';

/**
 * IoT 模块（需求模块五的采集侧）：设备登记、心跳、遥测时序读写。
 * 告警规则与事件实体已在 iot/entities.ts 定义，Phase 3 接入网关时补充服务层。
 */
@Module({
  imports: [TypeOrmModule.forFeature([DeviceEntity, DevicePropertyEntity, DeviceTelemetryEntity])],
  controllers: [DeviceController],
  providers: [DeviceService],
  exports: [DeviceService],
})
export class IotModule {}
