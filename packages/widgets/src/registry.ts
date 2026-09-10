import type { Component } from 'vue';
import type {
  WidgetRect,
  ComponentConfigSchema,
  ComponentCategory,
} from '@dt/shared-types';

/**
 * 低代码组件定义。
 * 编辑器与运行时共用同一份定义：默认属性、属性面板 Schema、渲染组件本身。
 */
export interface WidgetDefinition {
  /** 组件类型，对应 ComponentType（或自定义类型字符串） */
  type: string;
  /** 中文名，如「折线图」 */
  name: string;
  /** 所属大类 */
  category: ComponentCategory | string;
  /** 内联 SVG path（或图标名） */
  icon: string;
  /** 画布默认几何 */
  defaultRect: WidgetRect;
  /** 默认属性取值 */
  defaultProps: Record<string, unknown>;
  /** 属性面板 Schema（驱动自动表单生成） */
  configSchema: ComponentConfigSchema;
  /** Vue 组件（defineAsyncComponent 或直接引用皆可） */
  component: Component;
  /** 是否支持数据绑定（由数据驱动而非静态配置） */
  dataDriven?: boolean;
}

/** 组件分组（按大类聚合，供组件面板展示） */
export interface WidgetGroup {
  category: string;
  label: string;
  widgets: WidgetDefinition[];
}

const registry = new Map<string, WidgetDefinition>();

/** 大类枚举 → 中文标签 */
const CATEGORY_LABEL: Record<string, string> = {
  SCENE_3D: '三维场景',
  CHART: '图表',
  UI: '基础组件',
  MEDIA: '媒体',
  CUSTOM: '自定义',
};

/** 已分组的组件列表（registerWidget 时实时同步） */
export const widgetGroups: WidgetGroup[] = [];

function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? category;
}

/** 重新计算分组（保持 widgetGroups 同一数组引用，便于 const 导出） */
function syncGroups(): void {
  const map = new Map<string, WidgetGroup>();
  for (const def of registry.values()) {
    const cat = String(def.category);
    let group = map.get(cat);
    if (!group) {
      group = { category: cat, label: categoryLabel(cat), widgets: [] };
      map.set(cat, group);
    }
    group.widgets.push(def);
  }
  widgetGroups.length = 0;
  widgetGroups.push(...map.values());
}

/** 注册一个组件定义（重复 type 会覆盖） */
export function registerWidget(def: WidgetDefinition): void {
  registry.set(def.type, def);
  syncGroups();
}

/** 按类型获取组件定义 */
export function getWidget(type: string): WidgetDefinition | undefined {
  return registry.get(type);
}

/** 列出全部组件定义，可按大类过滤 */
export function listWidgets(category?: string): WidgetDefinition[] {
  const all = Array.from(registry.values());
  if (!category) return all;
  return all.filter((w) => String(w.category) === category);
}

/** 已注册类型集合 */
export function registeredTypes(): string[] {
  return Array.from(registry.keys());
}
