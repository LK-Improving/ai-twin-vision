/**
 * 低代码画布与事件编排契约
 * 前端编辑器与运行时（预览/发布页）共用同一份 Schema。
 */
import type { ComponentType } from '../common/enums';

/** 画布节点几何信息（2D 大屏坐标，单位 px，基于设计稿尺寸） */
export interface WidgetRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 旋转角度（度） */
  rotate?: number;
  zIndex?: number;
}

/** 组件属性项的 Schema 定义（对应 biz_component.config_schema） */
export interface PropSchemaField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'color' | 'select' | 'json' | 'model' | 'image' | 'slider';
  default?: unknown;
  /** select 类型的候选项 */
  options?: Array<{ label: string; value: string | number }>;
  min?: number;
  max?: number;
  step?: number;
  /** 分组，用于属性面板折叠展示 */
  group?: string;
  placeholder?: string;
  required?: boolean;
  /** 依赖字段满足条件时才显示 */
  visibleWhen?: { key: string; value: unknown };
  description?: string;
}

/** 组件配置 Schema */
export interface ComponentConfigSchema {
  /** 属性字段定义 */
  props: PropSchemaField[];
  /** 组件可触发的事件（供事件编排选择） */
  emits?: Array<{ name: string; label: string; payload?: string }>;
  /** 组件暴露的可被调用动作 */
  actions?: Array<{ name: string; label: string; params?: PropSchemaField[] }>;
  /** 数据接入能力声明 */
  dataFields?: Array<{ key: string; label: string; type: string; required?: boolean }>;
}

/** 数据绑定：把数据源字段映射到组件属性 */
export interface DataBinding {
  /** 数据源 ID */
  dataSourceId?: string;
  /** IoT 设备 + 属性 */
  deviceId?: string;
  propertyCode?: string;
  /** 静态数据（无数据源时） */
  staticData?: unknown;
  /** 字段映射：组件字段 → 数据字段路径（支持 a.b[0].c） */
  fieldMap?: Record<string, string>;
  /** 刷新间隔（ms），0 表示仅推送驱动 */
  refreshInterval?: number;
  /** 数据后处理脚本（沙箱执行，入参 data，返回处理后的数据） */
  transformScript?: string;
}

/** 事件动作类型 */
export enum ActionType {
  /** 调用其他组件的动作 */
  CALL_COMPONENT = 'CALL_COMPONENT',
  /** 显示/隐藏组件 */
  TOGGLE_VISIBLE = 'TOGGLE_VISIBLE',
  /** 相机飞行到指定视角 */
  CAMERA_FLY_TO = 'CAMERA_FLY_TO',
  /** 高亮/取消高亮三维实体 */
  HIGHLIGHT_ENTITY = 'HIGHLIGHT_ENTITY',
  /** 打开弹窗面板 */
  OPEN_PANEL = 'OPEN_PANEL',
  /** 页面跳转 */
  NAVIGATE = 'NAVIGATE',
  /** 请求接口 */
  REQUEST_API = 'REQUEST_API',
  /** 设置全局变量 */
  SET_VARIABLE = 'SET_VARIABLE',
  /** 执行自定义脚本（沙箱） */
  RUN_SCRIPT = 'RUN_SCRIPT',
}

/** 单个事件动作 */
export interface EventAction {
  id: string;
  type: ActionType;
  /** 目标组件实例 ID */
  targetId?: string;
  /** 动作参数 */
  params?: Record<string, unknown>;
  /** 条件表达式，为空则无条件执行 */
  condition?: string;
  /** 延迟执行（ms） */
  delay?: number;
}

/** 事件绑定：某组件的某事件 → 动作序列 */
export interface EventBinding {
  id: string;
  /** 触发源组件实例 ID */
  sourceId: string;
  /** 事件名，如 click / dblclick / dataChange / entityPick */
  event: string;
  actions: EventAction[];
  enabled?: boolean;
  remark?: string;
}

/** 画布节点（低代码 2D 图层） */
export interface WidgetNode {
  id: string;
  /** 关联的组件定义 ID（biz_component.id），自定义组件必填 */
  componentId?: string;
  type: ComponentType | string;
  name: string;
  rect: WidgetRect;
  /** 属性取值 */
  props: Record<string, unknown>;
  /** 样式覆盖 */
  style?: Record<string, string | number>;
  /** 数据绑定 */
  dataBinding?: DataBinding;
  visible?: boolean;
  locked?: boolean;
  /** 容器类组件的子节点 */
  children?: WidgetNode[];
  /** 所属图层 */
  layerId?: string;
}

/** 全局变量定义 */
export interface PageVariable {
  key: string;
  label?: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  defaultValue?: unknown;
}

/** 完整页面 Schema（保存进 biz_scene.layout 或模板 template_data） */
export interface PageSchema {
  version: string;
  nodes: WidgetNode[];
  events: EventBinding[];
  variables?: PageVariable[];
  /** 页面级脚本，在初始化时执行 */
  initScript?: string;
}

/** 空页面 Schema */
export const EMPTY_PAGE_SCHEMA: PageSchema = {
  version: '1.0.0',
  nodes: [],
  events: [],
  variables: [],
};
