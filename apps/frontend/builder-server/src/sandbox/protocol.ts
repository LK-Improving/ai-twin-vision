/**
 * 脚本沙箱通信协议（宿主 ↔ Worker 共用，无宿主对象引用泄漏）。
 *
 * 设计要点：
 * - 所有跨边界值必须是「结构化可克隆 + JSON 安全」的纯数据，宿主侧统一校验，
 *   确保脚本无法顺着返回值的原型链摸到宿主 realm（否则拿到 constructor 即可逃逸）。
 * - 沙箱侧只有两种出口：执行结果（SandboxExecuteResponse）与能力调用（CapabilityCall），
 *   能力调用受宿主白名单约束，未授权的调用名一律拒绝。
 */

/** 沙箱执行类型 */
export type SandboxKind =
  /** 数据转换脚本：入参 data，返回值作为最终数据 */
  | 'transform'
  /** 条件表达式：单表达式求值，结果用于动作放行判定 */
  | 'expression'
  /** 事件脚本（RUN_SCRIPT）：可通过 ctx 调用受限能力 */
  | 'script';

/** 宿主 → 沙箱：执行请求 */
export interface SandboxExecuteRequest {
  id: number;
  kind: SandboxKind;
  /** 待执行代码；expression 类型为单个表达式 */
  code: string;
  /** 注入的数据快照（transform / expression 的 data 入参） */
  data?: unknown;
  /** 注入的变量快照（脚本内 ctx.variables 的初值） */
  variables?: Record<string, unknown>;
}

/** 沙箱 → 宿主：执行结果 */
export interface SandboxExecuteResponse {
  id: number;
  ok: boolean;
  /** 返回值（仅 JSON 安全值） */
  value?: unknown;
  /** 错误摘要：name + message，不携带宿主对象引用 */
  error?: string;
  /** 脚本内 ctx.log / console.log 的转发内容 */
  logs?: string[];
  /** 变量写入回传（脚本对 ctx.variables 的赋值） */
  variablesPatch?: Record<string, unknown>;
}

/** 沙箱 → 宿主：能力调用请求 */
export interface CapabilityCallRequest {
  id: number;
  /** 发起本次调用的执行请求 id：多个脚本并发时据此路由到各自的宿主 */
  execId: number;
  /** 调用名，形如 viewer.flyTo / setVar / request */
  call: string;
  args: unknown[];
}

/** 宿主 → 沙箱：能力调用响应 */
export interface CapabilityCallResponse {
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
}

/** 宿主 → 沙箱：变量补发（脚本执行期间宿主变量被其他动作改动时同步） */
export interface SandboxVariablesSync {
  type: 'variables-sync';
  variables: Record<string, unknown>;
}

/** 沙箱心跳：报告自身就绪（首帧用于惰性预热判定） */
export interface SandboxReady {
  type: 'ready';
}

export type SandboxInbound = CapabilityCallResponse | SandboxVariablesSync;
export type SandboxOutbound = SandboxExecuteResponse | CapabilityCallRequest | SandboxReady;

/** 各类型默认超时（毫秒）：超时即 terminate Worker，硬止损死循环 */
export const SANDBOX_TIMEOUT = {
  transform: 500,
  expression: 200,
  script: 3000,
} as const;

/**
 * 能力白名单：沙箱可请求的全部调用名。
 * 新增能力必须同时在这里登记并在 capabilities.ts 实现，否则运行期拒绝。
 */
export const CAPABILITY_ALLOWLIST = [
  'viewer.flyTo',
  'viewer.flyToEntity',
  'viewer.getCameraView',
  'viewer.highlight',
  'viewer.clearHighlight',
  'viewer.setEntityVisible',
  'viewer.stats',
  'nodes.get',
  'nodes.list',
  'nodes.setVisible',
  'nodes.toggle',
  'component.call',
  'panel.open',
  'getVar',
  'setVar',
  'request',
  'openUrl',
  'log',
] as const;

export type CapabilityName = (typeof CAPABILITY_ALLOWLIST)[number];
