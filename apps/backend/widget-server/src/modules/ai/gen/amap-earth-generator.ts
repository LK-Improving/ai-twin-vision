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
 * 高德 ABot-Earth 适配器（详细设计 §16.3-12 / §17）。
 *
 * 通过 `AMAP_EARTH_API_URL` / `AMAP_EARTH_API_KEY` 接入；高德未开放 API 前默认不启用。
 * 与另外两个第三方生成器一样：只负责「拿回模型」，
 * 后续上传 / 落库 / 编排 / 绑定 / 预览完全复用现有链路，一行不改。
 *
 * 差异点：高德是真实地理底图，所以请求体里带上锚点经纬度和园区范围。
 */
export class AmapEarthGenerator implements GeometryGenerator {
  readonly strategy: AiSceneStrategy = 'amapEarth';

  private readonly cfg: ThirdPartyConfig | null;

  constructor(cfg: ThirdPartyConfig | null = readThirdPartyConfig('AMAP_EARTH')) {
    this.cfg = cfg;
  }

  supports(): boolean {
    return !!this.cfg;
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    if (!this.cfg) {
      throw new BizException(
        BizCode.AI_GENERATE_FAILED,
        '未配置高德 ABot-Earth 服务：请设置 AMAP_EARTH_API_URL / AMAP_EARTH_API_KEY',
      );
    }
    const glb = await requestThirdPartyModel(this.cfg, {
      prompt: buildPrompt(input.dsl),
      format: 'glb',
      quality: input.quality,
      model: this.cfg.model,
      meta: {
        ...input.dsl.meta,
        extent: input.dsl.site?.extent,
        anchor: input.dsl.site?.anchor,
      },
    });

    return {
      glb,
      semantics: [],
      stats: { buildings: input.dsl.buildings?.length ?? 0, triangles: 0, bytes: glb.length },
    };
  }
}
