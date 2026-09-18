import { http } from '@/services/request';
import type {
  CreateDataSourceRequest,
  DataSourceItem,
  DataSourceQuery,
  DataSourceTestResult,
  PageResult,
  UpdateDataSourceRequest,
} from '@dt/shared-types';

/** 数据源分页列表 */
export function getDataSourcesApi(params: DataSourceQuery): Promise<PageResult<DataSourceItem>> {
  return http.get<PageResult<DataSourceItem>>('/data-sources', { params });
}

/** 新建数据源 */
export function createDataSourceApi(data: CreateDataSourceRequest): Promise<DataSourceItem> {
  return http.post<DataSourceItem>('/data-sources', data);
}

/** 更新数据源 */
export function updateDataSourceApi(id: string, data: UpdateDataSourceRequest): Promise<DataSourceItem> {
  return http.put<DataSourceItem>(`/data-sources/${id}`, data);
}

/** 删除数据源 */
export function deleteDataSourceApi(id: string): Promise<null> {
  return http.del<null>(`/data-sources/${id}`);
}

/** 测试数据源连通性 */
export function testDataSourceApi(id: string): Promise<DataSourceTestResult> {
  return http.post<DataSourceTestResult>(`/data-sources/${id}/test`);
}
