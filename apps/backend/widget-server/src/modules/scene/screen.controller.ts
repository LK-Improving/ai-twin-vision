import { Controller, Get, Logger, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { ScreenSnapshot, ScreenTicket } from '@dt/shared-types';
import { Public } from '../../common/decorators/public.decorator';
import { SceneService } from './scene.service';
import { RealtimeGateway } from '../gateway/realtime.gateway';

/**
 * 大屏公开访问接口（Sprint B）。
 *
 * 全部标记 @Public()：/screen/:token 面向无登录态的观众，
 * 凭证就是发布令牌本身，因此这里只做两件事——
 * 1. 令牌必须对应一个「已发布」场景（草稿不会外泄）；
 * 2. 用令牌换取短时效 WS 票据，票据在网关侧被限定为只读且只能订阅该场景。
 */
@ApiTags('大屏公开访问')
@Public()
@Controller({ path: 'public/screens', version: '1' })
export class ScreenController {
  private readonly logger = new Logger(ScreenController.name);

  constructor(
    private readonly sceneService: SceneService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Get(':token')
  @ApiOperation({ summary: '按发布令牌读取大屏快照（无需登录）' })
  @ApiParam({ name: 'token', description: '发布访问令牌' })
  snapshot(@Param('token') token: string): Promise<ScreenSnapshot> {
    return this.sceneService.screenSnapshot(token);
  }

  @Post(':token/ws-ticket')
  @ApiOperation({ summary: '用发布令牌换取实时通道票据（短时效、只读、限场景）' })
  @ApiParam({ name: 'token', description: '发布访问令牌' })
  async wsTicket(@Param('token') token: string): Promise<ScreenTicket> {
    const { sceneId, tenantId } = await this.sceneService.resolveScreenTarget(token);
    const { token: ticket, expiresIn } = this.realtime.issueScreenTicket(sceneId, tenantId);
    this.logger.debug(`签发大屏票据 scene=${sceneId}`);
    return { token: ticket, expiresIn, sceneId };
  }
}
