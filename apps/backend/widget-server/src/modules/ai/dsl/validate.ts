import type { SceneDsl } from './types';

/** 校验结果：ok=false 表示硬约束未通过（拒绝生成） */
export interface DslValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const MAX_FLOORS = 120;
const MIN_DIM = 2;
const MAX_DIM = 200;

/**
 * 手写 DSL 校验器（替代 zod，零新增依赖）。
 * 硬约束不通过 → ok=false（调用方抛 AI_DSL_INVALID）；
 * 软约束只产生 warning 不阻断，并在本函数内就地裁剪坐标，保证生成器拿到合法输入。
 */
export function validateSceneDsl(dsl: SceneDsl): DslValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!dsl || typeof dsl !== 'object') {
    return { ok: false, errors: ['DSL 为空或类型非法'], warnings };
  }
  if (!dsl.meta?.title) errors.push('meta.title 缺失');
  if (!dsl.site?.anchor || typeof dsl.site.anchor.longitude !== 'number') {
    errors.push('site.anchor 缺省或非法');
  }
  if (!Array.isArray(dsl.buildings) || dsl.buildings.length === 0) {
    errors.push('至少需要 1 栋建筑');
  }

  const extentW = dsl.site?.extent?.width ?? 0;
  const extentD = dsl.site?.extent?.depth ?? 0;
  const halfW = extentW / 2;
  const halfD = extentD / 2;

  const buildingIds = new Set<string>();

  for (const b of dsl.buildings ?? []) {
    if (!b.id) errors.push('存在建筑缺少 id');
    else buildingIds.add(b.id);

    if (!Number.isInteger(b.floors) || b.floors < 1 || b.floors > MAX_FLOORS) {
      errors.push(`建筑 ${b.id ?? '?'} 层数需在 1-${MAX_FLOORS} 之间（实际 ${b.floors}）`);
    }
    if (!b.floorHeight || b.floorHeight <= 0) b.floorHeight = 3.6;
    if (!b.footprint || b.footprint.width <= MIN_DIM || b.footprint.width >= MAX_DIM) {
      errors.push(`建筑 ${b.id ?? '?'} 宽度需在 (${MIN_DIM}, ${MAX_DIM}) 米`);
    }
    if (!b.footprint || b.footprint.depth <= MIN_DIM || b.footprint.depth >= MAX_DIM) {
      errors.push(`建筑 ${b.id ?? '?'} 进深需在 (${MIN_DIM}, ${MAX_DIM}) 米`);
    }

    // 软约束：超出园区范围 → 裁剪并告警
    if (b.footprint && extentW > 0 && extentD > 0) {
      const { x, y, width, depth } = b.footprint;
      const minX = x - width / 2;
      const maxX = x + width / 2;
      const minY = y - depth / 2;
      const maxY = y + depth / 2;
      if (minX < -halfW || maxX > halfW || minY < -halfD || maxY > halfD) {
        // 平移使底面中心尽量留在范围内
        b.footprint.x = Math.max(-halfW + width / 2, Math.min(halfW - width / 2, x));
        b.footprint.y = Math.max(-halfD + depth / 2, Math.min(halfD - depth / 2, y));
        warnings.push(`建筑 ${b.id ?? '?'} 超出园区范围，已裁剪到边界`);
      }
    }
  }

  for (const r of dsl.roads ?? []) {
    if (!Array.isArray(r.path) || r.path.length < 2)
      warnings.push(`道路 ${r.id ?? '?'} 途经点不足 2 个，已跳过`);
  }
  for (const w of dsl.water ?? []) {
    if (!Array.isArray(w.path) || w.path.length < 2)
      warnings.push(`水体 ${w.id ?? '?'} 途经点不足 2 个，已跳过`);
  }

  // POI 关联建筑必须存在或为 'site'
  for (const p of dsl.pois ?? []) {
    if (p.buildingId && p.buildingId !== 'site' && !buildingIds.has(p.buildingId)) {
      errors.push(`POI ${p.id ?? '?'} 关联建筑 ${p.buildingId} 不存在`);
    }
  }

  // 软约束：绿地覆盖率为 0
  if (!dsl.greenery || dsl.greenery.length === 0) {
    warnings.push('园区未规划绿地，覆盖率 0');
  }

  return { ok: errors.length === 0, errors, warnings };
}
