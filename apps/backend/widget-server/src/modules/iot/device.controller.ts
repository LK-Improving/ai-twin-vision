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
import type { DeviceItem, PageResult, TelemetryPoint } from '@dt/shared-types';
import { DeviceService } from './device.service';
import {
  CreateDeviceDto,
  DeviceQueryDto,
  PushTelemetryDto,
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
  constructor(private readonly deviceService: DeviceService) {}

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
    return this.deviceService.create(user.tenantId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新设备' })
  @RequirePermissions(Permissions.DEVICE_MANAGE)
  @ResponseMessage('更新成功')
  @OperationLog({ module: '设备管理', action: '更新设备' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: Partial<Pick<DeviceItem, 'deviceName' | 'deviceType' | 'status'>> & {
      connectionConfig?: Record<string, unknown>;
    },
  ): Promise<DeviceItem> {
    return this.deviceService.update(user.tenantId, id, body);
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
    await this.deviceService.remove(user.tenantId, id);
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
