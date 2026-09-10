import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import type {
  CreateUserRequest,
  UpdateUserRequest,
  UserQuery,
  CreateRoleRequest,
} from '@dt/shared-types';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

/** 密码复杂度：至少 8 位，含字母与数字 */
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,32}$/;

export class UserQueryDto extends PageQueryDto implements UserQuery {
  @ApiPropertyOptional({ description: '状态：1-启用 0-禁用' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status?: number;

  @ApiPropertyOptional({ description: '按角色筛选' })
  @IsOptional()
  @IsUUID('4')
  roleId?: string;
}

export class CreateUserDto implements CreateUserRequest {
  @ApiProperty({ description: '登录用户名', example: 'zhangsan' })
  @IsString()
  @Length(3, 50, { message: '用户名长度需为 3-50 位' })
  @Matches(/^[A-Za-z0-9_.-]+$/, { message: '用户名仅允许字母、数字、下划线、点与短横线' })
  username: string;

  @ApiProperty({ description: '密码，至少 8 位且含字母与数字', example: 'Passw0rd' })
  @IsString()
  @Matches(PASSWORD_RULE, { message: '密码至少 8 位，且需同时包含字母与数字' })
  password: string;

  @ApiPropertyOptional({ description: '真实姓名' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  realName?: string;

  @ApiPropertyOptional({ description: '邮箱' })
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(100)
  email?: string;

  @ApiPropertyOptional({ description: '手机号' })
  @IsOptional()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone?: string;

  @ApiPropertyOptional({ description: '头像 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatar?: string;

  @ApiPropertyOptional({ description: '状态：1-启用 0-禁用', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status?: number;

  @ApiPropertyOptional({ description: '角色 ID 列表', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds?: string[];
}

export class UpdateUserDto implements UpdateUserRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  realName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatar?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  status?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds?: string[];
}

export class ResetPasswordDto {
  @ApiProperty({ description: '新密码' })
  @IsString()
  @Matches(PASSWORD_RULE, { message: '密码至少 8 位，且需同时包含字母与数字' })
  newPassword: string;
}

export class AssignRolesDto {
  @ApiProperty({ description: '角色 ID 列表', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds: string[];
}

export class CreateRoleDto implements CreateRoleRequest {
  @ApiProperty({ description: '角色编码', example: 'OPERATOR' })
  @IsString()
  @Length(2, 50)
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: '角色编码需为大写字母、数字与下划线' })
  roleCode: string;

  @ApiProperty({ description: '角色名称', example: '运维人员' })
  @IsString()
  @Length(2, 100)
  roleName: string;

  @ApiPropertyOptional({ description: '角色描述' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: '权限 ID 列表', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 100)
  roleName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}
