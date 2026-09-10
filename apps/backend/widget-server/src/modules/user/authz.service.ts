import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { PermissionNode } from '@dt/shared-types';
import { PermissionEntity, RolePermissionEntity, RoleEntity, UserRoleEntity } from './entities';
import { RedisService } from '../../redis/redis.service';

/** 权限缓存 TTL：10 分钟 */
const PERMISSION_CACHE_TTL = 600;

/**
 * 鉴权数据服务：负责角色、权限的查询与缓存。
 * 被 PermissionGuard 与 AuthService 共同依赖，独立成类避免循环引用。
 */
@Injectable()
export class AuthzService {
  constructor(
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissionRepo: Repository<PermissionEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepo: Repository<RolePermissionEntity>,
    private readonly redis: RedisService,
  ) {}

  /** 查询用户的角色实体列表 */
  async getRoles(userId: string): Promise<RoleEntity[]> {
    return this.roleRepo
      .createQueryBuilder('role')
      .innerJoin(UserRoleEntity, 'ur', 'ur.role_id = role.id')
      .where('ur.user_id = :userId', { userId })
      .andWhere('role.deleted_at IS NULL')
      .getMany();
  }

  /** 查询用户的角色编码列表 */
  async getRoleCodes(userId: string): Promise<string[]> {
    const cacheKey = `authz:roles:${userId}`;
    return this.redis.remember(cacheKey, PERMISSION_CACHE_TTL, async () => {
      const roles = await this.getRoles(userId);
      return roles.map((role) => role.roleCode);
    });
  }

  /**
   * 查询用户拥有的权限编码集合（含缓存）。
   * 供 PermissionGuard 做按钮级/接口级鉴权。
   */
  async getPermissionCodes(userId: string): Promise<string[]> {
    const cacheKey = `authz:perms:${userId}`;
    return this.redis.remember(cacheKey, PERMISSION_CACHE_TTL, async () => {
      const rows = await this.permissionRepo
        .createQueryBuilder('p')
        .select('p.permission_code', 'code')
        .innerJoin(RolePermissionEntity, 'rp', 'rp.permission_id = p.id')
        .innerJoin(UserRoleEntity, 'ur', 'ur.role_id = rp.role_id')
        .where('ur.user_id = :userId', { userId })
        .andWhere('p.deleted_at IS NULL')
        .groupBy('p.permission_code')
        .getRawMany<{ code: string }>();
      return rows.map((row) => row.code);
    });
  }

  /** 清除某用户的鉴权缓存（角色或权限变更时调用） */
  async clearUserCache(userId: string): Promise<void> {
    await this.redis.del(`authz:perms:${userId}`, `authz:roles:${userId}`);
  }

  /** 清除某角色下所有用户的鉴权缓存 */
  async clearRoleCache(roleId: string): Promise<void> {
    const relations = await this.userRoleRepo.find({ where: { roleId } });
    await Promise.all(relations.map((item) => this.clearUserCache(item.userId)));
  }

  /** 查询全部权限并组装成树（供前端菜单与角色配置使用） */
  async getPermissionTree(): Promise<PermissionNode[]> {
    const list = await this.permissionRepo.find({
      where: { deletedAt: undefined },
      order: { sortOrder: 'ASC' },
    });

    const nodes: PermissionNode[] = list
      .filter((item) => !item.deletedAt)
      .map((item) => ({
        id: item.id,
        permissionCode: item.permissionCode,
        permissionName: item.permissionName,
        resourceType: item.resourceType,
        parentId: item.parentId,
        path: item.path,
        sortOrder: item.sortOrder,
        children: [],
      }));

    const map = new Map(nodes.map((node) => [node.id, node]));
    const roots: PermissionNode[] = [];
    for (const node of nodes) {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  /** 查询角色的权限 ID 列表 */
  async getRolePermissionIds(roleId: string): Promise<string[]> {
    const rows = await this.rolePermissionRepo.find({ where: { roleId } });
    return rows.map((row) => row.permissionId);
  }

  /** 覆盖式设置角色权限 */
  async setRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    await this.rolePermissionRepo.delete({ roleId });
    if (permissionIds.length > 0) {
      await this.rolePermissionRepo.insert(
        permissionIds.map((permissionId) => ({ roleId, permissionId })),
      );
    }
    await this.clearRoleCache(roleId);
  }
}
