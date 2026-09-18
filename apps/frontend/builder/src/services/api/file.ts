import { http } from '@/services/request';
import type {
  CompleteMultipartUploadRequest,
  FileItem,
  InitMultipartUploadRequest,
  InitMultipartUploadResult,
  ModelAssetItem,
  ModelAssetQuery,
  PageResult,
} from '@dt/shared-types';

/**
 * 普通文件上传（< 10MB 走此接口）
 * @param onProgress 0-100 进度回调
 */
export function uploadFileApi(
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<FileItem> {
  return http.upload<FileItem>('/files/upload', formData, { onProgress });
}

/** 初始化分片上传（获取 uploadId / 断点续传已传分片） */
export function initMultipartApi(data: InitMultipartUploadRequest): Promise<InitMultipartUploadResult> {
  return http.post<InitMultipartUploadResult>('/files/multipart/init', data);
}

/** 上传单个分片 */
export function uploadChunkApi(formData: FormData, onProgress?: (percent: number) => void): Promise<{ index: number }> {
  return http.upload<{ index: number }>('/files/multipart/chunk', formData, { onProgress });
}

/** 合并分片 */
export function completeMultipartApi(data: CompleteMultipartUploadRequest): Promise<FileItem> {
  return http.post<FileItem>('/files/multipart/complete', data);
}

/** 删除文件 */
export function deleteFileApi(id: string): Promise<null> {
  return http.del<null>(`/files/${id}`);
}

/* ---------------- 3D 模型资产 ---------------- */

/** 模型资产分页列表 */
export function getModelAssetsApi(params: ModelAssetQuery): Promise<PageResult<ModelAssetItem>> {
  return http.get<PageResult<ModelAssetItem>>('/model-assets', { params });
}

/** 登记模型资产 */
export function createModelAssetApi(data: Partial<ModelAssetItem>): Promise<ModelAssetItem> {
  return http.post<ModelAssetItem>('/model-assets', data);
}

/** 删除模型资产 */
export function deleteModelAssetApi(id: string): Promise<null> {
  return http.del<null>(`/model-assets/${id}`);
}
