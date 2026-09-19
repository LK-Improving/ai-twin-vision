/**
 * @dt/layout-engine —— 画布布局引擎。
 *
 * 分层：
 * - core（纯逻辑）：坐标换算、八向缩放、对齐吸附、拖拽负载，可脱离浏览器使用；
 * - vue（适配层）：把内核接到 DOM 事件与 ref 状态上。
 *
 * 只想要纯计算（例如 Node 脚本或单测）时请 `import { resizeRect } from '@dt/layout-engine/core'`，
 * 避免把 Vue 依赖带进非浏览器环境。
 */
export * from './core';
export * from './vue';
