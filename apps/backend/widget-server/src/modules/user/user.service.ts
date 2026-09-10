import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  BizCode,
  CommonStatus,
  type PageResult,
  type UserItem,
  type UserProfile,
} from '@dt/shared-types';
import { RoleEntity, TenantEntity, UserEntity, UserRoleEntity } from './entities';
import { AuthzService } from './authz.service';
import { BizException } from '../../common/exceptions/biz.exception';
import { hashPassword, verifyPassword } from '../../common/utils/crypto.util';
import { normalizePage, resolveOrderBy } from '../../common/utils/page.util';
import type { CreateUserDto, UpdateUserDto, UserQueryDto } from './dto/user.dto';

/** 列表排序白名单，防止 SQL 注入 */
const USER_SORT_FIELDS: Record<string, string> = {
  createdAt: 'user.created_at',
  updatedAt: 'user.updated_at',
  username: 'user.username',
  lastLoginAt: 'user.last_login_at',
};

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
    private readonly authz: AuthzService,
  ) {}

  /** 按用户名查询（含密码字段，仅供登录校验使用） */
  async findByUsernameWithPassword(username: string): Promise<UserEntity | null> {
    return this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.username = :username', { username })
      .andWhere('user.deleted_at IS NULL')
      .getOne();
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  /** 获取用户完整档案（角色 + 权限），供 /auth/profile 使用 */
  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.findById(userId);
    if (!user) throw new BizException(BizCode.USER_NOT_FOUND);

    const [roles, permissions, tenant] = await Promise.all([
      this.authz.getRoles(userId),
      this.authz.getPermissionCodes(userId),
      this.tenantRepo.findOne({ where: { id: user.tenantId } }),
    ]);

    return {
      id: user.id,
      username: user.username,
      realName: user.realName,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      tenantId: user.tenantId,
      tenantName: tenant?.tenantName,
      roles: roles.map((role) => role.roleCode),
      permissions,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    };
  }

  /** 记录登录时间 */
  async touchLoginTime(userId: string): Promise<void> {
    await this.userRepo.update({ id: userId }, { lastLoginAt: new Date() });
  }

  /** 分页查询用户列表 */
  async paginate(tenantId: string, query: UserQueryDto): Promise<PageResult<UserItem>> {
    const { page, limit, skip } = normalizePage(query);
    const order = resolveOrderBy(query.sort, USER_SORT_FIELDS, {
      column: 'user.created_at',
      order: 'DESC',
    });

    const qb = this.userRepo
      .createQueryBuilder('user')
      .where('user.tenant_id = :tenantId', { tenantId })
      .andWhere('user.deleted_at IS NULL')
      // 排除系统内置账号
      .andWhere('user.username <> :systemAccount', { systemAccount: '__system__' });

    if (query.keyword) {
      qb.andWhere(
        '(user.username ILIKE :kw OR user.real_name ILIKE :kw OR user.email ILIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }
    if (query.status !== undefined) {
      qb.andWhere('user.status = :status', { status: query.status });
    }
    if (query.roleId) {
      qb.innerJoin(UserRoleEntity, 'ur', 'ur.user_id = user.id AND ur.role_id = :roleId', {
        roleId: query.roleId,
      });
    }

    const [rows, total] = await qb
      .orderBy(order.column, order.order)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const dataList = await this.attachRoles(rows);
    return { total, page, limit, dataList };
  }

  /** 批量补齐用户的角色信息，避免 N+1 查询 */
  private async attachRoles(users: UserEntity[]): Promise<UserItem[]> {
    if (users.length === 0) return [];
    const userIds = users.map((user) => user.id);
    const relations = await this.userRoleRepo.find({ where: { userId: In(userIds) } });
    const roleIds = [...new Set(relations.map((item) => item.roleId))];
    const roles = roleIds.length ? await this.roleRepo.find({ where: { id: In(roleIds) } }) : [];
    const roleMap = new Map(roles.map((role) => [role.id, role]));

    return users.map((user) => ({
      id: user.id,
      tenantId: user.tenantId,
      username: user.username,
      realName: user.realName,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      status: user.status,
      roles: relations
        .filter((item) => item.userId === user.id)
        .map((item) => roleMap.get(item.roleId))
        .filter((role): role is RoleEntity => Boolean(role))
        .map((role) => ({ id: role.id, roleCode: role.roleCode, roleName: role.roleName })),
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    }));
  }

  async create(tenantId: string, dto: CreateUserDto): Promise<UserItem> {
    const exists = await this.userRepo
      .createQueryBuilder('user')
      .where('user.username = :username', { username: dto.username })
      .andWhere('user.deleted_at IS NULL')
      .getExists();
    if (exists) throw new BizException(BizCode.USERNAME_DUPLICATE);

    const entity = this.userRepo.create({
      tenantId,
      username: dto.username,
      password: await hashPassword(dto.password),
      realName: dto.realName ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      avatar: dto.avatar ?? null,
      status: dto.status ?? CommonStatus.ENABLED,
    });
    const saved = await this.userRepo.save(entity);

    if (dto.roleIds?.length) {
      await this.assignRoles(saved.id, dto.roleIds);
    }
    const [item] = await this.attachRoles([saved]);
    return item;
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto): Promise<UserItem> {
    const user = await this.userRepo.findOne({ where: { id, tenantId } });
    if (!user) throw new BizException(BizCode.USER_NOT_FOUND);

    Object.assign(user, {
      realName: dto.realName ?? user.realName,
      email: dto.email ?? user.email,
      phone: dto.phone ?? user.phone,
      avatar: dto.avatar ?? user.avatar,
      status: dto.status ?? user.status,
    });
    const saved = await this.userRepo.save(user);

    if (dto.roleIds) {
      await this.assignRoles(id, dto.roleIds);
    }
    const [item] = await this.attachRoles([saved]);
    return item;
  }

  /** 软删除用户 */
  async remove(tenantId: string, id: string, operatorId: string): Promise<void> {
    if (id === operatorId) {
      throw BizException.invalidParam('不能删除当前登录账号');
    }
    const user = await this.userRepo.findOne({ where: { id, tenantId } });
    if (!user) throw new BizException(BizCode.USER_NOT_FOUND);
    await this.userRepo.softDelete({ id });
    await this.userRoleRepo.delete({ userId: id });
    await this.authz.clearUserCache(id);
  }

  /** 覆盖式分配角色 */
  async assignRoles(userId: string, roleIds: string[]): Promise<void> {
    await this.userRoleRepo.delete({ userId });
    if (roleIds.length > 0) {
      const roles = await this.roleRepo.find({ where: { id: In(roleIds) } });
      if (roles.length !== roleIds.length) throw new BizException(BizCode.ROLE_NOT_FOUND);
      await this.userRoleRepo.insert(roleIds.map((roleId) => ({ userId, roleId })));
    }
    await this.authz.clearUserCache(userId);
  }

  /** 修改密码：需校验原密码 */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user) throw new BizException(BizCode.USER_NOT_FOUND);

    const matched = await verifyPassword(oldPassword, user.password);
    if (!matched) throw new BizException(BizCode.OLD_PASSWORD_MISMATCH);
    if (oldPassword === newPassword) {
      throw BizException.invalidParam('新密码不能与原密码相同');
    }

    await this.userRepo.update({ id: userId }, { password: await hashPassword(newPassword) });
  }

  /** 重置密码（管理员操作） */
  async resetPassword(tenantId: string, id: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id, tenantId } });
    if (!user) throw new BizException(BizCode.USER_NOT_FOUND);
    await this.userRepo.update({ id }, { password: await hashPassword(newPassword) });
  }
}
