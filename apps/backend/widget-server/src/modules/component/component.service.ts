import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  BizCode,
  type ComponentDetail,
  type ComponentListItem,
  type PageQuery,
  type PageResult,
  type TemplateDetail,
  type TemplateListItem,
} from '@dt/shared-types';
import { ComponentEntity, TemplateEntity } from './entities';
import { SceneComponentEntity, SceneEntity } from '../scene/entities';
import { FileEntity } from '../file/entities';
import { BizException } from '../../common/exceptions/biz.exception';
import { normalizePage, resolveOrderBy } from '../../common/utils/page.util';
import type {
  ComponentQueryDto,
  CreateComponentDto,
  CreateTemplateDto,
  UpdateComponentDto,
} from './dto/component.dto';

const COMPONENT_SORT_FIELDS: Record<string, string> = {
  createdAt: 'component.created_at',
  updatedAt: 'component.updated_at',
  name: 'component.name',
};

@Injectable()
export class ComponentService {
  constructor(
    @InjectRepository(ComponentEntity)
    private readonly componentRepo: Repository<ComponentEntity>,
    @InjectRepository(TemplateEntity)
    private readonly templateRepo: Repository<TemplateEntity>,
    @InjectRepository(SceneComponentEntity)
    private readonly sceneComponentRepo: Repository<SceneComponentEntity>,
    @InjectRepository(SceneEntity)
    private readonly sceneRepo: Repository<SceneEntity>,
    @InjectRepository(FileEntity)
    private readonly fileRepo: Repository<FileEntity>,
  ) {}

  /** 分页查询组件（本租户私有 + 全平台公共） */
  async paginate(
    tenantId: string,
    query: ComponentQueryDto,
  ): Promise<PageResult<ComponentListItem>> {
    const { page, limit, skip } = normalizePage(query);
    const order = resolveOrderBy(query.sort, COMPONENT_SORT_FIELDS, {
      column: 'component.created_at',
      order: 'DESC',
    });

    const qb = this.componentRepo
      .createQueryBuilder('component')
      .where('component.deleted_at IS NULL')
      .andWhere(
        new Brackets((sub) => {
          sub
            .where('component.tenant_id = :tenantId', { tenantId })
            .orWhere('component.is_public = TRUE');
        }),
      );

    const category = query.category ?? query.categoryId;
    if (category) {
      qb.andWhere('component.category = :category', { category });
    }
    if (query.componentType) {
      qb.andWhere('component.component_type = :componentType', {
        componentType: query.componentType,
      });
    }
    if (query.isPublic !== undefined) {
      qb.andWhere('component.is_public = :isPublic', { isPublic: query.isPublic });
    }
    if (query.keyword) {
      qb.andWhere('(component.name ILIKE :kw OR component.description ILIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }

    const [rows, total] = await qb
      .orderBy(order.column, order.order)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { total, page, limit, dataList: rows.map((row) => this.toListItem(row)) };
  }

  async detail(tenantId: string, id: string): Promise<ComponentDetail> {
    const entity = await this.findOrFail(tenantId, id);
    return {
      ...this.toListItem(entity),
      description: entity.description,
      configSchema: entity.configSchema ?? { props: [] },
      sourceCode: entity.sourceCode,
    };
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateComponentDto,
  ): Promise<ComponentDetail> {
    let modelFilePath: string | null = null;
    if (dto.modelFileId) {
      const file = await this.fileRepo.findOne({ where: { id: dto.modelFileId, tenantId } });
      if (!file) throw new BizException(BizCode.FILE_NOT_FOUND);
      modelFilePath = file.storagePath;
    }

    const saved = await this.componentRepo.save(
      this.componentRepo.create({
        tenantId,
        name: dto.name,
        description: dto.description ?? null,
        componentType: dto.componentType,
        category: dto.category,
        modelFilePath,
        thumbnail: dto.thumbnailUrl ?? null,
        configSchema: dto.configSchema ?? { props: [] },
        sourceCode: dto.sourceCode ?? null,
        isPublic: dto.isPublic ?? false,
        version: dto.version ?? '1.0.0',
        creatorId: userId,
      }),
    );
    return this.detail(tenantId, saved.id);
  }

  async update(tenantId: string, id: string, dto: UpdateComponentDto): Promise<ComponentDetail> {
    const entity = await this.findOrFail(tenantId, id);
    // 公共组件属于平台资产，禁止跨租户修改
    if (entity.tenantId !== tenantId) {
      throw new BizException(BizCode.PERMISSION_DENIED, '公共组件不允许修改');
    }

    if (dto.modelFileId) {
      const file = await this.fileRepo.findOne({ where: { id: dto.modelFileId, tenantId } });
      if (!file) throw new BizException(BizCode.FILE_NOT_FOUND);
      entity.modelFilePath = file.storagePath;
    }

    this.componentRepo.merge(entity, {
      name: dto.name ?? entity.name,
      description: dto.description ?? entity.description,
      componentType: dto.componentType ?? entity.componentType,
      category: dto.category ?? entity.category,
      thumbnail: dto.thumbnailUrl ?? entity.thumbnail,
      configSchema: dto.configSchema ?? entity.configSchema,
      sourceCode: dto.sourceCode ?? entity.sourceCode,
      isPublic: dto.isPublic ?? entity.isPublic,
      version: dto.version ?? entity.version,
    });

    await this.componentRepo.save(entity);
    return this.detail(tenantId, id);
  }

  /** 删除组件：被场景引用时拒绝，避免产生脏引用 */
  async remove(tenantId: string, id: string): Promise<void> {
    const entity = await this.findOrFail(tenantId, id);
    if (entity.tenantId !== tenantId) {
      throw new BizException(BizCode.PERMISSION_DENIED, '公共组件不允许删除');
    }

    const inUse = await this.sceneComponentRepo
      .createQueryBuilder('sc')
      .where('sc.component_id = :id', { id })
      .andWhere('sc.deleted_at IS NULL')
      .getExists();
    if (inUse) throw new BizException(BizCode.COMPONENT_IN_USE);

    await this.componentRepo.softDelete({ id });
  }

  // ---------- 模板 ----------

  async paginateTemplates(
    tenantId: string,
    query: PageQuery & { category?: string },
  ): Promise<PageResult<TemplateListItem>> {
    const { page, limit, skip } = normalizePage(query);
    const qb = this.templateRepo
      .createQueryBuilder('template')
      .where('template.deleted_at IS NULL')
      .andWhere(
        new Brackets((sub) => {
          sub
            .where('template.tenant_id = :tenantId', { tenantId })
            .orWhere('template.is_public = TRUE');
        }),
      );

    if (query.category) {
      qb.andWhere('template.category = :category', { category: query.category });
    }
    if (query.keyword) {
      qb.andWhere('(template.name ILIKE :kw OR template.description ILIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }

    const [rows, total] = await qb
      .orderBy('template.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      total,
      page,
      limit,
      dataList: rows.map((row) => this.toTemplateListItem(row)),
    };
  }

  async templateDetail(tenantId: string, id: string): Promise<TemplateDetail> {
    const entity = await this.templateRepo
      .createQueryBuilder('template')
      .where('template.id = :id', { id })
      .andWhere('template.deleted_at IS NULL')
      .andWhere(
        new Brackets((sub) => {
          sub
            .where('template.tenant_id = :tenantId', { tenantId })
            .orWhere('template.is_public = TRUE');
        }),
      )
      .getOne();
    if (!entity) throw new BizException(BizCode.TEMPLATE_NOT_FOUND);

    return {
      ...this.toTemplateListItem(entity),
      templateData: entity.templateData as TemplateDetail['templateData'],
    };
  }

  /** 创建模板，支持从已有场景另存为 */
  async createTemplate(
    tenantId: string,
    userId: string,
    dto: CreateTemplateDto,
  ): Promise<TemplateDetail> {
    let templateData: TemplateDetail['templateData'] = dto.templateData ?? {};

    if (dto.fromSceneId) {
      const scene = await this.sceneRepo.findOne({ where: { id: dto.fromSceneId, tenantId } });
      if (!scene) throw new BizException(BizCode.SCENE_NOT_FOUND);
      const components = await this.sceneComponentRepo.find({
        where: { sceneId: scene.id },
        order: { sortOrder: 'ASC' },
      });
      templateData = {
        config: scene.engineConfig as unknown as Record<string, unknown>,
        components: components.map((item) => ({
          componentId: item.componentId,
          name: item.name,
          componentConfig: item.componentConfig,
          position: item.position,
          layerId: item.layerId,
          sortOrder: item.sortOrder,
        })),
        layout: scene.layout,
      };
    }

    const saved = await this.templateRepo.save(
      this.templateRepo.create({
        tenantId,
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category,
        templateData: templateData as Record<string, unknown>,
        coverImage: dto.coverImage ?? null,
        isPublic: dto.isPublic ?? false,
        creatorId: userId,
      }),
    );
    return this.templateDetail(tenantId, saved.id);
  }

  async removeTemplate(tenantId: string, id: string): Promise<void> {
    const entity = await this.templateRepo.findOne({ where: { id, tenantId } });
    if (!entity) throw new BizException(BizCode.TEMPLATE_NOT_FOUND);
    await this.templateRepo.softDelete({ id });
  }

  // ---------- 内部工具 ----------

  private async findOrFail(tenantId: string, id: string): Promise<ComponentEntity> {
    const entity = await this.componentRepo
      .createQueryBuilder('component')
      .where('component.id = :id', { id })
      .andWhere('component.deleted_at IS NULL')
      .andWhere(
        new Brackets((sub) => {
          sub
            .where('component.tenant_id = :tenantId', { tenantId })
            .orWhere('component.is_public = TRUE');
        }),
      )
      .getOne();
    if (!entity) throw new BizException(BizCode.COMPONENT_NOT_FOUND);
    return entity;
  }

  private toListItem(entity: ComponentEntity): ComponentListItem {
    return {
      id: entity.id,
      name: entity.name,
      componentType: entity.componentType,
      category: entity.category,
      modelUrl: entity.modelFilePath,
      thumbnailUrl: entity.thumbnail,
      isPublic: entity.isPublic,
      version: entity.version,
      creatorId: entity.creatorId,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private toTemplateListItem(entity: TemplateEntity): TemplateListItem {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      category: entity.category,
      coverImage: entity.coverImage,
      isPublic: entity.isPublic,
      creatorId: entity.creatorId,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
