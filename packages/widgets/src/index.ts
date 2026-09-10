/**
 * @dt/widgets — 低代码组件库统一出口。
 *
 * 导入本包会自动注册全部内置组件（见 ./definitions）。
 * 对外公共 API：
 *   registerWidget / getWidget / listWidgets / widgetGroups / WidgetRenderer
 */

// 副作用：注册内置组件定义
import './definitions/index';

export { registerWidget, getWidget, listWidgets, widgetGroups } from './registry';
export type { WidgetDefinition, WidgetGroup } from './registry';
export { default as WidgetRenderer } from './runtime/WidgetRenderer.vue';
