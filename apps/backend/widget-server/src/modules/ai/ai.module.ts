import { Module } from '@nestjs/common';
import { SceneModule } from '../scene/scene.module';
import { FileModule } from '../file/file.module';
import { AiSceneController } from './ai-scene.controller';
import { AiSceneService } from './ai-scene.service';

/**
 * 对话式生成模块（详细设计 §13）。
 * 编排：RulePlanner（prompt→DSL）→ 校验 → ProceduralGenerator（GLB）→
 *         FileService（上传）→ DSL→组件/面板 → SceneService（落库）。
 * SceneService / FileService 已在各自模块 exports，可直接注入本模块服务。
 */
@Module({
  imports: [SceneModule, FileModule],
  controllers: [AiSceneController],
  providers: [AiSceneService],
})
export class AiModule {}
