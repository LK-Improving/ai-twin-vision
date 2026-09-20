import { IsBoolean, IsOptional, IsString, IsObject, MaxLength } from 'class-validator';
import type { AiSceneStrategy, Cartographic } from '@dt/shared-types';

/** POST /api/v1/ai/scene/generate 请求 DTO（class-validator 校验） */
export class GenerateSceneDto {
  /** 自然语言描述，必填，≤2000 字 */
  @IsString()
  @MaxLength(2000, { message: '生成描述不能超过 2000 字' })
  prompt!: string;

  /** 场景名，缺省取 DSL.meta.title */
  @IsOptional()
  @IsString()
  name?: string;

  /** 场景类型，默认 HYBRID */
  @IsOptional()
  @IsString()
  sceneType?: string;

  /** 锚点（微观场景在宏观地图上的落点），缺省由规划器推断 */
  @IsOptional()
  @IsObject()
  anchor?: Cartographic;

  /** 质量档，默认 L1 */
  @IsOptional()
  @IsString()
  quality?: 'L1' | 'L2';

  /**
   * assetKit 导入策略所需的「已上传文件 id」。
   * 先用 POST /api/v1/files/upload 把 Studio 导出的 GLB 传到平台，拿到 id 再传入；
   * 仅当 strategy=assetKit（或显式传该字段）时生效，其他策略忽略。
   */
  @IsOptional()
  @IsString()
  sourceFileId?: string;

  /**
   * 生成策略，默认 auto。
   * L3 的 text3d / gaussianSplat / amapEarth 为第三方服务适配位，
   * 未配置对应 API_URL / API_KEY 时自动降级为 procedural（不报错）。
   */
  @IsOptional()
  @IsString()
  strategy?: AiSceneStrategy;

  /** 只返回 DSL 与统计，不落库（调试/预览用） */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /**
   * 生成后是否立即发布为演示大屏（一键闭环）。
   * 为 true 时落库后自动发布，结果回带 publishToken / screenUrl；
   * 发布失败不阻断生成，只写入 warnings。
   */
  @IsOptional()
  @IsBoolean()
  autoPublish?: boolean;

  /** 是否异步（长任务），L1 固定同步，忽略 true */
  @IsOptional()
  @IsBoolean()
  async?: boolean;
}
