/**
 * 脚本沙箱宿主门面：编辑器与运行时共用的唯一执行入口。
 *
 * 职责：
 * - 提交前静态守卫（guard.ts）→ 拒绝明显的越权脚本；
 * - 数据转换/条件表达式走「共享 Worker」（高频、短任务，复用线程降低开销）；
 * - 事件脚本走「独占 Worker」（低频但内容不可控，跑飞或被超时终止时只伤自己），
 *   避免一个死循环脚本连带中断同期其它脚本；
 * - 路由沙箱回传的 ctx 能力调用，交由白名单分发器执行。
 *
 * fail-closed 原则：环境不支持 Worker 时拒绝执行并报错，绝不静默回退到主线程直跑。
 */
import SandboxWorker from './sandbox.worker?worker';
import { formatGuardIssues, scanScript } from './guard';
import { dispatchCapability, jsonSafe, type CapabilityHost } from './capabilities';
import {
  SANDBOX_TIMEOUT,
  type CapabilityCallRequest,
  type SandboxExecuteResponse,
  type SandboxKind,
} from './protocol';

/** 沙箱执行结果 */
export interface SandboxOutcome<T = unknown> {
  ok: boolean;
  value?: T;
  error?: string;
  /** 脚本内 console / ctx.log 的转发内容 */
  logs: string[];
}

interface RunOptions {
  /** 注入脚本的 data 入参 */
  data?: unknown;
  /** 注入脚本的变量快照（ctx.variables 初值） */
  variables?: Record<string, unknown>;
  /** 覆盖默认超时（毫秒） */
  timeoutMs?: number;
  /** 能力宿主（仅 script 类型需要） */
  host?: CapabilityHost;
}

interface Pending {
  resolve: (res: SandboxExecuteResponse) => void;
  timer: ReturnType<typeof setTimeout>;
  worker: Worker;
  /** 独占线程：结束时自行回收，不影响其它脚本 */
  dedicated: boolean;
  /** 本次执行的超时上限，用于可诊断的错误文案 */
  timeoutMs: number;
}

export class ScriptSandbox {
  private shared: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  /** execId → 能力宿主：并发脚本各自持有，避免调用串台 */
  private hosts = new Map<number, CapabilityHost>();

  /** 数据转换脚本：入参 data，返回值即最终数据 */
  runTransform(
    script: string,
    data: unknown,
    timeoutMs = SANDBOX_TIMEOUT.transform,
  ): Promise<SandboxOutcome> {
    return this.run('transform', script, { data, timeoutMs });
  }

  /** 条件表达式求值：以 data / ctx.variables 为可用上下文 */
  evalExpression(
    expression: string,
    data: unknown,
    variables?: Record<string, unknown>,
    timeoutMs = SANDBOX_TIMEOUT.expression,
  ): Promise<SandboxOutcome<unknown>> {
    return this.run('expression', expression, { data, variables, timeoutMs });
  }

  /** 事件脚本（RUN_SCRIPT）：独占线程，通过 host 暴露受限能力 */
  runScript(
    script: string,
    host: CapabilityHost,
    variables?: Record<string, unknown>,
  ): Promise<SandboxOutcome> {
    return this.run('script', script, { variables, host, timeoutMs: SANDBOX_TIMEOUT.script });
  }

  /** 释放全部线程；页面卸载时必须调用，避免沙箱跨场景存活 */
  dispose(): void {
    this.pending.forEach((p) => {
      clearTimeout(p.timer);
      p.worker.terminate();
      p.resolve({ id: 0, ok: false, error: '沙箱已释放', logs: [] });
    });
    this.pending.clear();
    this.hosts.clear();
    this.shared?.terminate();
    this.shared = null;
  }

  private async run(kind: SandboxKind, code: string, opts: RunOptions): Promise<SandboxOutcome> {
    if (!code || !code.trim()) return { ok: true, value: undefined, logs: [] };

    // 第一层：静态守卫
    const issues = scanScript(code);
    if (issues.length > 0) {
      return { ok: false, error: `脚本被安全守卫拒绝：${formatGuardIssues(issues)}`, logs: [] };
    }

    if (kind === 'script' && !opts.host) {
      return { ok: false, error: '事件脚本缺少能力宿主', logs: [] };
    }

    const dedicated = kind === 'script';
    let worker: Worker;
    try {
      worker = dedicated ? this.createWorker() : this.ensureSharedWorker();
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), logs: [] };
    }

    // 入参先 JSON 化：既切断宿主引用，也避免 postMessage 抛 DataCloneError
    let data: unknown;
    let variables: Record<string, unknown> | undefined;
    try {
      data = jsonSafe(opts.data);
      variables = jsonSafe(opts.variables) as Record<string, unknown> | undefined;
    } catch (err) {
      this.reclaim(worker, dedicated);
      return {
        ok: false,
        error: `注入数据无法序列化：${err instanceof Error ? err.message : String(err)}`,
        logs: [],
      };
    }

    const id = ++this.seq;
    if (opts.host) this.hosts.set(id, opts.host);

    return new Promise<SandboxOutcome>((resolve) => {
      const timeoutMs = opts.timeoutMs ?? SANDBOX_TIMEOUT.script;
      const timer = setTimeout(() => this.onTimeout(id), timeoutMs);
      this.pending.set(id, {
        worker,
        dedicated,
        timeoutMs,
        timer,
        resolve: (res) => {
          clearTimeout(timer);
          this.reclaim(worker, dedicated);
          resolve(this.toOutcome(res, id));
        },
      });

      try {
        worker.postMessage({ type: 'execute', id, kind, code, data, variables });
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        this.hosts.delete(id);
        this.reclaim(worker, dedicated);
        resolve({ ok: false, error: err instanceof Error ? err.message : String(err), logs: [] });
      }
    });
  }

  /** 超时：死循环只能靠终止线程硬止损 */
  private onTimeout(id: number): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);

    const message = '脚本执行超时，沙箱线程已终止';
    if (entry.dedicated) {
      // 独占线程：只影响这一个脚本
      entry.worker.terminate();
      this.hosts.delete(id);
      entry.resolve({ id, ok: false, error: `${message}（上限 ${entry.timeoutMs}ms）`, logs: [] });
      return;
    }

    // 共享线程状态已不可信：连同该线程上的其它请求一并中断并重建
    this.shared?.terminate();
    this.shared = null;
    const victims = [...this.pending.entries()].filter(([, p]) => !p.dedicated);
    this.pending.delete(id);
    entry.worker.terminate();
    this.hosts.delete(id);
    entry.resolve({ id, ok: false, error: message, logs: [] });
    victims.forEach(([vid, p]) => {
      if (vid === id) return;
      this.pending.delete(vid);
      this.hosts.delete(vid);
      clearTimeout(p.timer);
      p.resolve({
        id: vid,
        ok: false,
        error: `${message}（上限 ${p.timeoutMs}ms，同期共享线程请求被连带中断）`,
        logs: [],
      });
    });
  }

  /** 回收线程：独占线程用完即弃，共享线程保留复用 */
  private reclaim(worker: Worker, dedicated: boolean): void {
    if (!dedicated) return;
    worker.terminate();
  }

  private toOutcome(res: SandboxExecuteResponse, id: number): SandboxOutcome {
    this.hosts.delete(id);
    const outcome: SandboxOutcome = { ok: res.ok, logs: res.logs ?? [] };
    if (res.ok) outcome.value = res.value;
    else outcome.error = res.error ?? '沙箱执行失败';
    return outcome;
  }

  private ensureSharedWorker(): Worker {
    if (!this.shared) this.shared = this.createWorker();
    return this.shared;
  }

  private createWorker(): Worker {
    if (typeof Worker === 'undefined') {
      throw new Error('当前环境不支持 Web Worker，脚本沙箱已拒绝执行');
    }
    const worker = new SandboxWorker();
    worker.onmessage = (event: MessageEvent) => void this.onMessage(event, worker);
    worker.onerror = (event: ErrorEvent) => this.onFatal(worker, event.message);
    return worker;
  }

  /** Worker 内未捕获异常或加载失败：该线程状态不可信，中断挂在其上的请求 */
  private onFatal(worker: Worker, message: string): void {
    const isShared = this.shared === worker;
    const victims = [...this.pending.entries()].filter(([, p]) => p.worker === worker);
    victims.forEach(([vid, p]) => {
      this.pending.delete(vid);
      this.hosts.delete(vid);
      clearTimeout(p.timer);
      p.resolve({ id: vid, ok: false, error: `沙箱异常终止：${message}`, logs: [] });
    });
    worker.terminate();
    if (isShared) this.shared = null;
  }

  private async onMessage(event: MessageEvent, worker: Worker): Promise<void> {
    const msg = event.data as {
      type?: string;
      req?: CapabilityCallRequest;
      res?: SandboxExecuteResponse;
    };
    if (!msg?.type) return;

    if (msg.type === 'result' && msg.res) {
      const waiting = this.pending.get(msg.res.id);
      this.pending.delete(msg.res.id);
      waiting?.resolve(msg.res);
      return;
    }

    if (msg.type === 'capability' && msg.req) {
      const req = msg.req;
      const host = this.hosts.get(req.execId);
      const res: { id: number; ok: boolean; value?: unknown; error?: string } = {
        id: req.id,
        ok: false,
        error: '沙箱会话已失效',
      };
      if (host) {
        try {
          res.ok = true;
          res.value = await dispatchCapability(host, req.call, req.args ?? []);
        } catch (err) {
          res.ok = false;
          res.error = err instanceof Error ? err.message : String(err);
        }
      }
      // fire-and-forget 调用（id 为 0）无需回信；且线程可能已在此期间被回收
      if (req.id !== 0 && this.workerAlive(worker)) {
        worker.postMessage({ type: 'capability-result', res });
      }
    }
  }

  /** 已 terminate 的线程再 postMessage 会抛错，这里以是否仍被挂账来判断存活 */
  private workerAlive(worker: Worker): boolean {
    return [...this.pending.values()].some((p) => p.worker === worker) || this.shared === worker;
  }
}

let singleton: ScriptSandbox | null = null;

/** 全局沙箱单例：同一页面共享数据线程池，避免多组件各自起线程 */
export function getScriptSandbox(): ScriptSandbox {
  if (!singleton) singleton = new ScriptSandbox();
  return singleton;
}

/** 场景切换 / 页面卸载时释放，确保上一场景的脚本不会继续运行 */
export function resetScriptSandbox(): void {
  singleton?.dispose();
  singleton = null;
}
