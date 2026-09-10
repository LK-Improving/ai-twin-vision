import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SceneComponentEntity, SceneEntity, SceneVersionEntity } from './entities';
import { ComponentEntity, TemplateEntity } from '../component/entities';
import { SceneService } from './scene.service';
import { SceneController } from './scene.controller';

/**
 * 场景模块（需求模块一 + 模块二的持久化支撑）：
 * 场景 CRUD、发布与版本快照、克隆、回滚。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SceneEntity,
      SceneComponentEntity,
      SceneVersionEntity,
      ComponentEntity,
      TemplateEntity,
    ]),
  ],
  controllers: [SceneController],
  providers: [SceneService],
  exports: [SceneService],
})
export class SceneModule {}
