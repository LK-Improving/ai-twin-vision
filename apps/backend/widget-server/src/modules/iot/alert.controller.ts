import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@dt/shared-types';
import type { AlertRuleItem } from '@dt/shared-types';
import { AlertService } from './alert.service';
import { CreateAlertRuleRequest, UpdateAlertRuleRequest } from '@dt/shared-types';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('告警规则')
@ApiBearerAuth()
@Controller({ path: 'alert-rules', version: '1' })
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Get()
  @ApiOperation({ summary: '告警规则列表（按租户）' })
  @RequirePermissions(Permissions.DEVICE_MANAGE)
  list(@CurrentUser() user: RequestUser): Promise<AlertRuleItem[]> {
    return this.alertService.list(user.tenantId);
  }

  @Post()
  @ApiOperation({ summary: '新建告警规则' })
  @RequirePermissions(Permissions.DEVICE_MANAGE)
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateAlertRuleRequest,
  ): Promise<AlertRuleItem> {
    return this.alertService.create(user.tenantId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新告警规则' })
  @ApiParam({ name: 'id', description: '规则 ID' })
  @RequirePermissions(Permissions.DEVICE_MANAGE)
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateAlertRuleRequest,
  ): Promise<AlertRuleItem> {
    return this.alertService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除告警规则' })
  @ApiParam({ name: 'id', description: '规则 ID' })
  @RequirePermissions(Permissions.DEVICE_MANAGE)
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<void> {
    return this.alertService.remove(user.tenantId, id);
  }
}
