/**
 * 脚本沙箱 Worker：用户脚本的唯一执行环境。
 *
 * 隔离手段（三层，任一层都不被假设为充分）：
 * 1. realm 隔离：脚本运行在独立 Worker realm，天生没有 document / DOM / localStorage，
 *    无法向宿主页面注入脚本或劫持 UI；
 * 2. 全局遮蔽：以 `with(proxy)` + `has: () => true` 拦截所有自由标识符解析，
 *    未列入白名单的全局名（含 self / fetch / globalThis）一律求值为 undefined；
 * 3. 能力白名单：脚本对宿主的一切影响只能经 ctx 的授权调用，且跨边界值全部 JSON 化，
 *    杜绝「拿到宿主对象再顺着原型链逃逸」。
 *
 * 残余风险（已知并已记录到迭代清单）：worker realm 内仍可通过字符串拼接等手法绕过
 * 静态守卫摸到 Worker 自身的 fetch，理论上是数据外发面；收口需要 CSP connect-src
 * 或 SES lockdown，属迭代 0 后续项。
 */
import {
  CAPABILITY_ALLOWLIST,
  type CapabilityCallRequest,
  type SandboxExecuteRequest,
  type SandboxExecuteResponse,
} from './protocol';

/**
 * Worker 全局作最小接口声明：tsconfig 的 lib 不含 WebWorker，
 * 且沙箱层只需要 postMessage / onmessage 两个入口，避免引入完整作用域类型。
 */
interface WorkerScope {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

const workerScope = self as unknown as WorkerScope;
const allowlist = new Set<string>(CAPABILITY_ALLOWLIST);

/** 单次能力调用的等待上限（毫秒）：宿主异常时避免脚本永久挂起 */
const CALL_TIMEOUT_MS = 5000;

/** 白名单放行、且属于宿主 realm 的全局名：这些直接透传（值由 worker realm 自建，无宿主引用） */
function buildIntrinsics(): Record<string, unknown> {
  return {
    JSON,
    Math,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Symbol,
    Error,
    TypeError,
    RangeError,
    isNaN,
    isFinite,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    Infinity,
    NaN,
    undefined,
    // 允许 await：脚本体包在 async 函数中执行
    sleep: (ms: number) => new Promise((r) => setTimeout(r, Math.min(Number(ms) || 0, 1000))),
  };
}

/** 结构化安全化：仅保留可 JSON 化的数据，函数/符号/循环引用直接判错 */
function toSafeJson(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError('沙箱只允许传递纯数据（不支持函数与 symbol）');
  }
  return JSON.parse(JSON.stringify(value));
}

/** 待响应的能力调用 */
const pendingCalls = new Map<
  number,
  {
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
let callSeq = 0;

/** 沙箱 → 宿主：发起一次能力调用并等待结果 */
function callCapability(execId: number, call: string, args: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let payload: unknown[];
    try {
      payload = toSafeJson(args) as unknown[];
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    const id = ++callSeq;
    const timer = setTimeout(() => {
      pendingCalls.delete(id);
      reject(new Error(`能力调用超时：${call}`));
    }, CALL_TIMEOUT_MS);
    pendingCalls.set(id, { resolve, reject, timer });
    const req: CapabilityCallRequest = { id, execId, call, args: payload };
    workerScope.postMessage({ type: 'capability', req });
  });
}

/** 沙箱 → 宿主：不等待结果的调用（变量写回、日志转发） */
function fireAndForget(execId: number, call: string, args: unknown[]): void {
  try {
    const req: CapabilityCallRequest = { id: 0, execId, call, args: toSafeJson(args) as unknown[] };
    workerScope.postMessage({ type: 'capability', req });
  } catch {
    /* 日志/写回序列化失败不影响主流程 */
  }
}

/** 构造脚本可见的 ctx：只暴露授权能力 */
function buildCtx(execId: number, variables: Record<string, unknown>): unknown {
  const variablesView = new Proxy(variables, {
    set(target, key, value) {
      target[key as string] = value;
      fireAndForget(execId, 'setVar', [key, value]);
      return true;
    },
  });

  const namespace = (head: string) =>
    new Proxy(
      {},
      {
        get:
          (_t, method) =>
          (...args: unknown[]) =>
            callCapability(execId, `${head}.${String(method)}`, args),
      },
    );

  return new Proxy(
    {},
    {
      get: (_t, prop) => {
        const name = String(prop);
        if (name === 'variables') return variablesView;
        // 防止 await ctx 把 ctx 误判为 thenable
        if (name === 'then') return undefined;
        if (allowlist.has(name)) return (...args: unknown[]) => callCapability(execId, name, args);
        return namespace(name);
      },
    },
  );
}

/**
 * 以 with + Proxy 拦截一切自由标识符：白名单外的名字（含 self/fetch/globalThis）
 * 解析结果为 undefined，脚本无法触达 Worker 自身的宿主能力。
 *
 * 注意：`with` 只能存在于非严格模式，而非严格模式下普通调用的顶层 `this` 会落到
 * Worker 全局对象（等于直接交出 fetch / importScripts）。因此把脚本体包成函数并
 * 以 null 原型对象作为 receiver 调用：`this` 既无 prototype 链，也摸不到全局。
 */
function compile(
  kind: SandboxExecuteRequest['kind'],
  code: string,
  scope: Record<string, unknown>,
): Promise<unknown> {
  // 脚本自带 "use strict" 会与 with 冲突，剥掉首行指令（沙箱本身不依赖严格模式指令）
  const body = code.replace(/^\s*(['"])use strict\1;?\s*/, '');
  const statement = kind === 'expression' ? `return (${body});` : body;
  const proxy = new Proxy(scope, { has: () => true });
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    '__scope',
    // 注：with 的 has 全拦截会连参数名一并接管，因而是裸标识符 __sandboxThis（由代理回源到 scope）
    `with (__scope) { return (async function () { ${statement} }).call(__sandboxThis); }`,
  ) as (s: object) => Promise<unknown>;
  return factory(proxy);
}

async function execute(req: SandboxExecuteRequest): Promise<SandboxExecuteResponse> {
  const logs: string[] = [];
  const variables = { ...(req.variables ?? {}) };
  const consoleForward = (...args: unknown[]) => {
    logs.push(args.map((a) => (typeof a === 'object' ? safeStringify(a) : String(a))).join(' '));
  };

  const scope: Record<string, unknown> = {
    ...buildIntrinsics(),
    data: req.data,
    // 转换脚本沿用 data 语义；事件脚本以 ctx 为唯一外部出口
    ctx: buildCtx(req.id, variables),
    console: {
      log: consoleForward,
      info: consoleForward,
      warn: consoleForward,
      error: consoleForward,
    },
    // 脚本顶层 this 的替身：null 原型，既无 prototype 链也非全局对象
    __sandboxThis: Object.create(null),
  };

  try {
    const value = await compile(req.kind, req.code, scope);
    let safeValue: unknown;
    try {
      safeValue = toSafeJson(value);
    } catch (err) {
      return {
        id: req.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        logs,
      };
    }
    const variablesPatch = Object.keys(variables).length > 0 ? toSafeJson(variables) : undefined;
    return {
      id: req.id,
      ok: true,
      value: safeValue,
      logs,
      variablesPatch: variablesPatch as Record<string, unknown> | undefined,
    };
  } catch (err) {
    return { id: req.id, ok: false, error: describeError(err), logs };
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return '[unserializable]';
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

workerScope.onmessage = (event: MessageEvent) => {
  const msg = event.data as { type?: string } & Record<string, unknown>;
  if (!msg) return;

  if (msg.type === 'execute') {
    const req = msg as unknown as SandboxExecuteRequest;
    void execute(req).then((res: SandboxExecuteResponse) =>
      workerScope.postMessage({ type: 'result', res }),
    );
    return;
  }

  if (msg.type === 'capability-result') {
    const res = msg.res as { id: number; ok: boolean; value?: unknown; error?: string };
    const waiting = pendingCalls.get(res.id);
    if (!waiting) return;
    pendingCalls.delete(res.id);
    clearTimeout(waiting.timer);
    if (res.ok) waiting.resolve(res.value);
    else waiting.reject(new Error(res.error ?? `能力调用失败：#${res.id}`));
    return;
  }

  if (msg.type === 'variables-sync') {
    // 预留：宿主在脚本执行期间推送变量增量（当前由脚本内 setVar 写回保证一致性）
    return;
  }
};

workerScope.postMessage({ type: 'ready' });
