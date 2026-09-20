import type { GeometryGenerator } from './geometry-generator';
import { ProceduralGenerator } from './procedural-generator';
import { Text3DGenerator } from './text3d-generator';
import { GaussianSplatGenerator } from './gaussian-splat-generator';
import { AmapEarthGenerator } from './amap-earth-generator';
import { AssetKitGenerator } from './asset-kit-generator';

export interface ResolvedGenerator {
  generator: GeometryGenerator;
  /** 降级说明：第三方服务未配置时给出原因，为空表示按请求策略正常执行 */
  fallbackNote?: string;
}

/** 策略 → 中文名（用于降级提示，避免把内部枚举直接抛给用户） */
const STRATEGY_LABEL: Record<string, string> = {
  text3d: '文生 3D',
  gaussianSplat: '3DGS 高斯泼溅',
  amapEarth: '高德 ABot-Earth',
  assetKit: '导入 GLB（Studio 生成）',
};

/**
 * 按策略解析生成器（详细设计 §17「生成器可插拔」）。
 *
 * - `auto` / `procedural`：直接用程序化生成器（永远可用）。
 * - `assetKit`：导入已上传到平台的 GLB（如 Tripo Studio 生成回传），不调第三方。
 * - `text3d` / `gaussianSplat` / `amapEarth`：对应的第三方服务**已配置**才启用，
 *   否则降级为程序化生成并给出说明——保证「第三方没配也不会生成失败」。
 */
export function resolveGenerator(strategy?: string): ResolvedGenerator {
  const wanted = (strategy ?? 'auto').trim();
  const key = wanted.toLowerCase().replace(/[-_\s]/g, '');

  if (key === '' || key === 'auto' || key === 'procedural') {
    return { generator: new ProceduralGenerator() };
  }

  // assetKit：导入用户已上传的 GLB，永远可用（实际可用性取决于是否带 sourceFileId）
  if (key === 'assetkit') {
    return { generator: new AssetKitGenerator() };
  }

  const candidates: GeometryGenerator[] = [];
  if (key === 'text3d') candidates.push(new Text3DGenerator());
  else if (key === 'gaussiansplat') candidates.push(new GaussianSplatGenerator());
  else if (key === 'amapearth' || key === 'amap') candidates.push(new AmapEarthGenerator());

  const hit = candidates.find((g) => g.supports());
  if (hit) return { generator: hit };

  const label = STRATEGY_LABEL[wanted] ?? wanted;
  return {
    generator: new ProceduralGenerator(),
    fallbackNote: `策略「${label}」对应的第三方服务未配置（缺少 API_URL / API_KEY），已降级为程序化生成`,
  };
}
