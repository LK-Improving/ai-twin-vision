import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SceneType } from '@dt/shared-types';
import type {
  CloneSceneRequest,
  CreateSceneRequest,
  EngineConfig,
  PageSchema,
  PublishSceneRequest,
  SceneQuery,
  Transform,
  UpdateSceneRequest,
} from '@dt/shared-types';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

export class SceneQueryDto extends PageQueryDto implements SceneQuery {
  @ApiPropertyOptional({ description: '状态：DRAFT / PUBLISHED / ARCHIVED' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @ApiPropertyOptional({ description: '场景类型', enum: SceneType })
  @IsOptional()
  @IsEnum(SceneType, { message: 'sceneType 仅支持 MACRO / MICRO / HYBRID' })
  sceneType?: SceneType;

  @ApiPropertyOptional({ description: '创建人 ID' })
  @IsOptional()
  @IsUUID('4')
  creatorId?: string;
}

/** 场景组件实例（保存场景时提交） */
export class SceneComponentDto {
  @ApiPropertyOptional({ description: '实例 ID，新增时不传' })
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiProperty({ description: '引用的组件定义 ID' })
  @IsUUID('4', { message: 'componentId 必须为合法 UUID' })
  componentId: string;

  @ApiPropertyOptional({ description: '实例名称' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: '组件实例化配置' })
  @IsOptional()
  @IsObject()
  componentConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '空间变换：经纬高 / 局部坐标 / 旋转 / 缩放' })
  @IsOptional()
  @IsObject()
  position?: Transform;

  @ApiPropertyOptional({ description: '所属图层 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  layerId?: string | null;

  @ApiPropertyOptional({ description: '渲染排序' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: '是否可见' })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @ApiPropertyOptional({ description: '是否锁定' })
  @IsOptional()
  @IsBoolean()
  locked?: boolean;
}

export class CreateSceneDto implements CreateSceneRequest {
  @ApiProperty({ description: '场景名称', example: '智慧园区数字孪生' })
  @IsString({ message: '场景名称不能为空' })
  @Length(1, 200, { message: '场景名称长度需为 1-200 位' })
  name: string;

  @ApiPropertyOptional({ description: '场景描述' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: '场景类型', enum: SceneType, default: SceneType.HYBRID })
  @IsOptional()
  @IsEnum(SceneType)
  sceneType?: SceneType;

  @ApiPropertyOptional({ description: '封面图 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  coverImage?: string;

  @ApiPropertyOptional({ description: '引擎初始配置，缺省使用平台默认配置' })
  @IsOptional()
  @IsObject()
  config?: Partial<EngineConfig>;

  @ApiPropertyOptional({ description: '基于模板创建' })
  @IsOptional()
  @IsUUID('4')
  templateId?: string;
}

export class UpdateSceneDto implements UpdateSceneRequest {
  @ApiProperty({ description: '场景名称' })
  @IsString({ message: '场景名称不能为空' })
  @Length(1, 200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: SceneType })
  @IsOptional()
  @IsEnum(SceneType)
  sceneType?: SceneType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  coverImage?: string;

  @ApiPropertyOptional({ description: '引擎配置（Cesium / Three.js）' })
  @IsOptional()
  @IsObject()
  config?: Partial<EngineConfig>;

  @ApiPropertyOptional({ description: '场景组件实例列表（全量覆盖）', type: [SceneComponentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneComponentDto)
  components?: SceneComponentDto[];

  @ApiPropertyOptional({ description: '低代码 2D 画布 Schema' })
  @IsOptional()
  @IsObject()
  layout?: PageSchema;
}

/** 部分更新：所有字段可选 */
export class PatchSceneDto implements Partial<UpdateSceneRequest> {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: SceneType })
  @IsOptional()
  @IsEnum(SceneType)
  sceneType?: SceneType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  coverImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Partial<EngineConfig>;

  @ApiPropertyOptional({ type: [SceneComponentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneComponentDto)
  components?: SceneComponentDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  layout?: PageSchema;
}

export class CloneSceneDto implements CloneSceneRequest {
  @ApiProperty({ description: '新场景名称', example: '智慧园区数字孪生-副本' })
  @IsString({ message: '新场景名称不能为空' })
  @Length(1, 200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class PublishSceneDto implements PublishSceneRequest {
  @ApiPropertyOptional({ description: '变更日志' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changeLog?: string;
}
