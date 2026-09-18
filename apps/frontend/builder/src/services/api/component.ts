import { http } from '@/services/request';
import type {
  ComponentDetail,
  ComponentListItem,
  ComponentQuery,
  CreateComponentRequest,
  PageResult,
  UpdateComponentRequest,
} from '@dt/shared-types';

/** 组件分页列表 */
export function getComponentsApi(params: ComponentQuery): Promise<PageResult<ComponentListItem>> {
  return http.get<PageResult<ComponentListItem>>('/components', { params });
}

/** 组件详情 */
export function getComponentDetailApi(id: string): Promise<ComponentDetail> {
  return http.get<ComponentDetail>(`/components/${id}`);
}

/** 新建组件 */
export function createComponentApi(data: CreateComponentRequest): Promise<ComponentDetail> {
  return http.post<ComponentDetail>('/components', data);
}

/** 更新组件 */
export function updateComponentApi(id: string, data: UpdateComponentRequest): Promise<ComponentDetail> {
  return http.put<ComponentDetail>(`/components/${id}`, data);
}

/** 删除组件 */
export function deleteComponentApi(id: string): Promise<null> {
  return http.del<null>(`/components/${id}`);
}
