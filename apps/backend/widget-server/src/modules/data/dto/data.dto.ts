import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** 创建数据源 */
export class CreateDataSourceDto {
  @ApiProperty({ description: '数据源名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: '类型：PG/MYSQL/HTTP/WEBSOCKET/MQTT/OPC-UA/MODBUS/STATIC' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  type: string;

  @ApiProperty({ description: '连接配置（密码等敏感字段返回时脱敏）' })
  @IsObject()
  config: Record<string, unknown>;
}

/** 更新数据源 */
export class UpdateDataSourceDto {
  @ApiPropertyOptional({ description: '数据源名称' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: '类型' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  type?: string;

  @ApiPropertyOptional({ description: '连接配置' })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

/** 数据源查询 */
export class DataSourceQueryDto {
  @ApiPropertyOptional({ description: '类型过滤' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: '状态过滤：0 离线 1 在线' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  status?: number;

  @ApiPropertyOptional({ description: '关键字' })
  @IsOptional()
  @IsString()
  keyword?: string;
}

/** 运行时按数据源拉取数据（供大屏节点绑定使用） */
export class DataSourceQueryBodyDto {
  @ApiPropertyOptional({ description: '字段映射：目标字段 → 数据字段路径' })
  @IsOptional()
  @IsObject()
  fieldMap?: Record<string, string>;

  @ApiPropertyOptional({ description: '查询参数（SQL 语句 / HTTP 参数，按类型解释）' })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}

/** 数据映射创建 */
export class CreateDataMappingDto {
  @ApiProperty({ description: '场景 ID' })
  @IsString()
  @IsNotEmpty()
  sceneId: string;

  @ApiProperty({ description: '数据源 ID' })
  @IsString()
  @IsNotEmpty()
  dataSourceId: string;

  @ApiProperty({ description: '目标组件实例 ID' })
  @IsString()
  @IsNotEmpty()
  targetComponentId: string;

  @ApiProperty({ description: '映射配置' })
  @IsObject()
  mappingConfig: Record<string, unknown>;

  @ApiPropertyOptional({ description: '刷新间隔（ms）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  refreshInterval?: number;
}
