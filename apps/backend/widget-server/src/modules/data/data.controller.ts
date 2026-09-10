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
import type { DataSourceItem, DataSourceTestResult, PageResult } from '@dt/shared-types';
import { DataSourceService } from './data.service';
import {
  CreateDataMappingDto,
  CreateDataSourceDto,
  DataSourceQueryBodyDto,
  DataSourceQueryDto,
  UpdateDataSourceDto,
} from './dto/data.dto';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { PageQueryDto } from '../../common/dto/page-query.dto';

@ApiTags('数据源与数据映射')
@ApiBearerAuth()
@Controller({ path: 'data-sources', version: '1' })
export class DataSourceController {
  constructor(private readonly dataSourceService: DataSourceService) {}

  @Get()
  @ApiOperation({ summary: '获取数据源列表' })
  @RequirePermissions(Permissions.DATASOURCE_VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: DataSourceQueryDto & PageQueryDto,
  ): Promise<PageResult<DataSourceItem>> {
    return this.dataSourceService.paginate(user.tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取数据源详情（敏感字段已脱敏）' })
  @ApiParam({ name: 'id', description: '数据源 ID' })
  @RequirePermissions(Permissions.DATASOURCE_VIEW)
  detail(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<DataSourceItem> {
    return this.dataSourceService.detail(user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: '创建数据源' })
  @RequirePermissions(Permissions.DATASOURCE_MANAGE)
  @ResponseMessage('创建成功')
  @OperationLog({ module: '数据源管理', action: '创建数据源', recordParams: false })
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateDataSourceDto,
  ): Promise<DataSourceItem> {
    return this.dataSourceService.create(user.tenantId, user.userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新数据源' })
  @RequirePermissions(Permissions.DATASOURCE_MANAGE)
  @ResponseMessage('更新成功')
  @OperationLog({ module: '数据源管理', action: '更新数据源', recordParams: false })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateDataSourceDto,
  ): Promise<DataSourceItem> {
    return this.dataSourceService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除数据源' })
  @RequirePermissions(Permissions.DATASOURCE_MANAGE)
  @ResponseMessage('删除成功')
  @OperationLog({ module: '数据源管理', action: '删除数据源' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<null> {
    await this.dataSourceService.remove(user.tenantId, id);
    return null;
  }

  @Post(':id/test')
  @HttpCode(200)
  @ApiOperation({ summary: '测试数据源连通性' })
  @ApiParam({ name: 'id', description: '数据源 ID' })
  @RequirePermissions(Permissions.DATASOURCE_MANAGE)
  test(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<DataSourceTestResult> {
    return this.dataSourceService.test(user.tenantId, id);
  }

  @Post(':id/query')
  @HttpCode(200)
  @ApiOperation({
    summary: '运行时代理查询',
    description: '大屏节点绑定的数据源统一由此出口拉取，避免前端直连业务库导致凭据泄露。',
  })
  @ApiParam({ name: 'id', description: '数据源 ID' })
  @RequirePermissions(Permissions.DATASOURCE_VIEW)
  queryRuntime(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: DataSourceQueryBodyDto,
  ): Promise<unknown> {
    return this.dataSourceService.queryRuntime(user.tenantId, id, body);
  }
}

@ApiTags('数据源与数据映射')
@ApiBearerAuth()
@Controller({ path: 'data-mappings', version: '1' })
export class DataMappingController {
  constructor(private readonly dataSourceService: DataSourceService) {}

  @Post()
  @ApiOperation({ summary: '创建数据映射（数据源 → 场景组件）' })
  @RequirePermissions(Permissions.DATASOURCE_MANAGE)
  @ResponseMessage('创建成功')
  @OperationLog({ module: '数据映射', action: '创建映射' })
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateDataMappingDto,
  ): Promise<{ id: string }> {
    return this.dataSourceService.createMapping(user.tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: '查询场景下的数据映射' })
  @RequirePermissions(Permissions.DATASOURCE_VIEW)
  list(@Query('sceneId') sceneId: string): Promise<unknown[]> {
    return this.dataSourceService.listMappings(sceneId);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除数据映射' })
  @RequirePermissions(Permissions.DATASOURCE_MANAGE)
  @ResponseMessage('删除成功')
  async remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<null> {
    await this.dataSourceService.removeMapping(id);
    return null;
  }
}
