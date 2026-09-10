import type { TwinEntity, EngineName } from '../types';

/**
 * 实体注册表。
 * 负责维护 id → TwinEntity 的映射，并提供按图层 / 引擎的检索能力。
 * 实体删除时的资源释放由调用方（TwinViewer）完成，这里只维护索引。
 */
export class EntityManager {
  private readonly map = new Map<string, TwinEntity>();

  /** 注册或覆盖一条实体记录 */
  register(entity: TwinEntity): void {
    this.map.set(entity.id, entity);
  }

  /** 获取实体（不存在返回 undefined） */
  get(id: string): TwinEntity | undefined {
    return this.map.get(id);
  }

  /** 是否存在 */
  has(id: string): boolean {
    return this.map.has(id);
  }

  /** 全部实体 */
  list(): TwinEntity[] {
    return Array.from(this.map.values());
  }

  /** 按引擎检索 */
  byEngine(engine: EngineName): TwinEntity[] {
    return this.list().filter((e) => e.engine === engine);
  }

  /** 按图层检索 */
  byLayer(layerId: string): TwinEntity[] {
    return this.list().filter((e) => e.layerId === layerId);
  }

  /** 移除并返回被移除的记录（不存在返回 undefined） */
  remove(id: string): TwinEntity | undefined {
    const entity = this.map.get(id);
    if (entity) {
      this.map.delete(id);
      return entity;
    }
    return undefined;
  }

  /** 清空全部索引 */
  clear(): void {
    this.map.clear();
  }

  /** 实体数量 */
  get size(): number {
    return this.map.size;
  }
}
