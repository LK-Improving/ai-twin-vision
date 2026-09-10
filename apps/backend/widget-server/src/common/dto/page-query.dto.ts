import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PAGE_DEFAULTS, type PageQuery } from '@dt/shared-types';

/**
 * 通用分页查询 DTO（详细设计 4.1.3）。
 * 各模块查询 DTO 继承此类，避免重复定义。
 */
export class PageQueryDto implements PageQuery {
  @ApiPropertyOptional({ description: '页码，从 1 开始', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须为整数' })
  @Min(1, { message: 'page 最小为 1' })
  page?: number = PAGE_DEFAULTS.page;

  @ApiPropertyOptional({ description: '每页条数', default: 20, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit 必须为整数' })
  @Min(1, { message: 'limit 最小为 1' })
  @Max(PAGE_DEFAULTS.maxLimit, { message: `limit 最大为 ${PAGE_DEFAULTS.maxLimit}` })
  limit?: number = PAGE_DEFAULTS.limit;

  @ApiPropertyOptional({ description: '排序字段，前缀 - 表示降序，如 -createdAt' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sort?: string;

  @ApiPropertyOptional({ description: '搜索关键词' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;
}
