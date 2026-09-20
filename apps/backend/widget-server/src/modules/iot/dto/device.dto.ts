import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** 创建设备 */
export class CreateDeviceDto {
  @ApiProperty({ description: '设备编码（租户内唯一）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deviceCode: string;

  @ApiProperty({ description: '设备名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  deviceName: string;

  @ApiProperty({ description: '设备类型' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  deviceType: string;

  @ApiProperty({ description: '接入协议：MQTT/OPC-UA/MODBUS/HTTP' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  protocol: string;

  @ApiProperty({ description: '连接配置' })
  @IsObject()
  connectionConfig: Record<string, unknown>;
}

/** 设备查询 */
export class DeviceQueryDto {
  @ApiPropertyOptional({ description: '设备类型' })
  @IsOptional()
  @IsString()
  deviceType?: string;

  @ApiPropertyOptional({ description: '接入协议' })
  @IsOptional()
  @IsString()
  protocol?: string;

  @ApiPropertyOptional({ description: '在线状态：0 离线 1 在线' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  status?: number;

  @ApiPropertyOptional({ description: '关键字（编码或名称）' })
  @IsOptional()
  @IsString()
  keyword?: string;
}

/** 遥测写入（供网关或模拟数据使用） */
export class PushTelemetryDto {
  @ApiProperty({ description: '设备编码' })
  @IsString()
  @IsNotEmpty()
  deviceCode: string;

  @ApiProperty({ description: '属性编码' })
  @IsString()
  @IsNotEmpty()
  propertyCode: string;

  @ApiProperty({ description: '数值' })
  @Type(() => Number)
  value: number;

  @ApiPropertyOptional({ description: '时间戳（ISO 字符串），缺省为当前时间' })
  @IsOptional()
  @IsString()
  timestamp?: string;
}

/** 遥测查询 */
export class TelemetryQueryDto {
  @ApiPropertyOptional({ description: '属性编码，多个用逗号分隔' })
  @IsOptional()
  @IsString()
  propertyCodes?: string;

  @ApiPropertyOptional({ description: '开始时间（ISO）' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ description: '结束时间（ISO）' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ description: '返回点数上限' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

/** 遥测聚合历史查询（降采样） */
export class TelemetryHistoryQueryDto {
  @ApiPropertyOptional({ description: '属性编码，多个用逗号分隔' })
  @IsOptional()
  @IsString()
  propertyCodes?: string;

  @ApiPropertyOptional({ description: '开始时间（ISO），缺省为 24 小时前' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ description: '结束时间（ISO），缺省为当前时间' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({
    description: '聚合粒度（10s/30s/1m/5m/1h/1d），缺省按时间范围自动推算（约 300 桶）',
  })
  @IsOptional()
  @IsString()
  interval?: string;
}
