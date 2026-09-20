import { BizCode, type AiSceneStrategy } from '@dt/shared-types';
import { BizException } from '../../../common/exceptions/biz.exception';
import type { GenerateInput, GenerateOutput, GeometryGenerator } from './geometry-generator';
import {
  buildPrompt,
  readThirdPartyConfig,
  requestThirdPartyModel,
  type ThirdPartyConfig,
} from './third-party';

/**
 * 3DGS（三维高斯泼溅）适配器（详细设计 §16.3-11）。
 *
 * 通过 `GAUSSIAN_SPLAT_API_URL` / `GAUSSIAN_SPLAT_API_KEY` 接入第三方 3DGS 服务。
 *
 * ⚠️ 两条现实约束：
 * 1. 3DGS 产物**不可语义绑定**（§17），故 `semantics` 返回空数组，语义仍由 mesh 层承担；
 * 2. 引擎当前只能渲染 glTF（上传白名单也没有 `.splat` / `.ply`），
 *    因此这里统一请求 `format: 'glb'`；若服务只能吐 splat，本阶段无法直接使用。
 */
export class GaussianSplatGenerator implements GeometryGenerator {
  readonly strategy: AiSceneStrategy = 'gaussianSplat';

  private readonly cfg: ThirdPartyConfig | null;

  constructor(cfg: ThirdPartyConfig | null = readThirdPartyConfig('GAUSSIAN_SPLAT')) {
    this.cfg = cfg;
  }

  supports(): boolean {
    return !!this.cfg;
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    if (!this.cfg) {
      throw new BizException(
        BizCode.AI_GENERATE_FAILED,
        '未配置 3DGS 服务：请设置 GAUSSIAN_SPLAT_API_URL / GAUSSIAN_SPLAT_API_KEY',
      );
    }
    const glb = await requestThirdPartyModel(this.cfg, {
      prompt: buildPrompt(input.dsl),
      format: 'glb',
      quality: input.quality,
      model: this.cfg.model,
      meta: { ...input.dsl.meta, extent: input.dsl.site?.extent, representation: '3dgs' },
    });

    return {
      glb,
      semantics: [],
      stats: { buildings: input.dsl.buildings?.length ?? 0, triangles: 0, bytes: glb.length },
    };
  }
}
