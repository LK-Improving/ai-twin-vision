import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { DataSource, In, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import {
  BizCode,
  DEFAULT_ENGINE_CONFIG,
  EMPTY_PAGE_SCHEMA,
  SCENE_STATUS_TEXT,
  SceneStatus,
  SceneType,
  type EngineConfig,
  type PageResult,
  type PageSchema,
  type PublishSceneResult,
  type SceneComponentInstance,
  type SceneDetail,
  type SceneListItem,
  type SceneVersionItem,
  type ScreenSnapshot,
} from '@dt/shared-types';
import { SceneComponentEntity, SceneEntity, SceneVersionEntity } from './entities';
import { ComponentEntity, TemplateEntity } from '../component/entities';
import { BizException } from '../../common/exceptions/biz.exception';
import { normalizePage, resolveOrderBy } from '../../common/utils/page.util';
import { toSemver } from '../../common/utils/crypto.util';
import type {
  CloneSceneDto,
  CreateSceneDto,
  PatchSceneDto,
  SceneComponentDto,
  SceneQueryDto,
  UpdateSceneDto,
} from './dto/scene.dto';

const SCENE_SORT_FIELDS: Record<string, string> = {
  createdAt: 'scene.created_at',
  updatedAt: 'scene.updated_at',
  name: 'scene.name',
  status: 'scene.status',
};

/** 状态字符串 → 数字（数据库存储 smallint） */
function parseStatus(text?: string): number | undefined {
  if (!text) return undefined;
  const map: Record<string, number> = {
    DRAFT: SceneStatus.DRAFT,
    PUBLISHED: SceneStatus.PUBLISHED,
    ARCHIVED: SceneStatus.ARCHIVED,
  };
  return map[text.toUpperCase()];
}

/** 深合并：用于把局部引擎配置合并进默认配置，避免前端漏字段导致渲染异常 */
function deepMerge<T extends Record<string, any>>(base: T, patch?: Record<string, any>): T {
  if (!patch) return base;
  const result: Record<string, any> = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = result[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current &&
      typeof current === 'object' &&
      !Array.isArray(current)
    ) {
      result[key] = deepMerge(current, value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

@Injectable()
export class SceneService {
  private readonly logger = new Logger(SceneService.name);

  constructor(
    @InjectRepository(SceneEntity)
    private readonly sceneRepo: Repository<SceneEntity>,
    @InjectRepository(SceneComponentEntity)
    private readonly sceneComponentRepo: Repository<SceneComponentEntity>,
    @InjectRepository(SceneVersionEntity)
    private readonly versionRepo: Repository<SceneVersionEntity>,
    @InjectRepository(ComponentEntity)
    private readonly componentRepo: Repository<ComponentEntity>,
    @InjectRepository(TemplateEntity)
    private readonly templateRepo: Repository<TemplateEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** 分页查询场景列表 */
  async paginate(tenantId: string, query: SceneQueryDto): Promise<PageResult<SceneListItem>> {
    const { page, limit, skip } = normalizePage(query);
    const order = resolveOrderBy(query.sort, SCENE_SORT_FIELDS, {
      column: 'scene.updated_at',
      order: 'DESC',
    });

    const qb = this.sceneRepo
      .createQueryBuilder('scene')
      .where('scene.tenant_id = :tenantId', { tenantId })
      .andWhere('scene.deleted_at IS NULL');

    if (query.keyword) {
      qb.andWhere('(scene.name ILIKE :kw OR scene.description ILIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }
    const status = parseStatus(query.status);
    if (status !== undefined) {
      qb.andWhere('scene.status = :status', { status });
    }
    if (query.sceneType) {
      qb.andWhere('scene.scene_type = :sceneType', { sceneType: query.sceneType });
    }
    if (query.creatorId) {
      qb.andWhere('scene.creator_id = :creatorId', { creatorId: query.creatorId });
    }

    const [rows, total] = await qb
      .orderBy(order.column, order.order)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { total, page, limit, dataList: rows.map((row) => this.toListItem(row)) };
  }

  /** 场景详情：含引擎配置、组件实例与画布 Schema */
  async detail(tenantId: string, id: string): Promise<SceneDetail> {
    const scene = await this.findSceneOrFail(tenantId, id);
    const components = await this.loadComponents(id);
    return {
      ...this.toListItem(scene),
      config: deepMerge(DEFAULT_ENGINE_CONFIG, scene.engineConfig as Record<string, any>),
      components,
      layout: this.normalizeLayout(scene.layout),
    };
  }

  /**
   * 大屏公开快照（/screen/:token）。
   * 只暴露渲染必需数据，且仅对「已发布」场景生效，草稿不会因令牌泄露而外泄。
   */
  async screenSnapshot(token: string): Promise<ScreenSnapshot> {
    const scene = await this.findPublishedByToken(token);
    const components = await this.loadComponents(scene.id);
    return {
      sceneId: scene.id,
      name: scene.name,
      versionNo: scene.publishVersion ?? 0,
      config: deepMerge(DEFAULT_ENGINE_CONFIG, scene.engineConfig as Record<string, any>),
      components,
      layout: this.normalizeLayout(scene.layout),
    };
  }

  /**
   * 解析发布令牌对应的场景与租户（供签发 WS 票据使用）。
   * 租户信息只留在服务端，不会随快照下发给前端。
   */
  async resolveScreenTarget(token: string): Promise<{ sceneId: string; tenantId: string }> {
    const scene = await this.findPublishedByToken(token);
    return { sceneId: scene.id, tenantId: scene.tenantId };
  }

  /** 按发布令牌查找已发布场景；不存在或未发布时抛业务异常 */
  private async findPublishedByToken(token: string): Promise<SceneEntity> {
    if (!token || token.length > 64) {
      throw new BizException(BizCode.SCENE_NOT_FOUND);
    }
    const scene = await this.sceneRepo.findOne({ where: { publishToken: token } });
    if (!scene || scene.status !== SceneStatus.PUBLISHED) {
      throw new BizException(BizCode.SCENE_NOT_FOUND);
    }
    return scene;
  }

  /** 创建场景，可基于模板初始化 */
  async create(tenantId: string, userId: string, dto: CreateSceneDto): Promise<SceneDetail> {
    await this.assertNameAvailable(tenantId, dto.name);

    let baseConfig: EngineConfig = DEFAULT_ENGINE_CONFIG;
    let baseLayout: PageSchema = EMPTY_PAGE_SCHEMA;

    if (dto.templateId) {
      const template = await this.templateRepo.findOne({
        where: { id: dto.templateId, tenantId },
      });
      if (!template) throw new BizException(BizCode.TEMPLATE_NOT_FOUND);
      const data = template.templateData as {
        config?: Partial<EngineConfig>;
        layout?: PageSchema;
      };
      baseConfig = deepMerge(DEFAULT_ENGINE_CONFIG, data.config as Record<string, any>);
      baseLayout = data.layout ?? EMPTY_PAGE_SCHEMA;
    }

    const entity = this.sceneRepo.create({
      tenantId,
      name: dto.name,
      description: dto.description ?? null,
      coverImage: dto.coverImage ?? null,
      sceneType: dto.sceneType ?? SceneType.HYBRID,
      engineConfig: deepMerge(baseConfig, dto.config as Record<string, any>),
      layout: baseLayout,
      status: SceneStatus.DRAFT,
      version: 1,
      publishVersion: null,
      creatorId: userId,
    });

    const saved = await this.sceneRepo.save(entity);
    this.logger.log(`场景创建成功 id=${saved.id} name=${saved.name}`);
    return this.detail(tenantId, saved.id);
  }

  /**
   * 全量更新场景。
   * 场景元数据、引擎配置、组件实例、画布 Schema 在同一事务内提交，
   * 避免部分成功导致场景数据不一致。
   */
  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateSceneDto | PatchSceneDto,
    partial = false,
  ): Promise<SceneDetail> {
    const scene = await this.findSceneOrFail(tenantId, id);

    if (dto.name && dto.name !== scene.name) {
      await this.assertNameAvailable(tenantId, dto.name, id);
    }

    await this.dataSource.transaction(async (manager) => {
      const sceneRepo = manager.getRepository(SceneEntity);
      const componentRepo = manager.getRepository(SceneComponentEntity);

      sceneRepo.merge(scene, {
        name: dto.name ?? scene.name,
        description: partial ? (dto.description ?? scene.description) : (dto.description ?? null),
        coverImage: partial ? (dto.coverImage ?? scene.coverImage) : (dto.coverImage ?? null),
        sceneType: dto.sceneType ?? scene.sceneType,
        engineConfig: dto.config
          ? deepMerge(scene.engineConfig as Record<string, any>, dto.config as Record<string, any>)
          : scene.engineConfig,
        layout: dto.layout ?? scene.layout,
        // 每次保存递增编辑版本号，用于乐观并发与版本展示
        version: scene.version + 1,
      });
      await sceneRepo.save(scene);

      if (dto.components) {
        await this.syncComponents(componentRepo, id, dto.components);
      }
    });

    return this.detail(tenantId, id);
  }

  /** 同步组件实例：新增 / 更新 / 删除多余项 */
  private async syncComponents(
    repo: Repository<SceneComponentEntity>,
    sceneId: string,
    components: SceneComponentDto[],
  ): Promise<void> {
    // 校验组件定义存在，避免脏引用
    const componentIds = [...new Set(components.map((item) => item.componentId))];
    if (componentIds.length > 0) {
      const found = await this.componentRepo.find({ where: { id: In(componentIds) } });
      if (found.length !== componentIds.length) {
        throw new BizException(BizCode.COMPONENT_NOT_FOUND, '存在无效的组件引用');
      }
    }

    const existing = await repo.find({ where: { sceneId } });
    const existingMap = new Map(existing.map((item) => [item.id, item]));
    const keepIds = new Set<string>();

    for (const [index, item] of components.entries()) {
      if (item.id && existingMap.has(item.id)) {
        const target = existingMap.get(item.id)!;
        repo.merge(target, {
          componentId: item.componentId,
          name: item.name ?? target.name,
          componentConfig: item.componentConfig ?? target.componentConfig,
          position: item.position ?? target.position,
          layerId: item.layerId ?? target.layerId,
          sortOrder: item.sortOrder ?? index,
          visible: item.visible ?? target.visible,
          locked: item.locked ?? target.locked,
        });
        await repo.save(target);
        keepIds.add(target.id);
      } else {
        const created = await repo.save(
          repo.create({
            sceneId,
            componentId: item.componentId,
            name: item.name ?? null,
            componentConfig: item.componentConfig ?? {},
            position: item.position ?? {},
            layerId: item.layerId ?? null,
            sortOrder: item.sortOrder ?? index,
            visible: item.visible ?? true,
            locked: item.locked ?? false,
          }),
        );
        keepIds.add(created.id);
      }
    }

    const removeIds = existing.filter((item) => !keepIds.has(item.id)).map((item) => item.id);
    if (removeIds.length > 0) {
      await repo.softDelete({ id: In(removeIds) });
    }
  }

  /** 软删除场景（组件实例随之软删除） */
  async remove(tenantId: string, id: string): Promise<void> {
    const scene = await this.findSceneOrFail(tenantId, id);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(SceneComponentEntity).softDelete({ sceneId: scene.id });
      await manager.getRepository(SceneEntity).softDelete({ id: scene.id });
    });
    this.logger.log(`场景已删除 id=${id}`);
  }

  /**
   * 发布场景：生成完整快照写入版本表，并把状态置为已发布。
   * 发布前执行校验，存在阻断性问题时返回 SCENE_VALIDATE_FAILED。
   */
  async publish(
    tenantId: string,
    userId: string,
    id: string,
    changeLog?: string,
  ): Promise<PublishSceneResult> {
    const scene = await this.findSceneOrFail(tenantId, id);
    const components = await this.loadComponents(id);

    const errors = this.validateBeforePublish(scene, components);
    if (errors.length > 0) {
      throw new BizException(BizCode.SCENE_VALIDATE_FAILED, errors[0], errors);
    }

    const nextVersionNo = (scene.publishVersion ?? 0) + 1;
    // 令牌只在首次发布时生成：保证已发出的分享链接在重新发布后依然有效
    const publishToken = scene.publishToken ?? randomBytes(12).toString('base64url');

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(SceneVersionEntity).insert({
        sceneId: id,
        versionNo: nextVersionNo,
        snapshotData: {
          config: scene.engineConfig,
          components,
          layout: this.normalizeLayout(scene.layout),
        },
        changeLog: changeLog ?? null,
        creatorId: userId,
      });

      await manager.getRepository(SceneEntity).update(
        { id },
        {
          status: SceneStatus.PUBLISHED,
          publishVersion: nextVersionNo,
          version: scene.version + 1,
          publishToken,
        },
      );
    });

    const updated = await this.findSceneOrFail(tenantId, id);
    this.logger.log(`场景发布成功 id=${id} version=${nextVersionNo}`);

    return {
      id: updated.id,
      status: SCENE_STATUS_TEXT[updated.status as SceneStatus] ?? 'DRAFT',
      version: toSemver(nextVersionNo * 10),
      versionNo: nextVersionNo,
      updatedAt: updated.updatedAt.toISOString(),
      publishToken: updated.publishToken,
    };
  }

  /** 发布前校验：确保场景可用 */
  private validateBeforePublish(
    scene: SceneEntity,
    components: SceneComponentInstance[],
  ): string[] {
    const errors: string[] = [];
    const config = deepMerge(DEFAULT_ENGINE_CONFIG, scene.engineConfig as Record<string, any>);

    if (!config.cesium.enabled && !config.threejs.enabled) {
      errors.push('至少需要启用 Cesium 或 Three.js 中的一个引擎');
    }
    if (config.cesium.enabled && config.cesium.imageryLayers.length === 0) {
      errors.push('宏观场景至少需要配置一个影像图层');
    }
    const layout = this.normalizeLayout(scene.layout);
    if (components.length === 0 && layout.nodes.length === 0) {
      errors.push('场景内容为空，请先添加三维组件或大屏组件');
    }
    // 三维模型组件必须绑定模型地址，否则运行时白屏
    for (const item of components) {
      const modelUrl = (item.componentConfig as Record<string, unknown>)?.modelUrl;
      if (item.componentType === 'MODEL_3D' && !modelUrl) {
        errors.push(`组件「${item.name ?? item.id}」缺少模型地址`);
      }
    }
    return errors;
  }

  /** 克隆场景（含组件实例） */
  async clone(
    tenantId: string,
    userId: string,
    id: string,
    dto: CloneSceneDto,
  ): Promise<SceneListItem> {
    const source = await this.findSceneOrFail(tenantId, id);
    await this.assertNameAvailable(tenantId, dto.name);

    const cloned = await this.dataSource.transaction(async (manager) => {
      const sceneRepo = manager.getRepository(SceneEntity);
      const componentRepo = manager.getRepository(SceneComponentEntity);

      const saved = await sceneRepo.save(
        sceneRepo.create({
          tenantId,
          name: dto.name,
          description: dto.description ?? source.description,
          coverImage: source.coverImage,
          sceneType: source.sceneType,
          engineConfig: source.engineConfig,
          layout: source.layout,
          status: SceneStatus.DRAFT,
          version: 1,
          publishVersion: null,
          creatorId: userId,
        }),
      );

      const sourceComponents = await componentRepo.find({ where: { sceneId: id } });
      if (sourceComponents.length > 0) {
        await componentRepo.insert(
          sourceComponents.map((item) => ({
            sceneId: saved.id,
            componentId: item.componentId,
            name: item.name,
            componentConfig: item.componentConfig,
            position: item.position,
            layerId: item.layerId,
            sortOrder: item.sortOrder,
            visible: item.visible,
            locked: item.locked,
          })) as unknown as QueryDeepPartialEntity<SceneComponentEntity>[],
        );
      }
      return saved;
    });

    this.logger.log(`场景克隆成功 source=${id} target=${cloned.id}`);
    return this.toListItem(cloned);
  }

  /** 版本列表 */
  async versions(tenantId: string, id: string): Promise<SceneVersionItem[]> {
    await this.findSceneOrFail(tenantId, id);
    const rows = await this.versionRepo.find({
      where: { sceneId: id },
      order: { versionNo: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      sceneId: row.sceneId,
      versionNo: row.versionNo,
      version: toSemver(row.versionNo * 10),
      changeLog: row.changeLog,
      publishedBy: row.creatorId,
      publishedAt: row.createdAt.toISOString(),
    }));
  }

  /** 回滚到指定版本：用快照覆盖当前编辑态 */
  async rollback(
    tenantId: string,
    userId: string,
    id: string,
    versionNo: number,
  ): Promise<SceneDetail> {
    await this.findSceneOrFail(tenantId, id);
    const version = await this.versionRepo.findOne({ where: { sceneId: id, versionNo } });
    if (!version) throw new BizException(BizCode.SCENE_VERSION_NOT_FOUND);

    const snapshot = version.snapshotData as {
      config?: EngineConfig;
      components?: SceneComponentInstance[];
      layout?: PageSchema;
    };

    await this.dataSource.transaction(async (manager) => {
      const sceneRepo = manager.getRepository(SceneEntity);
      const componentRepo = manager.getRepository(SceneComponentEntity);
      const current = await sceneRepo.findOne({ where: { id } });
      if (!current) throw new BizException(BizCode.SCENE_NOT_FOUND);

      await sceneRepo.update({ id }, {
        engineConfig: snapshot.config ?? current.engineConfig,
        layout: snapshot.layout ?? current.layout,
        version: current.version + 1,
      } as unknown as QueryDeepPartialEntity<SceneEntity>);

      // 快照组件全量覆盖（先物理清空当前实例，再按快照重建）
      await componentRepo.delete({ sceneId: id });
      const components = snapshot.components ?? [];
      if (components.length > 0) {
        await componentRepo.insert(
          components.map((item, index) => ({
            sceneId: id,
            componentId: item.componentId,
            name: item.name ?? null,
            componentConfig: item.componentConfig ?? {},
            position: item.position ?? {},
            layerId: item.layerId ?? null,
            sortOrder: item.sortOrder ?? index,
            visible: item.visible ?? true,
            locked: item.locked ?? false,
          })) as unknown as QueryDeepPartialEntity<SceneComponentEntity>[],
        );
      }
    });

    this.logger.log(`场景回滚成功 id=${id} → v${versionNo}`);
    return this.detail(tenantId, id);
  }

  // ---------- 内部工具 ----------

  private async findSceneOrFail(tenantId: string, id: string): Promise<SceneEntity> {
    const scene = await this.sceneRepo.findOne({ where: { id, tenantId } });
    if (!scene) throw new BizException(BizCode.SCENE_NOT_FOUND);
    return scene;
  }

  private async assertNameAvailable(
    tenantId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.sceneRepo
      .createQueryBuilder('scene')
      .where('scene.tenant_id = :tenantId', { tenantId })
      .andWhere('scene.name = :name', { name })
      .andWhere('scene.deleted_at IS NULL');
    if (excludeId) qb.andWhere('scene.id <> :excludeId', { excludeId });
    if (await qb.getExists()) {
      throw new BizException(BizCode.SCENE_NAME_DUPLICATE);
    }
  }

  /** 加载场景组件实例，并冗余组件类型便于前端直接渲染 */
  private async loadComponents(sceneId: string): Promise<SceneComponentInstance[]> {
    const rows = await this.sceneComponentRepo.find({
      where: { sceneId },
      order: { sortOrder: 'ASC' },
    });
    if (rows.length === 0) return [];

    const componentIds = [...new Set(rows.map((row) => row.componentId))];
    const definitions = await this.componentRepo.find({ where: { id: In(componentIds) } });
    const typeMap = new Map(definitions.map((item) => [item.id, item]));

    return rows.map((row) => {
      const definition = typeMap.get(row.componentId);
      return {
        id: row.id,
        sceneId: row.sceneId,
        componentId: row.componentId,
        componentType: definition?.componentType,
        name: row.name ?? definition?.name ?? undefined,
        componentConfig: row.componentConfig ?? {},
        position: row.position ?? {},
        layerId: row.layerId,
        sortOrder: row.sortOrder,
        visible: row.visible,
        locked: row.locked,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }

  /** 兜底空画布，避免历史数据缺字段导致前端崩溃 */
  private normalizeLayout(layout: unknown): PageSchema {
    const raw = (layout ?? {}) as Partial<PageSchema>;
    return {
      version: raw.version ?? EMPTY_PAGE_SCHEMA.version,
      nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
      events: Array.isArray(raw.events) ? raw.events : [],
      variables: Array.isArray(raw.variables) ? raw.variables : [],
      initScript: raw.initScript,
    };
  }

  private toListItem(scene: SceneEntity): SceneListItem {
    return {
      id: scene.id,
      name: scene.name,
      description: scene.description,
      coverImage: scene.coverImage,
      sceneType: scene.sceneType as SceneType,
      status: SCENE_STATUS_TEXT[scene.status as SceneStatus] ?? 'DRAFT',
      version: scene.version,
      publishVersion: scene.publishVersion,
      creatorId: scene.creatorId,
      createdAt: scene.createdAt.toISOString(),
      updatedAt: scene.updatedAt.toISOString(),
    };
  }
}
