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
  ComponentDetail,
  ComponentListItem,
  PageResult,
  TemplateDetail,
  TemplateListItem,
} from '@dt/shared-types';
import { ComponentService } from './component.service';
import {
  ComponentQueryDto,
  CreateComponentDto,
  CreateTemplateDto,
  UpdateComponentDto,
} from './dto/component.dto';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { PageQueryDto } from '../../common/dto/page-query.dto';

@ApiTags('组件与模板')
@ApiBearerAuth()
@Controller({ path: 'components', version: '1' })
export class ComponentController {
  constructor(private readonly componentService: ComponentService) {}

  @Get()
  @ApiOperation({ summary: '获取组件列表（分页，含平台公共组件）' })
  @RequirePermissions(Permissions.COMPONENT_VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: ComponentQueryDto,
  ): Promise<PageResult<ComponentListItem>> {
    return this.componentService.paginate(user.tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取组件详情（含配置 Schema）' })
  @ApiParam({ name: 'id', description: '组件 ID' })
  @RequirePermissions(Permissions.COMPONENT_VIEW)
  detail(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<ComponentDetail> {
    return this.componentService.detail(user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: '创建组件' })
  @RequirePermissions(Permissions.COMPONENT_MANAGE)
  @ResponseMessage('创建成功')
  @OperationLog({ module: '组件管理', action: '创建组件' })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateComponentDto): Promise<ComponentDetail> {
    return this.componentService.create(user.tenantId, user.userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新组件' })
  @RequirePermissions(Permissions.COMPONENT_MANAGE)
  @ResponseMessage('更新成功')
  @OperationLog({ module: '组件管理', action: '更新组件' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateComponentDto,
  ): Promise<ComponentDetail> {
    return this.componentService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除组件（被场景引用时拒绝）' })
  @RequirePermissions(Permissions.COMPONENT_MANAGE)
  @ResponseMessage('删除成功')
  @OperationLog({ module: '组件管理', action: '删除组件' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<null> {
    await this.componentService.remove(user.tenantId, id);
    return null;
  }
}

@ApiTags('组件与模板')
@ApiBearerAuth()
@Controller({ path: 'templates', version: '1' })
export class TemplateController {
  constructor(private readonly componentService: ComponentService) {}

  @Get()
  @ApiOperation({ summary: '获取模板列表' })
  @RequirePermissions(Permissions.SCENE_VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: PageQueryDto,
  ): Promise<PageResult<TemplateListItem>> {
    return this.componentService.paginateTemplates(user.tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取模板详情' })
  @ApiParam({ name: 'id', description: '模板 ID' })
  @RequirePermissions(Permissions.SCENE_VIEW)
  detail(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<TemplateDetail> {
    return this.componentService.templateDetail(user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: '创建模板（支持从场景另存为）' })
  @RequirePermissions(Permissions.COMPONENT_MANAGE)
  @ResponseMessage('创建成功')
  @OperationLog({ module: '模板管理', action: '创建模板' })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateTemplateDto): Promise<TemplateDetail> {
    return this.componentService.createTemplate(user.tenantId, user.userId, dto);
  }

  @Post(':id/instantiate')
  @HttpCode(200)
  @ApiOperation({ summary: '由模板创建场景' })
  @RequirePermissions(Permissions.SCENE_CREATE)
  @ResponseMessage('创建成功')
  @OperationLog({ module: '模板管理', action: '模板实例化' })
  instantiate(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<TemplateDetail> {
    // 模板实例化复用场景另存逻辑：返回模板详情，由前端配合创建场景
    return this.componentService.templateDetail(user.tenantId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除模板' })
  @RequirePermissions(Permissions.COMPONENT_MANAGE)
  @ResponseMessage('删除成功')
  @OperationLog({ module: '模板管理', action: '删除模板' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<null> {
    await this.componentService.removeTemplate(user.tenantId, id);
    return null;
  }
}
