import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PermissionEntity,
  RoleEntity,
  RolePermissionEntity,
  TenantEntity,
  UserEntity,
  UserRoleEntity,
} from './entities';
import { UserService } from './user.service';
import { RoleService } from './role.service';
import { AuthzService } from './authz.service';
import { RoleController, UserController } from './user.controller';

/**
 * 用户与权限模块（需求模块六：系统管理与权限控制）。
 * AuthzService 同时被 PermissionGuard 与 AuthModule 使用，故一并导出。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      RoleEntity,
      PermissionEntity,
      UserRoleEntity,
      RolePermissionEntity,
      TenantEntity,
    ]),
  ],
  controllers: [UserController, RoleController],
  providers: [UserService, RoleService, AuthzService],
  exports: [UserService, RoleService, AuthzService],
})
export class UserModule {}
