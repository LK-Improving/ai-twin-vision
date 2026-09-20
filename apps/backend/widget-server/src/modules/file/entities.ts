import { Column, Entity, Index } from 'typeorm';
import { BaseEntity, CreateOnlyEntity } from '../../common/entities/base.entity';

/** 文件表 biz_file：仅记录元数据，二进制存于对象存储 */
@Entity('biz_file')
@Index('idx_file_tenant_md5', ['tenantId', 'md5'])
export class FileEntity extends CreateOnlyEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'file_name', length: 500 })
  fileName: string;

  /** MIME 类型 */
  @Column({ name: 'file_type', length: 50 })
  fileType: string;

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize: string | number;

  @Column({ name: 'storage_path', length: 1000 })
  storagePath: string;

  /** LOCAL / S3 */
  @Column({ name: 'storage_type', length: 10, default: 'LOCAL' })
  storageType: string;

  /** 内容指纹：md5(32) 或客户端弱指纹 sha256(64)，故列宽 64 */
  @Column({ name: 'md5', length: 64 })
  md5: string;

  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}

/** 3D 模型资产表 biz_model_asset */
@Entity('biz_model_asset')
@Index('idx_model_asset_tenant_type', ['tenantId', 'assetType'])
export class ModelAssetEntity extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'asset_name', length: 200 })
  assetName: string;

  /** GLTF / GLB / FBX / OBJ / 3DTILES */
  @Column({ name: 'asset_type', length: 10 })
  assetType: string;

  @Column({ name: 'file_id', type: 'uuid' })
  fileId: string;

  @Column({ type: 'varchar', name: 'thumbnail', length: 255, nullable: true })
  thumbnail: string | null;

  /** LOD 层级配置：{HIGH:url, MEDIUM:url, LOW:url} */
  @Column({ name: 'lod_levels', type: 'jsonb', nullable: true })
  lodLevels: Record<string, string> | null;

  @Column({ name: 'bounding_box', type: 'jsonb', nullable: true })
  boundingBox: Record<string, unknown> | null;

  @Column({ name: 'polygon_count', type: 'int', nullable: true })
  polygonCount: number | null;

  @Column({ name: 'texture_count', type: 'int', nullable: true })
  textureCount: number | null;

  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;
}
