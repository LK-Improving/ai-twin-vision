import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsJSON,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 分片上传初始化请求 */
export class InitMultipartDto {
  @ApiProperty({ description: '文件名' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  fileName: string;

  @ApiProperty({ description: '文件总大小（字节）' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  fileSize: number;

  @ApiProperty({ description: '文件 md5，用于秒传与完整性校验' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  md5: string;

  @ApiPropertyOptional({ description: '文件 MIME/扩展名' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fileType?: string;

  @ApiPropertyOptional({ description: '分片大小（字节），默认 5MB' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1024 * 1024)
  @Max(50 * 1024 * 1024)
  chunkSize?: number;
}

/** 分片合并请求 */
export class CompleteMultipartDto {
  @ApiProperty({ description: '上传任务 ID' })
  @IsString()
  @IsNotEmpty()
  uploadId: string;

  @ApiProperty({ description: '文件名' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ description: '文件 md5' })
  @IsString()
  @IsNotEmpty()
  md5: string;

  @ApiProperty({ description: '分片总数' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalChunks: number;
}

/** 模型资产查询 */
export class ModelAssetQueryDto {
  @ApiPropertyOptional({ description: '资产类型：GLTF/GLB/FBX/OBJ/TILES_3D' })
  @IsOptional()
  @IsString()
  assetType?: string;

  @ApiPropertyOptional({ description: '关键字' })
  @IsOptional()
  @IsString()
  keyword?: string;
}

/** 登记模型资产 */
export class CreateModelAssetDto {
  @ApiProperty({ description: '资产名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  assetName: string;

  @ApiProperty({ description: '资产类型（对应 DB 列宽 10，如 GLTF/GLB/FBX/OBJ/TILES_3D）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10, { message: '资产类型过长（≤10 字符，如 GLB/GLTF/FBX/OBJ/TILES_3D）' })
  assetType: string;

  @ApiProperty({ description: '关联文件 ID' })
  @IsUUID('4')
  fileId: string;

  @ApiProperty({ description: '访问地址' })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiPropertyOptional({ description: '缩略图地址' })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional({ description: 'LOD 层级配置' })
  @IsOptional()
  @IsObject()
  lodLevels?: Record<string, string>;

  @ApiPropertyOptional({ description: '包围盒' })
  @IsOptional()
  @IsObject()
  boundingBox?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '面数' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  polygonCount?: number;

  @ApiPropertyOptional({ description: '贴图数' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  textureCount?: number;

  @ApiPropertyOptional({ description: '是否公开' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  /** 兼容前端直接传 JSON 字符串的场景 */
  @ApiPropertyOptional({ description: '转换脚本（可选）' })
  @IsOptional()
  @IsJSON()
  rawMeta?: string;
}
