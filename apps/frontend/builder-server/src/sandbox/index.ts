/**
 * 脚本沙箱对外入口。
 *
 * 用法：
 *   import { getScriptSandbox } from '@/sandbox';
 *   const res = await getScriptSandbox().runTransform(script, data);
 */
export {
  ScriptSandbox,
  getScriptSandbox,
  resetScriptSandbox,
  type SandboxOutcome,
} from './script-sandbox';
export { scanScript, formatGuardIssues, stripLiterals, type GuardIssue } from './guard';
export {
  dispatchCapability,
  isSameOriginPath,
  isHttpUrl,
  jsonSafe,
  type CapabilityHost,
} from './capabilities';
export { CAPABILITY_ALLOWLIST, SANDBOX_TIMEOUT, type SandboxKind } from './protocol';

/**
 * 脚本可调用能力的权威清单（编辑器提示与文档共用，避免说明与实现漂移）。
 * 新增能力时同步更新 CAPABILITY_ALLOWLIST 与 capabilities.ts。
 */
export const SCRIPT_API_DOC: Array<{ signature: string; desc: string }> = [
  {
    signature: 'await ctx.viewer.flyTo(idOrView)',
    desc: '飞行到实体或指定视角 {longitude,latitude,height}',
  },
  {
    signature: 'await ctx.viewer.highlight(id, color)',
    desc: '高亮三维实体；clearHighlight() 取消',
  },
  {
    signature: 'await ctx.viewer.setEntityVisible(id, visible)',
    desc: '切换实体显隐，省略 visible 则取反',
  },
  {
    signature: 'await ctx.nodes.list()',
    desc: '列出 2D 节点（仅 id/name/type/visible/rect 纯数据）',
  },
  {
    signature: 'await ctx.nodes.setVisible(id, visible)',
    desc: '设置节点显隐；nodes.toggle(id) 取反',
  },
  { signature: 'await ctx.component.call(id, action)', desc: '向组件派发 dt-action 自定义事件' },
  { signature: 'await ctx.panel.open(id)', desc: '切换面板节点的 dt-panel-open 类' },
  {
    signature: 'await ctx.getVar(key) / ctx.setVar(key, value)',
    desc: '读写运行时变量；ctx.variables.x = v 亦可（写回异步）',
  },
  {
    signature: 'await ctx.request(url, method, body)',
    desc: '仅允许同源 /api 或 /static 路径，返回 JSON',
  },
  { signature: 'await ctx.openUrl(url)', desc: '打开 http/https 外链（noopener）' },
  { signature: 'ctx.log(...args)', desc: '日志转发到宿主控制台' },
  {
    signature: 'data / JSON / Math / Date / Object / Array ...',
    desc: '内置对象白名单；无 window/document/fetch/localStorage',
  },
];

/**
 * 编写脚本前必知的环境限制（与实现严格对应，避免作者凭直觉误用）。
 */
export const SCRIPT_ENV_NOTES: string[] = [
  '取值类能力（getVar / request / nodes.get 等）为异步，必须 await；调用类能力不 await 也会执行，只是不等结果。',
  '没有 setTimeout / setInterval：需要延时请用动作自带的 delay（毫秒）。',
  'ctx.variables 是开始执行时的快照：读同步、写异步回传，不要依赖它读到同一脚本外的最新写入。',
  '事件脚本独占一个线程并被超时硬中断（默认 3s），不影响同期其它脚本；转换与条件表达式共用线程（默认 500ms / 200ms）。',
  '脚本无法拿到宿主对象：能力返回值均为纯 JSON 数据，props / viewer 实例不会跨过沙箱边界。',
];
