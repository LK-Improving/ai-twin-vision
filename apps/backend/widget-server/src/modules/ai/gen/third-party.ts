import { BizCode } from '@dt/shared-types';
import { BizException } from '../../../common/exceptions/biz.exception';
import type { SceneDsl } from '../dsl/types';

/** 第三方生成服务的接入配置（详细设计 §16.3：通过配置接入，未配置即不启用） */
export interface ThirdPartyConfig {
  url: string;
  apiKey: string;
  model?: string;
  timeoutMs: number;
}

/**
 * 读取 `<PREFIX>_API_URL` / `<PREFIX>_API_KEY` / `<PREFIX>_MODEL` / `<PREFIX>_TIMEOUT_MS`。
 * URL 与 Key 缺任一即视为「未配置」（返回 null），由注册表降级到程序化生成。
 */
export function readThirdPartyConfig(prefix: string): ThirdPartyConfig | null {
  const url = (process.env[`${prefix}_API_URL`] ?? '').trim();
  const apiKey = (process.env[`${prefix}_API_KEY`] ?? '').trim();
  if (!url || !apiKey) return null;
  const model = (process.env[`${prefix}_MODEL`] ?? '').trim() || undefined;
  const timeoutMs = Number(process.env[`${prefix}_TIMEOUT_MS`] ?? 60_000) || 60_000;
  return { url, apiKey, model, timeoutMs };
}

/** 本方案与第三方服务约定的最小请求契约（不同服务可在鉴权/字段上再适配） */
export interface ThirdPartyRequest {
  prompt: string;
  /** 引擎当前仅支持 glTF 渲染，统一要 glb（3DGS 的 .splat 本阶段不可用，见 §17） */
  format: 'glb';
  quality: 'L1' | 'L2';
  model?: string;
  meta: Record<string, unknown>;
}

/**
 * 调用第三方生成服务拿回模型二进制。
 * 兼容两种响应形态：
 *   1) 直接返回二进制（model/gltf-binary 或 octet-stream）；
 *   2) 返回 JSON `{ modelUrl | url | base64 }`，再下载 / 解码。
 */
export async function requestThirdPartyModel(
  cfg: ThirdPartyConfig,
  body: ThirdPartyRequest,
): Promise<Buffer> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new BizException(BizCode.AI_GENERATE_FAILED, `第三方生成服务返回 ${res.status}`);
    }

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (contentType.includes('application/json')) {
      const json = (await res.json()) as { modelUrl?: string; url?: string; base64?: string };
      if (json.base64) return Buffer.from(json.base64, 'base64');
      const remote = json.modelUrl ?? json.url;
      if (!remote) {
        throw new BizException(BizCode.AI_GENERATE_FAILED, '第三方生成服务未返回模型地址');
      }
      const file = await fetch(remote, { signal: ctrl.signal });
      if (!file.ok) {
        throw new BizException(BizCode.AI_GENERATE_FAILED, `模型下载失败 ${file.status}`);
      }
      return Buffer.from(await file.arrayBuffer());
    }

    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (err instanceof BizException) throw err;
    const msg = err instanceof Error ? err.message : '未知错误';
    throw new BizException(BizCode.AI_GENERATE_FAILED, `调用第三方生成服务失败：${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

/** 带超时的 fetch，供同步与异步（Tripo 轮询）复用 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface TripoSubmitOptions {
  prompt: string;
  model?: string;
  texture?: boolean;
  pbr?: boolean;
  textureQuality?: 'standard' | 'detailed' | 'extreme';
  faceLimit?: number;
}

/**
 * 调用 Tripo V3 文生 3D（异步任务模式）：
 *   1) POST /v3/generation/text-to-model → { code:0, data:{ task_id } }
 *   2) GET  /v3/tasks/{task_id}          → { code:0, data:{ status, output:{ model } } }
 *   轮询到 success 后下载 output.model（GLB 二进制）返回。
 * 统一响应信封：code===0 成功，非 0 走 message 报错（见 developers.tripo3d.com 文档）。
 */
export async function requestTripoModel(
  cfg: ThirdPartyConfig,
  opts: TripoSubmitOptions,
): Promise<Buffer> {
  const submitRes = await fetchWithTimeout(
    cfg.url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        prompt: opts.prompt,
        model: opts.model,
        texture: opts.texture ?? true,
        pbr: opts.pbr ?? true,
        texture_quality: opts.textureQuality ?? 'standard',
        ...(opts.faceLimit ? { face_limit: opts.faceLimit } : {}),
      }),
    },
    cfg.timeoutMs,
  );
  const submitJson = (await submitRes.json().catch(() => ({}))) as {
    code?: number;
    message?: string;
    data?: { task_id?: string };
  };
  if (!submitRes.ok || submitJson.code !== 0 || !submitJson.data?.task_id) {
    const raw = submitJson.message ?? `${submitRes.status}`;
    // 额度不足（code 2010）是最常见的接入期阻塞，给出中文引导，避免只看到英文
    const hint = /credit/i.test(raw) ? '（Tripo 账户余额不足，请到控制台充值后重试）' : '';
    throw new BizException(BizCode.AI_GENERATE_FAILED, `Tripo 创建任务失败：${raw}${hint}`);
  }

  const taskId = submitJson.data.task_id;
  // 由配置的生成端点推导轮询基址：.../v3/generation/text-to-model → .../v3/tasks
  const tasksBase = cfg.url.replace(/\/generation\/[^/]+$/, '/tasks');

  const deadline = Date.now() + cfg.timeoutMs;
  let last: { status?: string; output?: { model?: string; base_model?: string } } = {};
  while (Date.now() < deadline) {
    await sleep(3000);
    const pollRes = await fetchWithTimeout(
      `${tasksBase}/${taskId}`,
      { headers: { Authorization: `Bearer ${cfg.apiKey}` } },
      cfg.timeoutMs,
    );
    const pollJson = (await pollRes.json().catch(() => ({}))) as {
      code?: number;
      message?: string;
      data?: { status?: string; output?: { model?: string; base_model?: string } };
    };
    if (!pollRes.ok || pollJson.code !== 0) {
      throw new BizException(
        BizCode.AI_GENERATE_FAILED,
        `Tripo 轮询任务失败：${pollJson.message ?? pollRes.status}`,
      );
    }
    last = pollJson.data ?? {};
    if (last.status === 'success') break;
    if (last.status === 'failed' || last.status === 'cancelled') {
      throw new BizException(BizCode.AI_GENERATE_FAILED, `Tripo 任务${last.status}`);
    }
  }
  if (last.status !== 'success' || !last.output) {
    throw new BizException(BizCode.AI_GENERATE_FAILED, 'Tripo 任务在超时时间内未完成');
  }
  const modelUrl = last.output.model ?? last.output.base_model;
  if (!modelUrl) throw new BizException(BizCode.AI_GENERATE_FAILED, 'Tripo 未返回模型地址');

  const fileRes = await fetchWithTimeout(modelUrl, {}, cfg.timeoutMs);
  if (!fileRes.ok)
    throw new BizException(BizCode.AI_GENERATE_FAILED, `Tripo 模型下载失败 ${fileRes.status}`);
  return Buffer.from(await fileRes.arrayBuffer());
}

/** 建筑业态枚举 → 中文名（用于拼给文生 3D 的中文 prompt） */
const KIND_CN: Record<string, string> = {
  commercial: '商业楼',
  residential: '住宅楼',
  office: '办公楼',
  school: '学校',
  hospital: '医院',
  metro: '交通枢纽',
  industrial: '厂房',
};

/** 建筑业态枚举 → 英文名（用于内容策略被拒时的英文安全兜底 prompt） */
const KIND_EN: Record<string, string> = {
  commercial: 'commercial buildings',
  residential: 'residential apartments',
  office: 'office towers',
  school: 'a school building',
  hospital: 'a hospital',
  metro: 'a transport hub',
  industrial: 'a factory',
};

/** Tripo 内容策略被拒时，用这一段英文关键词识别（大小写不敏感） */
export const TRIPO_CONTENT_POLICY_HINT = 'content policy';

/**
 * 由 DSL 拼一段给第三方服务的自然语言描述（中文）。
 * 注意：只描述「可三维化的实体场景」，避免「数字孪生场景」这类元概念词，
 * 后者可能触发 Tripo 内容安全策略（实测出现过 violation of content policy）。
 */
export function buildPrompt(dsl: SceneDsl): string {
  const meta = dsl.meta ?? ({} as SceneDsl['meta']);
  const kinds = Array.from(new Set((dsl.buildings ?? []).map((b) => b.kind)))
    .map((k) => KIND_CN[k] ?? k)
    .join('、');
  const time = meta.timeOfDay === 'night' ? '夜晚灯光' : '白天';
  const weather = meta.weather && meta.weather !== 'clear' ? `，天气${meta.weather}` : '';
  return `一个${meta.style ?? '现代'}的园区三维模型，包含${kinds || '多种'}建筑，共${(dsl.buildings ?? []).length}栋，${time}${weather}`;
}

/**
 * 英文安全兜底 prompt：内容策略被拒时自动重试用。
 * 用纯英文、只描述具体实体（楼/塔/枢纽），不含任何元概念词，通过率更高。
 */
export function buildSafePrompt(dsl: SceneDsl): string {
  const kinds = Array.from(new Set((dsl.buildings ?? []).map((b) => b.kind)))
    .map((k) => KIND_EN[k] ?? 'buildings')
    .join(', ');
  const time = dsl.meta?.timeOfDay === 'night' ? 'with night lighting' : 'in daytime';
  return `a low-poly modern tech park 3d model, including ${kinds || 'various buildings'}, ${time}`;
}
