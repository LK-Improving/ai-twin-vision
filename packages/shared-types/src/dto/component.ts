import type { PageQuery } from '../common/response';
import type { ComponentCategory, ComponentType } from '../common/enums';
import type { ComponentConfigSchema, PageSchema } from './lowcode';

/** 组件列表项（biz_component） */
export interface ComponentListItem {
  id: string;
  name: string;
  componentType: ComponentType | string;
  category: ComponentCategory | string;
  /** 3D 组件的模型文件访问路径 */
  modelUrl: string | null;
  thumbnailUrl: string | null;
  isPublic: boolean;
  version: string;
  creatorId: string;
  createdAt: string;
  updatedAt?: string;
}

/** 组件详情（含配置 Schema） */
export interface ComponentDetail extends ComponentListItem {
  description?: string | null;
  configSchema: ComponentConfigSchema;
  /** 自定义组件源码（沙箱运行） */
  sourceCode?: string | null;
}

/** GET /api/v1/components 查询参数 */
export interface ComponentQuery extends PageQuery {
  categoryId?: string;
  category?: string;
  componentType?: string;
  isPublic?: boolean;
}

/** POST /api/v1/components 请求体 */
export interface CreateComponentRequest {
  name: string;
  componentType: ComponentType | string;
  category: ComponentCategory | string;
  description?: string;
  modelFileId?: string;
  thumbnailUrl?: string;
  configSchema?: ComponentConfigSchema;
  sourceCode?: string;
  isPublic?: boolean;
  version?: string;
}

/** PUT /api/v1/components/:id 请求体 */
export type UpdateComponentRequest = Partial<CreateComponentRequest>;

/** 模板列表项（biz_template） */
export interface TemplateListItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  coverImage: string | null;
  isPublic: boolean;
  creatorId: string;
  createdAt: string;
  updatedAt?: string;
}

/** 模板详情 */
export interface TemplateDetail extends TemplateListItem {
  /** 模板结构数据：引擎配置 + 组件 + 画布 */
  templateData: {
    config?: Record<string, unknown>;
    components?: Array<Record<string, unknown>>;
    layout?: PageSchema;
  };
}

/** POST /api/v1/templates 请求体 */
export interface CreateTemplateRequest {
  name: string;
  category: string;
  description?: string;
  coverImage?: string;
  isPublic?: boolean;
  /** 由某个场景另存为模板 */
  fromSceneId?: string;
  templateData?: TemplateDetail['templateData'];
}
