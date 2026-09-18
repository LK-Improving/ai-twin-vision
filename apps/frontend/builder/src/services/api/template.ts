import { http } from '@/services/request';
import type {
  CreateTemplateRequest,
  PageQuery,
  PageResult,
  TemplateDetail,
  TemplateListItem,
} from '@dt/shared-types';

/** 模板分页列表 */
export function getTemplatesApi(params: PageQuery): Promise<PageResult<TemplateListItem>> {
  return http.get<PageResult<TemplateListItem>>('/templates', { params });
}

/** 模板详情 */
export function getTemplateDetailApi(id: string): Promise<TemplateDetail> {
  return http.get<TemplateDetail>(`/templates/${id}`);
}

/** 新建模板 */
export function createTemplateApi(data: CreateTemplateRequest): Promise<TemplateDetail> {
  return http.post<TemplateDetail>('/templates', data);
}
