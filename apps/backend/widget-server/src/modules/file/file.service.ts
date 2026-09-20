import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  BizCode,
  MAX_UPLOAD_SIZE,
  type FileItem,
  type ModelAssetItem,
  type PageResult,
} from '@dt/shared-types';
import { FileEntity, ModelAssetEntity } from './entities';
import { BizException } from '../../common/exceptions/biz.exception';
import { normalizePage } from '../../common/utils/page.util';
import type {
  CompleteMultipartDto,
  CreateModelAssetDto,
  InitMultipartDto,
  ModelAssetQueryDto,
} from './dto/file.dto';
import { PageQueryDto } from '../../common/dto/page-query.dto';

/** 默认分片大小 5MB */
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;

/**
 * 归一化内容指纹：接受真实 md5(32) 或客户端弱指纹 sha256(64) 等 16–64 位十六进制串。
 * 非法或超长（前端曾误传 64 位 SHA-256 指纹，而列宽曾是 32，导致 22001 落库失败）
 * 一律回退为服务端真实 md5，保证写入永不越界。
 */
function normalizeDigest(raw: string | undefined | null, buffer: Buffer): string {
  const v = (raw ?? '').trim();
  if (/^[0-9a-f]{16,64}$/i.test(v)) return v.toLowerCase();
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/** 是否为可安全用作存储路径令牌的十六进制指纹 */
function isHexFingerprint(v: string): boolean {
  return /^[0-9a-f]{16,64}$/i.test(v.trim());
}

interface UploadTaskMeta {
  uploadId: string;
  fileName: string;
  fileSize: number;
  md5: string;
  chunkSize: number;
  totalChunks: number;
  createdAt: number;
}

/**
 * 文件服务：本地磁盘存储（StorageType=LOCAL）。
 *
 * 关键流程：
 * 1. 秒传：md5 命中已存在文件则直接返回，不占用带宽。
 * 2. 分片上传：init → chunk（可乱序/断点续传）→ complete 合并。
 * 3. 安全：扩展名白名单 + 大小上限 + 路径穿越校验（详见详细设计 3.5）。
 *
 * 说明：MinIO/S3 通道预留了 storageType 字段，接入时替换 writeLocal/readLocal 即可。
 */
@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  /** 本地存储根目录 */
  private readonly rootDir: string;
  /** 分片临时目录 */
  private readonly chunkDir: string;
  /** 内存中维护上传任务；生产可迁至 Redis（已具备 RedisService） */
  private readonly tasks = new Map<string, UploadTaskMeta>();
  /** 分片完成状态：uploadId → Set<index> */
  private readonly uploaded = new Map<string, Set<number>>();

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(FileEntity)
    private readonly fileRepo: Repository<FileEntity>,
    @InjectRepository(ModelAssetEntity)
    private readonly assetRepo: Repository<ModelAssetEntity>,
  ) {
    this.rootDir = path.resolve(
      process.cwd(),
      this.config.get<string>('storage.localDir', 'uploads'),
    );
    this.chunkDir = path.join(this.rootDir, '.chunks');
    void fsp.mkdir(this.chunkDir, { recursive: true });
  }

  // ---------- 上传 ----------

  /** 校验扩展名与大小，返回标准化扩展名（含点） */
  private assertAllowed(fileName: string, size: number): string {
    const ext = path.extname(fileName).toLowerCase();
    if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext as (typeof ALLOWED_UPLOAD_EXTENSIONS)[number])) {
      throw new BizException(BizCode.FILE_TYPE_NOT_ALLOWED);
    }
    if (size > MAX_UPLOAD_SIZE) {
      throw new BizException(BizCode.FILE_TOO_LARGE);
    }
    return ext;
  }

  /** 生成存储相对路径：uploads/yyyy/MM/dd/<md5><ext> */
  private buildStoragePath(md5: string, ext: string): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    // storage.localDir 配置为绝对路径，入库/拼 URL 必须用相对根目录的路径，
    // 否则会把 D:\xxx 整段写进 storagePath，导致 /static URL 永远 404
    const relBase = path.relative(process.cwd(), this.rootDir).replace(/\\/g, '/');
    return `${relBase}/${yyyy}/${mm}/${dd}/${md5}${ext}`;
  }

  /** 防止路径穿越：解析后必须位于根目录内 */
  private resolveSafe(relPath: string): string {
    const abs = path.resolve(process.cwd(), relPath);
    if (!abs.startsWith(this.rootDir)) {
      throw new BizException(BizCode.FILE_NOT_FOUND, '非法文件路径');
    }
    return abs;
  }

  /** 单文件直传 */
  async upload(
    tenantId: string,
    userId: string,
    file: { originalname: string; size: number; buffer: Buffer; mimetype: string },
    md5?: string,
  ): Promise<FileItem> {
    this.assertAllowed(file.originalname, file.size);
    const ext = path.extname(file.originalname).toLowerCase();
    const digest = normalizeDigest(md5, file.buffer);

    // 秒传命中
    const existed = await this.fileRepo.findOne({
      where: { tenantId, md5: digest, deletedAt: null as never },
    });
    if (existed) return this.toFileItem(existed);

    const storagePath = this.buildStoragePath(digest, ext);
    const abs = this.resolveSafe(storagePath);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, file.buffer);

    const saved = await this.fileRepo.save(
      this.fileRepo.create({
        tenantId,
        fileName: file.originalname,
        fileType: file.mimetype || ext.replace('.', ''),
        fileSize: String(file.size),
        storagePath,
        storageType: 'LOCAL',
        md5: digest,
        creatorId: userId,
      }),
    );
    return this.toFileItem(saved);
  }

  /** 初始化分片上传：命中 md5 则直接秒传 */
  async initMultipart(
    tenantId: string,
    dto: InitMultipartDto,
  ): Promise<{
    uploadId: string;
    uploadedChunks: number[];
    chunkSize: number;
    totalChunks: number;
    existed: FileItem | null;
  }> {
    this.assertAllowed(dto.fileName, dto.fileSize);

    const existed = await this.fileRepo.findOne({
      where: { tenantId, md5: dto.md5, deletedAt: null as never },
    });
    if (existed) {
      return {
        uploadId: '',
        uploadedChunks: [],
        chunkSize: 0,
        totalChunks: 0,
        existed: this.toFileItem(existed),
      };
    }

    const chunkSize = dto.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const totalChunks = Math.ceil(dto.fileSize / chunkSize);
    const uploadId = crypto.randomUUID();
    this.tasks.set(uploadId, {
      uploadId,
      fileName: dto.fileName,
      fileSize: dto.fileSize,
      md5: dto.md5,
      chunkSize,
      totalChunks,
      createdAt: Date.now(),
    });
    this.uploaded.set(uploadId, new Set());
    await fsp.mkdir(path.join(this.chunkDir, uploadId), { recursive: true });

    return { uploadId, uploadedChunks: [], chunkSize, totalChunks, existed: null };
  }

  /** 写入单个分片，返回序号 */
  async uploadChunk(
    uploadId: string,
    index: number,
    chunk: { buffer: Buffer },
  ): Promise<{ index: number }> {
    const task = this.tasks.get(uploadId);
    if (!task) throw new BizException(BizCode.FILE_NOT_FOUND, '上传任务不存在或已过期');
    if (index < 0 || index >= task.totalChunks) {
      throw new BizException(BizCode.COMMON_PARAM_INVALID, '分片序号越界');
    }
    const dir = path.join(this.chunkDir, uploadId);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, String(index)), chunk.buffer);
    this.uploaded.get(uploadId)?.add(index);
    return { index };
  }

  /** 合并分片为完整文件并落库 */
  async completeMultipart(
    tenantId: string,
    userId: string,
    dto: CompleteMultipartDto,
  ): Promise<FileItem> {
    const task = this.tasks.get(dto.uploadId);
    if (!task) throw new BizException(BizCode.FILE_NOT_FOUND, '上传任务不存在或已过期');

    const done = this.uploaded.get(dto.uploadId) ?? new Set<number>();
    const missing: number[] = [];
    for (let i = 0; i < task.totalChunks; i += 1) {
      if (!done.has(i)) missing.push(i);
    }
    if (missing.length > 0) {
      throw new BizException(
        BizCode.COMMON_PARAM_INVALID,
        `分片缺失：${missing.slice(0, 10).join(',')}`,
      );
    }

    const ext = path.extname(dto.fileName).toLowerCase();
    const provided = (dto.md5 || task.md5 || '').trim();
    // 路径令牌只允许十六进制指纹，非法值改用随机串，避免污染/穿越存储路径
    const pathToken = isHexFingerprint(provided)
      ? provided.toLowerCase()
      : crypto.randomUUID().replace(/-/g, '');
    const storagePath = this.buildStoragePath(pathToken, ext);
    const abs = this.resolveSafe(storagePath);
    await fsp.mkdir(path.dirname(abs), { recursive: true });

    // 边合并边算真实 md5，供客户端指纹非法时兜底
    const hash = crypto.createHash('md5');
    const write = fs.createWriteStream(abs);
    try {
      for (let i = 0; i < task.totalChunks; i += 1) {
        const buf = await fsp.readFile(path.join(this.chunkDir, dto.uploadId, String(i)));
        hash.update(buf);
        if (!write.write(buf)) {
          await new Promise<void>((resolve) => write.once('drain', resolve));
        }
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        write.end((err?: Error | null) => (err ? reject(err) : resolve()));
      });
    }

    // 合并完成即清理分片目录
    await fsp.rm(path.join(this.chunkDir, dto.uploadId), { recursive: true, force: true });
    this.tasks.delete(dto.uploadId);
    this.uploaded.delete(dto.uploadId);

    const saved = await this.fileRepo.save(
      this.fileRepo.create({
        tenantId,
        fileName: dto.fileName,
        fileType: task.fileName ? ext.replace('.', '') : 'bin',
        fileSize: String(task.fileSize),
        storagePath,
        storageType: 'LOCAL',
        md5: isHexFingerprint(provided) ? provided.toLowerCase() : hash.digest('hex'),
        creatorId: userId,
      }),
    );
    return this.toFileItem(saved);
  }

  /** 删除文件（软删除，物理文件保留以便审计追溯） */
  async remove(tenantId: string, id: string): Promise<void> {
    const file = await this.fileRepo.findOne({ where: { id, tenantId } });
    if (!file) throw new BizException(BizCode.FILE_NOT_FOUND);
    await this.fileRepo.softDelete({ id });
  }

  // ---------- 模型资产 ----------

  async paginateAssets(
    tenantId: string,
    query: ModelAssetQueryDto & PageQueryDto,
  ): Promise<PageResult<ModelAssetItem>> {
    const { page, limit, skip } = normalizePage(query);
    const qb = this.assetRepo
      .createQueryBuilder('asset')
      .where('asset.deleted_at IS NULL')
      .andWhere('asset.tenant_id = :tenantId', { tenantId });

    if (query.assetType) {
      qb.andWhere('asset.asset_type = :assetType', { assetType: query.assetType });
    }
    if (query.keyword) {
      qb.andWhere('asset.asset_name ILIKE :kw', { kw: `%${query.keyword}%` });
    }

    const [rows, total] = await qb
      .orderBy('asset.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    // 资产 url 必须对齐到真实文件（/static/yyyy/MM/dd/<digest><ext>），
    // 否则 GLTFLoader 按 /static/model/:id 取会 404。一次性按 fileId 批量取回。
    const fileMap = await this.loadAssetFileMap(rows.map((r) => r.fileId));
    return {
      total,
      page,
      limit,
      dataList: rows.map((r) => this.toAssetItem(r, fileMap.get(r.fileId))),
    };
  }

  async createAsset(
    tenantId: string,
    userId: string,
    dto: CreateModelAssetDto,
  ): Promise<ModelAssetItem> {
    const file = await this.fileRepo.findOne({ where: { id: dto.fileId, tenantId } });
    if (!file) throw new BizException(BizCode.FILE_NOT_FOUND);

    const saved = await this.assetRepo.save(
      this.assetRepo.create({
        tenantId,
        assetName: dto.assetName,
        assetType: dto.assetType,
        fileId: file.id,
        thumbnail: dto.thumbnailUrl ?? null,
        lodLevels: dto.lodLevels ?? null,
        boundingBox: dto.boundingBox ?? null,
        polygonCount: dto.polygonCount ?? null,
        textureCount: dto.textureCount ?? null,
        creatorId: userId,
      }),
    );
    return this.toAssetItem(saved, file);
  }

  async removeAsset(tenantId: string, id: string): Promise<void> {
    const asset = await this.assetRepo.findOne({ where: { id, tenantId } });
    if (!asset) throw new BizException(BizCode.FILE_NOT_FOUND);
    await this.assetRepo.softDelete({ id });
  }

  // ---------- 内部工具 ----------

  private toFileItem(entity: FileEntity): FileItem {
    const prefix = process.env.UPLOAD_URL_PREFIX ?? '/static';
    const url = `${prefix}/${entity.storagePath.replace(/^uploads\//, '')}`;
    return {
      id: entity.id,
      fileName: entity.fileName,
      fileType: entity.fileType,
      fileSize: Number(entity.fileSize),
      storagePath: entity.storagePath,
      storageType: entity.storageType,
      md5: entity.md5,
      url,
      creatorId: entity.creatorId,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  private toAssetItem(entity: ModelAssetEntity, file?: FileEntity | null): ModelAssetItem {
    const prefix = process.env.UPLOAD_URL_PREFIX ?? '/static';
    // 关键：资产 url 必须指向真实文件落盘路径（与 toFileItem 一致），
    // 后端 useStaticAssets 才能按 /static/<storagePath> 直接流式返回 GLB。
    // 文件未挂载时回落到 /model/:id（前端基本用不到，仅防御）。
    const url = file
      ? `${prefix}/${file.storagePath.replace(/^uploads\//, '')}`
      : `${prefix}/model/${entity.id}`;
    return {
      id: entity.id,
      assetName: entity.assetName,
      assetType: entity.assetType,
      fileId: entity.fileId,
      url,
      thumbnailUrl: entity.thumbnail,
      lodLevels: entity.lodLevels,
      boundingBox: entity.boundingBox as ModelAssetItem['boundingBox'],
      polygonCount: entity.polygonCount,
      textureCount: entity.textureCount,
      creatorId: entity.creatorId,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  /** 批量取回资产关联文件的落盘路径，供 toAssetItem 拼真实 url（避免 N+1） */
  private async loadAssetFileMap(fileIds: string[]): Promise<Map<string, FileEntity>> {
    const map = new Map<string, FileEntity>();
    const uniq = Array.from(new Set(fileIds.filter(Boolean)));
    if (uniq.length === 0) return map;
    const files = await this.fileRepo.find({ where: { id: In(uniq) } });
    for (const f of files) map.set(f.id, f);
    return map;
  }
}
