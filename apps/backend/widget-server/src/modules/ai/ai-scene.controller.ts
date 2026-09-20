import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permissions, type AiSceneTaskItem, type GenerateSceneResult } from '@dt/shared-types';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { AiSceneService } from './ai-scene.service';
import { GenerateSceneDto } from './dto/ai-scene.dto';

@ApiTags('对话式生成')
@ApiBearerAuth()
@Controller({ path: 'ai/scene', version: '1' })
export class AiSceneController {
  constructor(private readonly svc: AiSceneService) {}

  @Post('generate')
  @ApiOperation({ summary: '对话生成 3D 场景（L1 同步：一条 prompt 即返回场景）' })
  @RequirePermissions(Permissions.AI_SCENE_GENERATE)
  @ResponseMessage('生成成功')
  generate(
    @CurrentUser() user: RequestUser,
    @Body() dto: GenerateSceneDto,
  ): Promise<GenerateSceneResult> {
    return this.svc.generate(user, dto);
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: '查询生成任务（L1 同步任务直接返回 DONE）' })
  @ApiParam({ name: 'taskId', description: '任务 ID' })
  @RequirePermissions(Permissions.AI_SCENE_GENERATE)
  task(@Param('taskId') taskId: string): AiSceneTaskItem {
    return this.svc.getTask(taskId);
  }
}
