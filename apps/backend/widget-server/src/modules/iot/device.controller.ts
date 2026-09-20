import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@dt/shared-types';
import type {
  DeviceItem,
  PageResult,
  TelemetryHistoryPoint,
  TelemetryPoint,
} from '@dt/shared-types';
import { DeviceService } from './device.service';
import { DeviceIngestService } from './ingest.service';
import {
  CreateDeviceDto,
  DeviceQueryDto,
  PushTelemetryDto,
  TelemetryHistoryQueryDto,
  TelemetryQueryDto,
} from './dto/device.dto';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { PageQueryDto } from '../../common/dto/page-query.dto';

@ApiTags('IoT 设备')
@ApiBearerAuth()
@Controller({ path: 'devices', version: '1' })
export class DeviceController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly ingestService: DeviceIngestService,
  ) {}

  @Get()
  @ApiOperation({ summary: '获取设备列表' })
  @RequirePermissions(Permissions.DEVICE_VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: DeviceQueryDto & PageQueryDto,
  ): Promise<PageResult<DeviceItem>> {
    return this.deviceService.paginate(user.tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取设备详情' })
  @ApiParam({ name: 'id', description: '设备 ID' })
  @RequirePermissions(Permissions.DEVICE_VIEW)
  detail(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<DeviceItem> {
    return this.deviceService.detail(user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: '登记设备' })
  @RequirePermissions(Permissions.DEVICE_MANAGE)
  @ResponseMessage('创建成功')
  @OperationLog({ module: '设备管理', action: '登记设备' })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateDeviceDto): Promise<DeviceItem> {
    return this.deviceService.create(user.tenantId, dto).then(async (item) => {
      // 新登记的 MQTT 设备立即接入（协议驱动按 broker 分组重建）
      if (item.protocol === 'MQTT') await this.ingestService.refresh();
      return item;
    });
  }

  @Put(':id')
  @ApiOperation({ summary: '更新设备' })
  @RequirePermissions(Permissions.DEVICE_MANAGE)
  @ResponseMessage('更新成功')
  @OperationLog({ module: '设备管理', action: '更新设备' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body()
    body: Partial<Pick<DeviceItem, 'deviceName' | 'deviceType' | 'status'>> & {
      connectionConfig?: Record<string, unknown>;
    },
  ): Promise<DeviceItem> {
    return this.deviceService.update(user.tenantId, id, body).then(async (item) => {
      if (item.protocol === 'MQTT') await this.ingestService.refresh();
      return item;
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除设备' })
  @RequirePermissions(Permissions.DEVICE_MANAGE)
  @ResponseMessage('删除成功')
  @OperationLog({ module: '设备管理', action: '删除设备' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<null> {
    const detail = await this.deviceService.detail(user.tenantId, id);
    await this.deviceService.remove(user.tenantId, id);
    if (detail.protocol === 'MQTT') await this.ingestService.refresh();
    return null;
  }

  @Get(':id/properties')
  @ApiOperation({ summary: '查询设备属性定义' })
  @RequirePermissions(Permissions.DEVICE_VIEW)
  properties(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<unknown> {
    return this.deviceService.properties(id);
  }

  @Get(':id/properties/latest')
  @ApiOperation({ summary: '查询设备属性最新值' })
  @RequirePermissions(Permissions.DEVICE_VIEW)
  latest(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('propertyCode') propertyCode?: string,
  ): Promise<unknown> {
    return this.deviceService.latestProperty(user.tenantId, id, propertyCode);
  }

  @Get(':id/telemetry')
  @ApiOperation({ summary: '查询设备遥测时序' })
  @RequirePermissions(Permissions.DEVICE_VIEW)
  telemetry(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: TelemetryQueryDto,
  ): Promise<TelemetryPoint[]> {
    return this.deviceService.telemetry(user.tenantId, id, query);
  }

  @Get(':id/telemetry/history')
  @ApiOperation({ summary: '查询设备遥测聚合历史（按粒度降采样）' })
  @ApiParam({ name: 'id', description: '设备 ID' })
  @RequirePermissions(Permissions.DEVICE_VIEW)
  telemetryHistory(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: TelemetryHistoryQueryDto,
  ): Promise<TelemetryHistoryPoint[]> {
    return this.deviceService.telemetryHistory(user.tenantId, id, query);
  }

  @Post('telemetry')
  @HttpCode(200)
  @ApiOperation({ summary: '写入遥测数据（设备网关调用）' })
  @RequirePermissions(Permissions.DEVICE_MANAGE)
  pushTelemetry(@CurrentUser() user: RequestUser, @Body() dto: PushTelemetryDto): Promise<null> {
    return this.deviceService.pushTelemetry(user.tenantId, dto).then(() => null);
  }

  @Post(':code/heartbeat')
  @HttpCode(200)
  @ApiOperation({ summary: '设备心跳上报' })
  @RequirePermissions(Permissions.DEVICE_MANAGE)
  heartbeat(
    @CurrentUser() user: RequestUser,
    @Param('code') code: string,
    @Body('online') online: boolean,
  ): Promise<null> {
    return this.deviceService.heartbeat(user.tenantId, code, online !== false).then(() => null);
  }
}
