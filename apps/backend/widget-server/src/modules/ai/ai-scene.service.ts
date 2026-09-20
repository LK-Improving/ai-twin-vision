import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BizCode,
  DEFAULT_ENGINE_CONFIG,
  type AiSceneStats,
  type AiSceneTaskItem,
  type EngineConfig,
  type GenerateSceneResult,
} from '@dt/shared-types';
import { BizException } from '../../common/exceptions/biz.exception';
import type { RequestUser } from '../../common/decorators/current-user.decorator';
import { SceneService } from '../scene/scene.service';
import { FileService } from '../file/file.service';
import { RulePlanner } from './planner/rule.planner';
import { validateSceneDsl } from './dsl/validate';
import { resolveGenerator } from './gen/generator-registry';
import type { GenerateOutput } from './gen/geometry-generator';
import { dslToComponents } from './dsl/dsl-to-components';
import { dslToLayout } from './dsl/dsl-to-layout';
import type { GenerateSceneDto } from './dto/ai-scene.dto';
import type { SceneDsl } from './dsl/types';

/**
 * 对话式生成编排服务（详细设计 §13）。
 * 同步链路：prompt → 规划器(规则降级) → 校验 → 程序化生成 GLB → 上传静态资源
 *           → DSL→组件/面板 → 落库场景 → 返回结果。
 * L1 固定同步；异步任务表（biz_ai_scene_task）在 L2 接入，此处用内存任务做查询兜底。
 */
@Injectable()
export class AiSceneService {
  private readonly logger = new Logger(AiSceneService.name);
  private readonly tasks = new Map<string, AiSceneTaskItem>();

  constructor(
    private readonly sceneService: SceneService,
    private readonly fileService: FileService,
  ) {}

  async generate(user: RequestUser, dto: GenerateSceneDto): Promise<GenerateSceneResult> {
    const t0 = Date.now();

    const prompt = (dto.prompt ?? '').trim();
    if (prompt.length === 0) throw new BizException(BizCode.AI_PROMPT_INVALID, '生成描述不能为空');
    if (prompt.length > 2000)
      throw new BizException(BizCode.AI_PROMPT_INVALID, '生成描述超过 2000 字');

    // 1) 规划器：prompt → DSL（L1 走规则降级，不依赖 LLM）
    const planner = new RulePlanner();
    const dsl: SceneDsl = planner.parse(prompt, { anchor: dto.anchor });

    // 2) 校验
    const v = validateSceneDsl(dsl);
    if (!v.ok) {
      throw new BizException(
        BizCode.AI_DSL_INVALID,
        v.errors[0] ?? '场景描述解析结果不合法',
        v.errors,
      );
    }

    // 3) 生成 GLB：按策略选生成器（详细设计 §17 可插拔），第三方未配置时自动降级
    let out: GenerateOutput;
    let fallbackNote: string | undefined;
    try {
      const resolved = resolveGenerator(dto.strategy);
      fallbackNote = resolved.fallbackNote;
      this.logger.log(`使用生成器 strategy=${resolved.generator.strategy}`);
      out = await resolved.generator.generate({ dsl, quality: dto.quality ?? 'L1' });
    } catch (err) {
      // 保留第三方（Tripo）返回的真实原因（余额不足 / 内容策略 / 模型名等），
      // 否则调用方只会看到笼统的「三维场景生成失败」，无法定位。
      const reason = err instanceof Error ? err.message : '未知错误';
      this.logger.error(`三维生成失败: ${reason}`);
      throw new BizException(BizCode.AI_GENERATE_FAILED, `三维场景生成失败：${reason}`);
    }

    const taskId = randomUUID();
    const warnings = v.warnings;
    if (fallbackNote) warnings.push(fallbackNote);

    // dryRun：只回执 DSL 与统计，不落库
    if (dto.dryRun) {
      const stats: AiSceneStats = {
        buildings: out.stats.buildings,
        pois: dsl.pois.length,
        triangles: out.stats.triangles,
        bytes: out.stats.bytes,
        elapsedMs: Date.now() - t0,
      };
      const result: GenerateSceneResult = {
        sceneId: '',
        dsl: dsl as unknown as Record<string, unknown>,
        taskId,
        stats,
        warnings,
      };
      this.tasks.set(taskId, { taskId, stage: 'DONE', progress: 100, result });
      return result;
    }

    // 4) 上传 GLB 到静态资源（复用 FileService，秒传命中则直接返回）
    const fileItem = await this.fileService.upload(user.tenantId, user.userId, {
      originalname: 'ai-city.glb',
      size: out.glb.length,
      buffer: out.glb,
      mimetype: 'model/gltf-binary',
    });
    const modelUrl = fileItem.url;

    // 5) DSL → 组件实例 + 大屏面板
    const components = dslToComponents(dsl, { modelUrl, anchor: dsl.site.anchor });
    const layoutNodes = dslToLayout(dsl);
    const config = buildEngineConfig(dsl);

    // 6) 落库：先建场景，再写入组件与画布
    const name = (dto.name ?? '').trim() || dsl.meta.title;
    const created = await this.sceneService.create(user.tenantId, user.userId, {
      name,
      description: dsl.meta.summary,
      sceneType: (dto.sceneType as any) ?? 'HYBRID',
      config,
    });
    await this.sceneService.update(user.tenantId, user.userId, created.id, {
      name,
      components,
      layout: { version: '1.0.0', nodes: layoutNodes, events: [], variables: [] },
    });

    // 7) 一键发布为演示大屏（可选）：拿到公开令牌即可免登录分享 /screen/:token
    let publishToken: string | undefined;
    let screenUrl: string | undefined;
    if (dto.autoPublish) {
      try {
        const published = await this.sceneService.publish(
          user.tenantId,
          user.userId,
          created.id,
          'AI 对话生成自动发布',
        );
        if (published.publishToken) {
          publishToken = published.publishToken;
          screenUrl = buildScreenUrl(published.publishToken);
        }
      } catch (err) {
        // 发布失败不阻断生成：场景已落库，可稍后在编辑器里手动发布
        const msg = err instanceof Error ? err.message : '未知错误';
        warnings.push(`自动发布为演示大屏失败：${msg}（场景已生成，可在编辑器中手动发布）`);
        this.logger.warn(`AI 场景自动发布失败 sceneId=${created.id}: ${msg}`);
      }
    }

    const stats: AiSceneStats = {
      buildings: out.stats.buildings,
      pois: dsl.pois.length,
      triangles: out.stats.triangles,
      bytes: out.stats.bytes,
      elapsedMs: Date.now() - t0,
    };
    const result: GenerateSceneResult = {
      sceneId: created.id,
      dsl: dsl as unknown as Record<string, unknown>,
      taskId,
      stats,
      warnings,
      modelUrl,
      publishToken,
      screenUrl,
    };
    this.tasks.set(taskId, { taskId, stage: 'DONE', progress: 100, result });
    this.logger.log(
      `场景生成成功 sceneId=${created.id} buildings=${stats.buildings} pois=${stats.pois}` +
        (publishToken ? ` 已发布为演示大屏 ${screenUrl}` : ''),
    );
    return result;
  }

  /** 查询生成任务（L1 同步任务直接返回 DONE） */
  getTask(taskId: string): AiSceneTaskItem {
    const task = this.tasks.get(taskId);
    if (!task) throw new BizException(BizCode.AI_TASK_NOT_FOUND);
    return task;
  }
}

/**
 * 公开演示大屏地址：配置了 PUBLIC_SCREEN_BASE_URL 就拼绝对地址（便于 curl/分享），
 * 未配置时回退到相对路径 /screen/:token（浏览器里自动用当前站点域名）。
 */
function buildScreenUrl(token: string): string {
  const base = (process.env.PUBLIC_SCREEN_BASE_URL ?? '').replace(/\/+$/, '');
  return `${base}/screen/${token}`;
}

/**
 * 构造引擎配置：复用默认配置，套用园区锚点与深色底图（白模城市在暗底上呈「数智指挥大厅」科技感）。
 * initialView 的纬度按相机俯角南移，抵消 pitch 导致的视野中心北偏，使模型落在画面中央。
 */
function buildEngineConfig(dsl: SceneDsl): EngineConfig {
  const config: EngineConfig = structuredClone(DEFAULT_ENGINE_CONFIG);
  const anchor = dsl.site.anchor;
  config.threejs.anchor = { ...anchor };

  const extent = dsl.site.extent ?? { width: 900, depth: 900 };
  const height = Math.min(3500, Math.max(700, Math.max(extent.width, extent.depth) * 1.4));
  const pitch = -52;
  const latShift = height / Math.tan((Math.abs(pitch) * Math.PI) / 180) / 110574;

  config.cesium.imageryLayers = [
    {
      id: 'base-imagery',
      name: '深色底图',
      provider: 'XYZ',
      url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      show: true,
      alpha: 1,
      maximumLevel: 19,
    },
  ];
  config.cesium.initialView = {
    longitude: anchor.longitude,
    latitude: anchor.latitude - latShift,
    height,
    heading: 0,
    pitch,
    roll: 0,
  };
  config.cesium.scene = {
    globeShow: true,
    skyAtmosphere: false,
    fxaa: true,
    depthTestAgainstTerrain: false,
    maximumScreenSpaceError: 16,
  };

  const w = dsl.meta.weather ?? 'clear';
  config.cesium.environment = {
    rain: w === 'rain' ? 0.6 : 0,
    snow: w === 'snow' ? 0.6 : 0,
    fog: w === 'fog' ? 0.45 : 0.12,
    enableLighting: dsl.meta.timeOfDay === 'night',
  };

  config.threejs.environment = {
    background: '#04080f',
    ambientIntensity: 1.1,
    directionalIntensity: 1.6,
    directionalPosition: { x: 200, y: 400, z: 160 },
  };
  config.threejs.postProcessing = { bloom: true, outline: true, ssao: false };

  config.canvas = { width: 1920, height: 1080, fitMode: 'CONTAIN', background: 'transparent' };
  return config;
}
