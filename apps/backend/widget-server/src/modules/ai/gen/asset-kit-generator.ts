import { BizCode, type AiSceneStrategy } from '@dt/shared-types';
import { BizException } from '../../../common/exceptions/biz.exception';
import type { GenerateInput, GenerateOutput, GeometryGenerator } from './geometry-generator';

/**
 * 资产导入适配器（详细设计 §16.3：assetKit 适配位）。
 *
 * 不调用任何第三方服务——直接把用户已上传到平台的 GLB（例如用 Tripo Studio
 * 免费积分在网页端生成、再下载回传）作为场景模型，复用与 text3d 完全相同的
 * DSL→组件→面板→发布流水线。这样即可零 API 费用把 Studio 模型接进数字孪生大屏。
 *
 * 字节由 ai-scene.service 通过 sourceFileId 读取后注入到 GenerateInput.glbSource。
 */
export class AssetKitGenerator implements GeometryGenerator {
  readonly strategy: AiSceneStrategy = 'assetKit';

  /** assetKit 始终可用；真正的可用性取决于调用时是否携带 glbSource */
  supports(): boolean {
    return true;
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const glb = input.glbSource;
    if (!glb || glb.length === 0) {
      throw new BizException(
        BizCode.AI_GENERATE_FAILED,
        'assetKit 策略需要传入已上传的 GLB（sourceFileId 不能为空）',
      );
    }
    const magic = glb.slice(0, 4).toString('ascii');
    if (magic !== 'glTF') {
      throw new BizException(
        BizCode.AI_GENERATE_FAILED,
        `上传文件不是合法 GLB（magic=${magic || '<空>'}），请用 Tripo Studio 导出 .glb 后上传`,
      );
    }
    return {
      glb,
      semantics: [],
      // 三角面数第三方/用户产物解析前无法得知，置 0 避免虚报
      stats: { buildings: input.dsl.buildings?.length ?? 0, triangles: 0, bytes: glb.length },
    };
  }
}
