import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import type {
  ComponentConfigSchema,
  ComponentQuery,
  CreateComponentRequest,
  CreateTemplateRequest,
  TemplateDetail,
} from '@dt/shared-types';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

export class ComponentQueryDto extends PageQueryDto implements ComponentQuery {
  @ApiPropertyOptional({ description: '分类：SCENE_3D / CHART / UI / MEDIA / CUSTOM' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  /** 兼容前端历史字段名 categoryId */
  @ApiPropertyOptional({ description: '分类 ID（等价于 category）' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  categoryId?: string;

  @ApiPropertyOptional({ description: '组件类型' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  componentType?: string;

  @ApiPropertyOptional({ description: '是否仅查公共组件' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isPublic?: boolean;
}

export class CreateComponentDto implements CreateComponentRequest {
  @ApiProperty({ description: '组件名称', example: '风机模型' })
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiProperty({ description: '组件类型', example: 'MODEL_3D' })
  @IsString()
  @Length(1, 50)
  componentType: string;

  @ApiProperty({ description: '分类', example: 'SCENE_3D' })
  @IsString()
  @Length(1, 50)
  category: string;

  @ApiPropertyOptional({ description: '组件描述' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: '关联的模型文件 ID' })
  @IsOptional()
  @IsUUID('4')
  modelFileId?: string;

  @ApiPropertyOptional({ description: '缩略图 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  thumbnailUrl?: string;

  @ApiPropertyOptional({ description: '属性面板 Schema' })
  @IsOptional()
  @IsObject()
  configSchema?: ComponentConfigSchema;

  @ApiPropertyOptional({ description: '自定义组件源码（沙箱执行）' })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  sourceCode?: string;

  @ApiPropertyOptional({ description: '是否公共组件', default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: '组件版本', default: '1.0.0' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;
}

export class UpdateComponentDto implements Partial<CreateComponentRequest> {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  componentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  modelFileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  thumbnailUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  configSchema?: ComponentConfigSchema;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  sourceCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;
}

export class CreateTemplateDto implements CreateTemplateRequest {
  @ApiProperty({ description: '模板名称' })
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiProperty({ description: '模板分类', example: '智慧园区' })
  @IsString()
  @Length(1, 50)
  category: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  coverImage?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: '由已有场景另存为模板' })
  @IsOptional()
  @IsUUID('4')
  fromSceneId?: string;

  @ApiPropertyOptional({ description: '直接提交模板结构数据' })
  @IsOptional()
  @IsObject()
  templateData?: TemplateDetail['templateData'];
}
