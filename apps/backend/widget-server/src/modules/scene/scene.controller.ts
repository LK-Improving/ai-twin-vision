import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@dt/shared-types';
import type {
  PageResult,
  PublishSceneResult,
  SceneDetail,
  SceneListItem,
  SceneVersionItem,
} from '@dt/shared-types';
import { SceneService } from './scene.service';
import {
  CloneSceneDto,
  CreateSceneDto,
  PatchSceneDto,
  PublishSceneDto,
  SceneQueryDto,
  UpdateSceneDto,
} from './dto/scene.dto';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';

@ApiTags('场景管理')
@ApiBearerAuth()
@Controller({ path: 'scenes', version: '1' })
export class SceneController {
  constructor(private readonly sceneService: SceneService) {}

  @Get()
  @ApiOperation({ summary: '获取场景列表（分页）' })
  @RequirePermissions(Permissions.SCENE_VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: SceneQueryDto,
  ): Promise<PageResult<SceneListItem>> {
    return this.sceneService.paginate(user.tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取场景详情（含引擎配置、组件与画布）' })
  @ApiParam({ name: 'id', description: '场景 ID' })
  @RequirePermissions(Permissions.SCENE_VIEW)
  detail(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<SceneDetail> {
    return this.sceneService.detail(user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: '创建新场景' })
  @RequirePermissions(Permissions.SCENE_CREATE)
  @ResponseMessage('创建成功')
  @OperationLog({ module: '场景管理', action: '创建场景' })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateSceneDto): Promise<SceneDetail> {
    return this.sceneService.create(user.tenantId, user.userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '全量更新场景（编辑器保存）' })
  @RequirePermissions(Permissions.SCENE_EDIT)
  @ResponseMessage('保存成功')
  @OperationLog({ module: '场景管理', action: '保存场景', recordParams: false })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateSceneDto,
  ): Promise<SceneDetail> {
    return this.sceneService.update(user.tenantId, user.userId, id, dto, false);
  }

  @Patch(':id')
  @ApiOperation({ summary: '部分更新场景（重命名、换封面等）' })
  @RequirePermissions(Permissions.SCENE_EDIT)
  @ResponseMessage('更新成功')
  @OperationLog({ module: '场景管理', action: '更新场景' })
  patch(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: PatchSceneDto,
  ): Promise<SceneDetail> {
    return this.sceneService.update(user.tenantId, user.userId, id, dto, true);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除场景（软删除）' })
  @RequirePermissions(Permissions.SCENE_DELETE)
  @ResponseMessage('删除成功')
  @OperationLog({ module: '场景管理', action: '删除场景' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<null> {
    await this.sceneService.remove(user.tenantId, id);
    return null;
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ApiOperation({ summary: '发布场景（生成版本快照）' })
  @RequirePermissions(Permissions.SCENE_PUBLISH)
  @ResponseMessage('发布成功')
  @OperationLog({ module: '场景管理', action: '发布场景' })
  publish(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: PublishSceneDto,
  ): Promise<PublishSceneResult> {
    return this.sceneService.publish(user.tenantId, user.userId, id, dto.changeLog);
  }

  @Post(':id/clone')
  @HttpCode(200)
  @ApiOperation({ summary: '克隆场景' })
  @RequirePermissions(Permissions.SCENE_CREATE)
  @ResponseMessage('克隆成功')
  @OperationLog({ module: '场景管理', action: '克隆场景' })
  clone(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CloneSceneDto,
  ): Promise<SceneListItem> {
    return this.sceneService.clone(user.tenantId, user.userId, id, dto);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: '获取场景版本列表' })
  @RequirePermissions(Permissions.SCENE_VIEW)
  versions(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<SceneVersionItem[]> {
    return this.sceneService.versions(user.tenantId, id);
  }

  @Post(':id/versions/:versionNo/rollback')
  @HttpCode(200)
  @ApiOperation({ summary: '回滚到指定版本' })
  @RequirePermissions(Permissions.SCENE_EDIT)
  @ResponseMessage('回滚成功')
  @OperationLog({ module: '场景管理', action: '版本回滚' })
  rollback(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('versionNo', ParseIntPipe) versionNo: number,
  ): Promise<SceneDetail> {
    return this.sceneService.rollback(user.tenantId, user.userId, id, versionNo);
  }
}
