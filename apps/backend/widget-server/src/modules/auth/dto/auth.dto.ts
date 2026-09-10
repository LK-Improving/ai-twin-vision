import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import type { ChangePasswordRequest, LoginRequest, RefreshRequest } from '@dt/shared-types';

export class LoginDto implements LoginRequest {
  @ApiProperty({ description: '用户名', example: 'admin' })
  @IsString({ message: '用户名必须为字符串' })
  @Length(3, 50, { message: '用户名长度需为 3-50 位' })
  username: string;

  @ApiProperty({ description: '密码', example: 'Admin@123' })
  @IsString({ message: '密码必须为字符串' })
  @Length(6, 64, { message: '密码长度需为 6-64 位' })
  password: string;

  @ApiPropertyOptional({ description: '设备指纹，用于绑定刷新令牌' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

export class RefreshTokenDto implements RefreshRequest {
  @ApiProperty({ description: '刷新令牌' })
  @IsString({ message: 'refreshToken 必须为字符串' })
  @MaxLength(2048)
  refreshToken: string;

  @ApiPropertyOptional({ description: '设备指纹' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

export class ChangePasswordDto implements ChangePasswordRequest {
  @ApiProperty({ description: '原密码' })
  @IsString()
  @Length(6, 64)
  oldPassword: string;

  @ApiProperty({ description: '新密码，至少 8 位且含字母与数字' })
  @IsString()
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,32}$/, {
    message: '新密码至少 8 位，且需同时包含字母与数字',
  })
  newPassword: string;
}
