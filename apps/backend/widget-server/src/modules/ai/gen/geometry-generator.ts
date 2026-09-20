import type { AiSceneStrategy } from '@dt/shared-types';
import type { BuildingSemantic, SceneDsl } from '../dsl/types';

/** 生成输入（详细设计 §6.1） */
export interface GenerateInput {
  dsl: SceneDsl;
  quality: 'L1' | 'L2';
  /**
   * 外部已上传的 GLB 字节（assetKit 导入策略用）。
   * 由 ai-scene.service 在 generate 前从 sourceFileId 读取并注入；
   * 其他策略（procedural / text3d 等）忽略此字段。
   */
  glbSource?: Buffer;
}

/** 生成输出 */
export interface GenerateOutput {
  glb: Buffer;
  semantics: BuildingSemantic[];
  stats: { buildings: number; triangles: number; bytes: number };
}

/**
 * 几何生成器接口（详细设计 §17「生成器可插拔」）。
 *
 * 接口固定为这三个成员：新增第三方生成器只要实现它即可接入，
 * 后续「上传 → 落库 → 编排 → 绑定 → 预览」一行都不用改。
 * L3 的 Text3D / GaussianSplat / AmapEarth 都按这个接口实现。
 */
export interface GeometryGenerator {
  /** 策略标识，与 AiSceneStrategy 对齐 */
  readonly strategy: AiSceneStrategy;
  /**
   * 当前配置下是否可用。
   * 未配置对应第三方服务时返回 false，由注册表降级到程序化生成（不报错、不阻断）。
   */
  supports(dsl?: SceneDsl): boolean;
  generate(input: GenerateInput): Promise<GenerateOutput>;
}
