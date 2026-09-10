import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@dt/shared-types';
import type { OperationLogItem, PageResult } from '@dt/shared-types';
import { OperationLogService } from './operation-log.service';
import { OperationLogQueryDto } from './dto/log.dto';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PageQueryDto } from '../../common/dto/page-query.dto';

@ApiTags('系统日志')
@ApiBearerAuth()
@Controller({ path: 'operation-logs', version: '1' })
export class LogController {
  constructor(private readonly logService: OperationLogService) {}

  @Get()
  @ApiOperation({ summary: '查询操作日志（分页）' })
  @RequirePermissions(Permissions.SYSTEM_LOG_VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: OperationLogQueryDto & PageQueryDto,
  ): Promise<PageResult<OperationLogItem>> {
    return this.logService.paginate(user.tenantId, query);
  }
}
