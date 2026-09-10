import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComponentEntity, TemplateEntity } from './entities';
import { SceneComponentEntity, SceneEntity } from '../scene/entities';
import { FileEntity, ModelAssetEntity } from '../file/entities';
import { ComponentService } from './component.service';
import { ComponentController, TemplateController } from './component.controller';

/**
 * 组件与模板模块（需求模块三：组件库与模板中心）。
 * 组件被场景引用，删除前需校验引用关系，故一并注入场景相关实体。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ComponentEntity,
      TemplateEntity,
      SceneEntity,
      SceneComponentEntity,
      FileEntity,
      ModelAssetEntity,
    ]),
  ],
  controllers: [ComponentController, TemplateController],
  providers: [ComponentService],
  exports: [ComponentService],
})
export class ComponentModule {}
