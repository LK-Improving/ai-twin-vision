import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BizCode, type RoleItem } from '@dt/shared-types';
import { RoleEntity, UserRoleEntity } from './entities';
import { AuthzService } from './authz.service';
import { BizException } from '../../common/exceptions/biz.exception';
import type { CreateRoleDto, UpdateRoleDto } from './dto/user.dto';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
    private readonly authz: AuthzService,
  ) {}

  /** 查询租户下全部角色（含权限 ID，便于前端回显权限树） */
  async list(tenantId: string, withPermissions = true): Promise<RoleItem[]> {
    const roles = await this.roleRepo.find({
      where: { tenantId },
      order: { createdAt: 'ASC' },
    });

    return Promise.all(
      roles.map(async (role) => ({
        id: role.id,
        tenantId: role.tenantId,
        roleCode: role.roleCode,
        roleName: role.roleName,
        description: role.description,
        isSystem: role.isSystem,
        permissionIds: withPermissions ? await this.authz.getRolePermissionIds(role.id) : undefined,
        createdAt: role.createdAt.toISOString(),
        updatedAt: role.updatedAt.toISOString(),
      })),
    );
  }

  async create(tenantId: string, dto: CreateRoleDto): Promise<RoleItem> {
    const exists = await this.roleRepo
      .createQueryBuilder('role')
      .where('role.tenant_id = :tenantId', { tenantId })
      .andWhere('role.role_code = :roleCode', { roleCode: dto.roleCode })
      .andWhere('role.deleted_at IS NULL')
      .getExists();
    if (exists) throw new BizException(BizCode.COMMON_DUPLICATE_NAME, '角色编码已存在');

    const saved = await this.roleRepo.save(
      this.roleRepo.create({
        tenantId,
        roleCode: dto.roleCode,
        roleName: dto.roleName,
        description: dto.description ?? null,
        isSystem: false,
      }),
    );

    if (dto.permissionIds?.length) {
      await this.authz.setRolePermissions(saved.id, dto.permissionIds);
    }

    return {
      id: saved.id,
      tenantId: saved.tenantId,
      roleCode: saved.roleCode,
      roleName: saved.roleName,
      description: saved.description,
      isSystem: saved.isSystem,
      permissionIds: dto.permissionIds ?? [],
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async update(tenantId: string, id: string, dto: UpdateRoleDto): Promise<RoleItem> {
    const role = await this.roleRepo.findOne({ where: { id, tenantId } });
    if (!role) throw new BizException(BizCode.ROLE_NOT_FOUND);
    // 系统内置角色允许调整名称与描述，但不允许改动权限，避免破坏平台基线权限
    if (role.isSystem && dto.permissionIds) {
      throw new BizException(BizCode.SYSTEM_ROLE_READONLY, '系统内置角色的权限不可修改');
    }

    role.roleName = dto.roleName ?? role.roleName;
    role.description = dto.description ?? role.description;
    const saved = await this.roleRepo.save(role);

    if (dto.permissionIds) {
      await this.authz.setRolePermissions(id, dto.permissionIds);
    }

    return {
      id: saved.id,
      tenantId: saved.tenantId,
      roleCode: saved.roleCode,
      roleName: saved.roleName,
      description: saved.description,
      isSystem: saved.isSystem,
      permissionIds: await this.authz.getRolePermissionIds(id),
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const role = await this.roleRepo.findOne({ where: { id, tenantId } });
    if (!role) throw new BizException(BizCode.ROLE_NOT_FOUND);
    if (role.isSystem) throw new BizException(BizCode.SYSTEM_ROLE_READONLY);

    const inUse = await this.userRoleRepo.findOne({ where: { roleId: id } });
    if (inUse) throw new BizException(BizCode.ROLE_IN_USE);

    await this.roleRepo.softDelete({ id });
    await this.authz.setRolePermissions(id, []);
  }
}
