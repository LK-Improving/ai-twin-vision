import type { PageQuery } from '../common/response';
import type { SceneType } from '../common/enums';
import type { DeepPartial, EngineConfig, Transform } from './engine';
import type { PageSchema, WidgetNode } from './lowcode';

/** 场景列表项 */
export interface SceneListItem {
  id: string;
  name: string;
  description: string | null;
  coverImage: string | null;
  sceneType: SceneType;
  /** DRAFT / PUBLISHED / ARCHIVED */
  status: string;
  version: number;
  publishVersion: number | null;
  creatorId: string;
  creatorName?: string;
  createdAt: string;
  updatedAt: string;
}

/** 场景详情（含引擎配置与组件树） */
export interface SceneDetail extends SceneListItem {
  /** Cesium / Three.js 引擎配置 */
  config: EngineConfig;
  /** 场景内组件实例列表 */
  components: SceneComponentInstance[];
  /** 低代码 2D 画布 Schema（节点树 + 事件编排 + 全局变量） */
  layout?: PageSchema;
}

/** 场景内的组件实例（biz_scene_component） */
export interface SceneComponentInstance {
  id: string;
  sceneId: string;
  componentId: string;
  /** 组件类型冗余，便于前端免二次查询直接渲染 */
  componentType?: string;
  name?: string;
  /** 组件实例化配置（对应 config_schema 的取值） */
  componentConfig: Record<string, unknown>;
  /** 空间坐标与变换 */
  position: Transform;
  layerId: string | null;
  sortOrder: number;
  visible?: boolean;
  locked?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** GET /api/v1/scenes 查询参数 */
export interface SceneQuery extends PageQuery {
  status?: string;
  sceneType?: SceneType;
  creatorId?: string;
}

/** POST /api/v1/scenes 请求体 */
export interface CreateSceneRequest {
  name: string;
  description?: string;
  sceneType?: SceneType;
  coverImage?: string;
  config?: DeepPartial<EngineConfig>;
  /** 基于模板创建 */
  templateId?: string;
}

/** PUT /api/v1/scenes/:id 请求体（全量更新） */
export interface UpdateSceneRequest {
  name: string;
  description?: string;
  sceneType?: SceneType;
  coverImage?: string;
  config?: DeepPartial<EngineConfig>;
  /**
   * 场景组件实例列表（全量覆盖）。
   * 除 componentId 外均可选：编辑器保存时可能只回传变更过的字段。
   */
  components?: Array<
    Partial<Omit<SceneComponentInstance, 'id' | 'sceneId'>> & {
      id?: string;
      componentId: string;
    }
  >;
  /** 完整页面 Schema（含节点、事件与变量） */
  layout?: PageSchema;
}

/** PATCH /api/v1/scenes/:id 请求体（部分更新） */
export type PatchSceneRequest = Partial<UpdateSceneRequest>;

/** POST /api/v1/scenes/:id/clone 请求体 */
export interface CloneSceneRequest {
  name: string;
  description?: string;
}

/** POST /api/v1/scenes/:id/publish 请求体 */
export interface PublishSceneRequest {
  changeLog?: string;
}

/** 场景版本项 */
export interface SceneVersionItem {
  id: string;
  sceneId: string;
  versionNo: number;
  /** 语义化展示版本，如 1.3.0 */
  version: string;
  changeLog: string | null;
  publishedBy: string;
  publishedByName?: string;
  publishedAt: string;
}

/** 场景版本快照 */
export interface SceneVersionSnapshot extends SceneVersionItem {
  snapshotData: {
    config: EngineConfig;
    components: SceneComponentInstance[];
    layout?: WidgetNode[];
  };
}

/** 发布响应 */
export interface PublishSceneResult {
  id: string;
  status: string;
  version: string;
  versionNo: number;
  updatedAt: string;
  /**
   * 发布访问令牌。场景首次发布时生成、之后保持不变，
   * 保证已发出的分享链接不会因为重新发布而失效。
   */
  publishToken?: string | null;
}

/** 大屏公开运行时快照（/screen/:token 使用，不含租户等敏感信息） */
export interface ScreenSnapshot {
  sceneId: string;
  name: string;
  /** 已发布的版本号 */
  versionNo: number;
  config: EngineConfig;
  components: SceneComponentInstance[];
  layout?: PageSchema;
}

/** 大屏实时通道票据：用发布令牌换取，仅用于 Socket.IO 握手 */
export interface ScreenTicket {
  /** 短时效只读令牌，作为 socket.io 的 auth.token */
  token: string;
  /** 有效期（秒） */
  expiresIn: number;
  sceneId: string;
}
