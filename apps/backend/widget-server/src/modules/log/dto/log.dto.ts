import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** 操作日志查询 */
export class OperationLogQueryDto {
  @ApiPropertyOptional({ description: '用户 ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: '模块名' })
  @IsOptional()
  @IsString()
  module?: string;

  @ApiPropertyOptional({ description: '开始时间（ISO）' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ description: '结束时间（ISO）' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ description: '关键字（用户名/操作/请求地址）' })
  @IsOptional()
  @IsString()
  keyword?: string;
}
