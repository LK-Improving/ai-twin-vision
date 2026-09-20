import { http } from '@/services/request';
import type {
  AiSceneStats,
  AiSceneTaskItem,
  CloneSceneRequest,
  CreateSceneRequest,
  GenerateSceneRequest,
  GenerateSceneResult,
  PageResult,
  PatchSceneRequest,
  PublishSceneRequest,
  PublishSceneResult,
  SceneDetail,
  SceneListItem,
  SceneQuery,
  SceneVersionItem,
  UpdateSceneRequest,
} from '@dt/shared-types';

/** 场景分页列表 */
export function getScenesApi(params: SceneQuery): Promise<PageResult<SceneListItem>> {
  return http.get<PageResult<SceneListItem>>('/scenes', { params });
}

/** 场景详情 */
export function getSceneDetailApi(id: string): Promise<SceneDetail> {
  return http.get<SceneDetail>(`/scenes/${id}`);
}

/** 新建场景 */
export function createSceneApi(data: CreateSceneRequest): Promise<SceneDetail> {
  return http.post<SceneDetail>('/scenes', data);
}

/** 全量更新场景 */
export function updateSceneApi(id: string, data: UpdateSceneRequest): Promise<SceneDetail> {
  return http.put<SceneDetail>(`/scenes/${id}`, data);
}

/** 部分更新场景 */
export function patchSceneApi(id: string, data: PatchSceneRequest): Promise<SceneDetail> {
  return http.patch<SceneDetail>(`/scenes/${id}`, data);
}

/** 删除场景 */
export function deleteSceneApi(id: string): Promise<null> {
  return http.del<null>(`/scenes/${id}`);
}

/** 发布场景 */
export function publishSceneApi(
  id: string,
  data: PublishSceneRequest,
): Promise<PublishSceneResult> {
  return http.post<PublishSceneResult>(`/scenes/${id}/publish`, data);
}

/** 克隆场景 */
export function cloneSceneApi(id: string, data: CloneSceneRequest): Promise<SceneListItem> {
  return http.post<SceneListItem>(`/scenes/${id}/clone`, data);
}

/** 场景版本历史 */
export function getSceneVersionsApi(id: string): Promise<SceneVersionItem[]> {
  return http.get<SceneVersionItem[]>(`/scenes/${id}/versions`);
}

/** 回滚到指定版本 */
export function rollbackSceneApi(id: string, versionNo: number): Promise<SceneDetail> {
  return http.post<SceneDetail>(`/scenes/${id}/versions/${versionNo}/rollback`);
}

/* ------------------------------ AI 对话式生成 ------------------------------ */

/** 对话生成 3D 场景（L1：一条 prompt 即返回场景，同步生成） */
export function generateAiSceneApi(data: GenerateSceneRequest): Promise<GenerateSceneResult> {
  return http.post<GenerateSceneResult>('/ai/scene/generate', data);
}

/** 查询 AI 生成任务（L1 同步任务直接返回 DONE） */
export function getAiSceneTaskApi(taskId: string): Promise<AiSceneTaskItem> {
  return http.get<AiSceneTaskItem>(`/ai/scene/tasks/${taskId}`);
}

export type { AiSceneStats, AiSceneTaskItem, GenerateSceneResult, GenerateSceneRequest };
