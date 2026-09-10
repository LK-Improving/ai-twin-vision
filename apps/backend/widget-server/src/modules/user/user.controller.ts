import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@dt/shared-types';
import type { PageResult, PermissionNode, RoleItem, UserItem } from '@dt/shared-types';
import { UserService } from './user.service';
import { RoleService } from './role.service';
import { AuthzService } from './authz.service';
import {
  AssignRolesDto,
  CreateRoleDto,
  CreateUserDto,
  ResetPasswordDto,
  UpdateRoleDto,
  UpdateUserDto,
  UserQueryDto,
} from './dto/user.dto';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';

@ApiTags('系统管理 - 用户')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly authzService: AuthzService,
  ) {}

  @Get()
  @ApiOperation({ summary: '分页查询用户列表' })
  @RequirePermissions(Permissions.SYSTEM_USER_MANAGE)
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: UserQueryDto,
  ): Promise<PageResult<UserItem>> {
    return this.userService.paginate(user.tenantId, query);
  }

  @Post()
  @ApiOperation({ summary: '创建用户' })
  @RequirePermissions(Permissions.SYSTEM_USER_MANAGE)
  @ResponseMessage('创建成功')
  @OperationLog({ module: '用户管理', action: '创建用户', recordParams: false })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateUserDto): Promise<UserItem> {
    return this.userService.create(user.tenantId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新用户' })
  @RequirePermissions(Permissions.SYSTEM_USER_MANAGE)
  @ResponseMessage('更新成功')
  @OperationLog({ module: '用户管理', action: '更新用户' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserItem> {
    return this.userService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除用户（软删除）' })
  @RequirePermissions(Permissions.SYSTEM_USER_MANAGE)
  @ResponseMessage('删除成功')
  @OperationLog({ module: '用户管理', action: '删除用户' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<null> {
    await this.userService.remove(user.tenantId, id, user.userId);
    return null;
  }

  @Put(':id/roles')
  @ApiOperation({ summary: '为用户分配角色' })
  @RequirePermissions(Permissions.SYSTEM_USER_MANAGE)
  @ResponseMessage('角色分配成功')
  @OperationLog({ module: '用户管理', action: '分配角色' })
  async assignRoles(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AssignRolesDto,
  ): Promise<null> {
    await this.userService.assignRoles(id, dto.roleIds);
    return null;
  }

  @Put(':id/password/reset')
  @ApiOperation({ summary: '重置用户密码（管理员）' })
  @RequirePermissions(Permissions.SYSTEM_USER_MANAGE)
  @ResponseMessage('密码重置成功')
  @OperationLog({ module: '用户管理', action: '重置密码', recordParams: false })
  async resetPassword(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<null> {
    await this.userService.resetPassword(user.tenantId, id, dto.newPassword);
    return null;
  }
}

@ApiTags('系统管理 - 角色与权限')
@ApiBearerAuth()
@Controller({ version: '1' })
export class RoleController {
  constructor(
    private readonly roleService: RoleService,
    private readonly authzService: AuthzService,
  ) {}

  @Get('roles')
  @ApiOperation({ summary: '查询角色列表' })
  list(@CurrentUser() user: RequestUser): Promise<RoleItem[]> {
    return this.roleService.list(user.tenantId);
  }

  @Post('roles')
  @ApiOperation({ summary: '创建角色' })
  @RequirePermissions(Permissions.SYSTEM_ROLE_MANAGE)
  @ResponseMessage('创建成功')
  @OperationLog({ module: '角色管理', action: '创建角色' })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateRoleDto): Promise<RoleItem> {
    return this.roleService.create(user.tenantId, dto);
  }

  @Put('roles/:id')
  @ApiOperation({ summary: '更新角色及其权限' })
  @RequirePermissions(Permissions.SYSTEM_ROLE_MANAGE)
  @ResponseMessage('更新成功')
  @OperationLog({ module: '角色管理', action: '更新角色' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleItem> {
    return this.roleService.update(user.tenantId, id, dto);
  }

  @Delete('roles/:id')
  @ApiOperation({ summary: '删除角色' })
  @RequirePermissions(Permissions.SYSTEM_ROLE_MANAGE)
  @ResponseMessage('删除成功')
  @OperationLog({ module: '角色管理', action: '删除角色' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<null> {
    await this.roleService.remove(user.tenantId, id);
    return null;
  }

  @Get('permissions/tree')
  @ApiOperation({ summary: '查询权限树（菜单 + 按钮）' })
  tree(): Promise<PermissionNode[]> {
    return this.authzService.getPermissionTree();
  }
}
