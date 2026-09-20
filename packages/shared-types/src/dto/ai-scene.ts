/**
 * 对话式生成 3D 场景 —— 接口契约（详细设计 §12）
 * 仅承载「前后端共享的 API 形状」，DSL 内部结构由后端 modules/ai 内聚，
 * 不在 shared-types 重复定义（避免与 packages/scene-dsl 产生两份真相）。
 */
import type { SceneType } from '../common/enums';
import type { Cartographic } from './engine';

/** 生成质量档（对应策略 A/B） */
export type AiSceneQuality = 'L1' | 'L2';

/**
 * 生成策略（详细设计 §16 分级）
 * - procedural：程序化生成（L1，永远可用）
 * - assetKit：预置资产库拼装（L2，尚未实现）
 * - text3d / gaussianSplat / amapEarth：L3 第三方服务适配位，未配置时自动降级 procedural
 * - auto：按可用性自动选择
 */
export type AiSceneStrategy =
  'procedural' | 'assetKit' | 'text3d' | 'gaussianSplat' | 'amapEarth' | 'auto';

/** POST /api/v1/ai/scene/generate 请求体 */
export interface GenerateSceneRequest {
  /** 自然语言描述，必填，≤2000 字 */
  prompt: string;
  /** 场景名，缺省取 DSL.meta.title */
  name?: string;
  /** 场景类型，默认 HYBRID */
  sceneType?: SceneType;
  /** 锚点（微观场景在宏观地图上的落点），缺省由规划器推断 */
  anchor?: Cartographic;
  /** 质量档，默认 L1 */
  quality?: AiSceneQuality;
  /** 生成策略，默认 auto（L1 固定走 procedural） */
  strategy?: AiSceneGeneratorStrategy;
  /** 只返回 DSL 与统计，不落库（调试/预览用） */
  dryRun?: boolean;
  /**
   * 生成后是否立即发布为演示大屏（一键闭环）。
   * 为 true 时落库后自动执行发布，结果回带 publishToken / screenUrl；
   * 发布失败不阻断生成，只写入 warnings。
   */
  autoPublish?: boolean;
  /** 是否异步（长任务），L1 固定同步，忽略 true */
  async?: boolean;
  /** 幂等键，60s 内同键返回同一结果（L1 预留） */
  idempotencyKey?: string;
}

/** 生成策略别名（与 AiSceneStrategy 一致，便于前后端共用） */
export type AiSceneGeneratorStrategy = AiSceneStrategy;

/** 生成回执统计 */
export interface AiSceneStats {
  buildings: number;
  pois: number;
  triangles: number;
  bytes: number;
  elapsedMs: number;
}

/** 生成结果 */
export interface GenerateSceneResult {
  /** 已落库场景 id（dryRun 时为空） */
  sceneId: string;
  /** 回执（规划器产出/修正后的）DSL，结构见后端 SceneDsl */
  dsl: Record<string, unknown>;
  /** 任务 id（L1 同步也返回，供后续查询/审计） */
  taskId: string;
  stats: AiSceneStats;
  /** 软约束告警（不阻断） */
  warnings: string[];
  /** 生成的 GLB 静态地址 /static/...（dryRun 时为空） */
  modelUrl?: string;
  /** 已发布的公开演示令牌（autoPublish 成功时才有；重新发布后令牌保持不变） */
  publishToken?: string;
  /** 公开演示大屏地址（前端 /screen/:token；配置了 PUBLIC_SCREEN_BASE_URL 时带域名前缀） */
  screenUrl?: string;
}

/** 异步任务阶段 */
export type AiSceneStage = 'PARSING' | 'GENERATING' | 'PERSISTING' | 'DONE' | 'FAILED';

/** GET /api/v1/ai/scene/tasks/:taskId 返回 */
export interface AiSceneTaskItem {
  taskId: string;
  stage: AiSceneStage;
  /** 0-100 */
  progress: number;
  error?: string;
  result?: GenerateSceneResult;
}
