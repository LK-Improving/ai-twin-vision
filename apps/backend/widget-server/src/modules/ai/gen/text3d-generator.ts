import { BizCode, type AiSceneStrategy } from '@dt/shared-types';
import { BizException } from '../../../common/exceptions/biz.exception';
import type { GenerateInput, GenerateOutput, GeometryGenerator } from './geometry-generator';
import {
  buildPrompt,
  buildSafePrompt,
  readThirdPartyConfig,
  requestTripoModel,
  TRIPO_CONTENT_POLICY_HINT,
  type ThirdPartyConfig,
} from './third-party';

/**
 * 文生 3D 适配器（详细设计 §16.3-11）。
 *
 * 通过 `TEXT3D_API_URL` / `TEXT3D_API_KEY` 接入第三方文生 3D 服务：
 * 未配置时 `supports()` 为 false，注册表会降级到程序化生成，不会报错。
 *
 * ⚠️ 第三方产物没有稳定的建筑级语义 id，因此 `semantics` 返回空数组——
 * 语义绑定仍由本方案的 mesh 层承担（§17：3DGS 做背景、mesh 做可交互主体）。
 */
export class Text3DGenerator implements GeometryGenerator {
  readonly strategy: AiSceneStrategy = 'text3d';

  private readonly cfg: ThirdPartyConfig | null;

  constructor(cfg: ThirdPartyConfig | null = readThirdPartyConfig('TEXT3D')) {
    this.cfg = cfg;
  }

  supports(): boolean {
    return !!this.cfg;
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    if (!this.cfg) {
      throw new BizException(
        BizCode.AI_GENERATE_FAILED,
        '未配置文生 3D 服务：请设置 TEXT3D_API_URL / TEXT3D_API_KEY',
      );
    }

    let glb: Buffer;
    try {
      glb = await requestTripoModel(this.cfg, {
        prompt: buildPrompt(input.dsl),
        model: this.cfg.model,
        texture: true,
        pbr: true,
        textureQuality: 'standard',
      });
    } catch (err) {
      // 中文 prompt 触发 Tripo 内容安全策略时，自动改用英文安全描述重试一次
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes(TRIPO_CONTENT_POLICY_HINT)) {
        glb = await requestTripoModel(this.cfg, {
          prompt: buildSafePrompt(input.dsl),
          model: this.cfg.model,
          texture: true,
          pbr: true,
          textureQuality: 'standard',
        });
      } else {
        throw err;
      }
    }

    return {
      glb,
      semantics: [],
      // 三角面数由第三方产物决定，服务端无法在解析前得知，置 0 避免虚报
      stats: { buildings: input.dsl.buildings?.length ?? 0, triangles: 0, bytes: glb.length },
    };
  }
}
