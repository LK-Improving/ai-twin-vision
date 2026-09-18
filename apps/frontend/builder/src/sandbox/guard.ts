/**
 * 沙箱脚本静态守卫：提交执行前的第一道纵深防御。
 *
 * 定位说明（务必如实理解，不要当成完备边界）：
 * - 运行期隔离由 Worker realm + 全局遮蔽（见 sandbox.worker.ts）保证，
 *   本守卫的作用是「提前拦住绝大多数误用与越权尝试」并给出可读的编辑器提示；
 * - 字符串拼接等极端绕过手段无法靠正则穷尽，因此运行期仍保留全局遮蔽与能力白名单，
 *   纵深防御三层叠加，任何单层都不被假设为充分。
 */

/** 需要拦截的标识符 / 模式及其理由 */
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\b(?:window|document|globalThis|self|top|parent|frames|navigator|location)\b/,
    reason: '沙箱内不存在宿主 DOM/环境对象',
  },
  {
    pattern: /\b(?:localStorage|sessionStorage|indexedDB|caches|cookie)\b/,
    reason: '禁止访问本地存储与 Cookie',
  },
  {
    pattern:
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon|RTCPeerConnection)\b/,
    reason: '沙箱内禁止直连网络，请改用 ctx.request',
  },
  {
    pattern: /\b(?:eval|Function|constructor|__proto__|prototype|new\s+Function)\b/,
    reason: '禁止动态代码构造与原型链访问（沙箱逃逸路径）',
  },
  {
    pattern: /\b(?:require|import\s*\(|module\.exports|process)\b/,
    reason: '沙箱内无模块系统与进程对象',
  },
  {
    pattern:
      /\b(?:Worker|SharedWorker|ServiceWorker|Atomics|WebAssembly|MessageChannel|BroadcastChannel)\b/,
    reason: '禁止创建次级执行上下文',
  },
  { pattern: /\b(?:postMessage|onmessage|self)\b/, reason: '禁止直接与宿主通道通信' },
];

/**
 * 剥离注释与字符串字面量，避免把示例文本、日志文案里的 `window` 误判为越权。
 * 实现为单次线性扫描，不依赖正则lookbehind（兼容性考虑）。
 */
export function stripLiterals(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    const next = code[i + 1];
    // 行注释
    if (ch === '/' && next === '/') {
      while (i < n && code[i] !== '\n') i++;
      out += ' ';
      continue;
    }
    // 块注释
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }
    // 字符串 / 模板串（含转义）
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < n) {
        if (code[i] === '\\') {
          i += 2;
          continue;
        }
        if (code[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      out += '""';
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** 扫描结果：命中的违规原因（去重后） */
export interface GuardIssue {
  reason: string;
}

/**
 * 静态扫描脚本，返回违规项。空数组代表通过。
 * 说明：条件表达式与转换脚本、事件脚本使用同一套规则，避免编辑器与运行时双标。
 */
export function scanScript(code: string): GuardIssue[] {
  if (!code || !code.trim()) return [];
  const stripped = stripLiterals(code);
  const reasons = new Set<string>();
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(stripped)) reasons.add(reason);
  }
  return [...reasons].map((reason) => ({ reason }));
}

/** 供编辑器直接展示的文案（一行一条） */
export function formatGuardIssues(issues: GuardIssue[]): string {
  return issues.map((i) => i.reason).join('；');
}
