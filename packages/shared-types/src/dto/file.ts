import type { PageQuery } from '../common/response';
import type { ModelAssetType, StorageType } from '../common/enums';

/** 文件元数据（biz_file） */
export interface FileItem {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  storageType: StorageType | string;
  md5: string;
  /** 可直接访问的 URL */
  url: string;
  creatorId: string;
  createdAt: string;
}

/** 3D 模型资产（biz_model_asset） */
export interface ModelAssetItem {
  id: string;
  assetName: string;
  assetType: ModelAssetType | string;
  fileId: string;
  url: string;
  thumbnailUrl?: string | null;
  /** LOD 层级配置：detail → 文件地址 */
  lodLevels?: Record<string, string> | null;
  boundingBox?: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  } | null;
  polygonCount?: number | null;
  textureCount?: number | null;
  creatorId: string;
  createdAt: string;
  updatedAt?: string;
}

/** 模型资产查询 */
export interface ModelAssetQuery extends PageQuery {
  assetType?: string;
}

/** 分片上传初始化请求 */
export interface InitMultipartUploadRequest {
  fileName: string;
  fileSize: number;
  md5: string;
  fileType?: string;
  /** 分片大小（字节），默认 5MB */
  chunkSize?: number;
}

/** 分片上传初始化响应 */
export interface InitMultipartUploadResult {
  uploadId: string;
  /** 已上传的分片序号，用于断点续传 */
  uploadedChunks: number[];
  chunkSize: number;
  totalChunks: number;
  /** 秒传命中时直接返回文件信息 */
  existed?: FileItem | null;
}

/** 分片合并请求 */
export interface CompleteMultipartUploadRequest {
  uploadId: string;
  fileName: string;
  md5: string;
  totalChunks: number;
}

/** 允许上传的文件白名单（详细设计 3.5 文件上传安全） */
export const ALLOWED_UPLOAD_EXTENSIONS = [
  // 3D 模型
  '.gltf',
  '.glb',
  '.fbx',
  '.obj',
  '.mtl',
  '.drc',
  // 3D Tiles
  '.json',
  '.b3dm',
  '.i3dm',
  '.pnts',
  '.cmpt',
  // 贴图
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.ktx2',
  '.hdr',
  '.basis',
  // GIS
  '.geojson',
  '.topojson',
  '.kml',
  '.czml',
  // 压缩包（模型套件）
  '.zip',
] as const;

/** 单文件大小上限：500MB */
export const MAX_UPLOAD_SIZE = 500 * 1024 * 1024;
