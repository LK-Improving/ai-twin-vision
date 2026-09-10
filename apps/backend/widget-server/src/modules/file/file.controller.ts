import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fsp from 'node:fs/promises';
import { Permissions } from '@dt/shared-types';
import type { FileItem, ModelAssetItem, PageResult } from '@dt/shared-types';
import { FileService } from './file.service';
import {
  CompleteMultipartDto,
  CreateModelAssetDto,
  InitMultipartDto,
  ModelAssetQueryDto,
} from './dto/file.dto';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { PageQueryDto } from '../../common/dto/page-query.dto';

/**
 * 文件与资产模块控制器。
 * 上传统一走内存缓冲（便于计算 md5 与校验），由 FileService 决定落盘位置。
 */
@ApiTags('文件与资产')
@ApiBearerAuth()
@Controller({ path: 'files', version: '1' })
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post('upload')
  @ApiOperation({ summary: '上传单个文件（小于 10MB 建议使用）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        md5: { type: 'string', description: '可选，文件 md5（用于秒传）' },
      },
    },
  })
  @RequirePermissions(Permissions.FILE_UPLOAD)
  @ResponseMessage('上传成功')
  @OperationLog({ module: '文件管理', action: '上传文件', recordParams: false })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: os.tmpdir(),
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname);
          cb(null, `${crypto.randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 500 * 1024 * 1024 },
    }),
  )
  async upload(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('md5') md5?: string,
  ): Promise<FileItem> {
    if (!file) {
      throw new Error('未接收到文件');
    }
    const buffer = await fsp.readFile(file.path);
    await fsp.rm(file.path, { force: true });
    return this.fileService.upload(
      user.tenantId,
      user.userId,
      {
        originalname: Buffer.from(file.originalname, 'latin1').toString('utf8'),
        size: file.size,
        buffer,
        mimetype: file.mimetype,
      },
      md5,
    );
  }

  @Post('multipart/init')
  @HttpCode(200)
  @ApiOperation({ summary: '初始化分片上传（md5 命中则直接秒传）' })
  @RequirePermissions(Permissions.FILE_UPLOAD)
  initMultipart(
    @CurrentUser() user: RequestUser,
    @Body() dto: InitMultipartDto,
  ): Promise<{
    uploadId: string;
    uploadedChunks: number[];
    chunkSize: number;
    totalChunks: number;
    existed: FileItem | null;
  }> {
    return this.fileService.initMultipart(user.tenantId, dto);
  }

  @Post('multipart/chunk')
  @ApiOperation({ summary: '上传单个分片' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        chunk: { type: 'string', format: 'binary' },
        uploadId: { type: 'string' },
        index: { type: 'number' },
      },
    },
  })
  @RequirePermissions(Permissions.FILE_UPLOAD)
  @UseInterceptors(
    FileInterceptor('chunk', {
      storage: diskStorage({
        destination: os.tmpdir(),
        filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
      }),
    }),
  )
  async uploadChunk(
    @UploadedFile() chunk: Express.Multer.File,
    @Body('uploadId') uploadId: string,
    @Body('index', ParseIntPipe) index: number,
  ): Promise<{ index: number }> {
    if (!chunk) throw new Error('未接收到分片');
    const buffer = await fsp.readFile(chunk.path);
    await fsp.rm(chunk.path, { force: true });
    return this.fileService.uploadChunk(uploadId, index, { buffer });
  }

  @Post('multipart/complete')
  @HttpCode(200)
  @ApiOperation({ summary: '合并分片' })
  @RequirePermissions(Permissions.FILE_UPLOAD)
  @ResponseMessage('上传成功')
  completeMultipart(
    @CurrentUser() user: RequestUser,
    @Body() dto: CompleteMultipartDto,
  ): Promise<FileItem> {
    return this.fileService.completeMultipart(user.tenantId, user.userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除文件' })
  @ApiParam({ name: 'id', description: '文件 ID' })
  @RequirePermissions(Permissions.FILE_DELETE)
  @ResponseMessage('删除成功')
  @OperationLog({ module: '文件管理', action: '删除文件' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<null> {
    await this.fileService.remove(user.tenantId, id);
    return null;
  }
}

@ApiTags('文件与资产')
@ApiBearerAuth()
@Controller({ path: 'model-assets', version: '1' })
export class ModelAssetController {
  constructor(private readonly fileService: FileService) {}

  @Get()
  @ApiOperation({ summary: '获取 3D 模型资产列表' })
  @RequirePermissions(Permissions.COMPONENT_VIEW)
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: ModelAssetQueryDto & PageQueryDto,
  ): Promise<PageResult<ModelAssetItem>> {
    return this.fileService.paginateAssets(user.tenantId, query);
  }

  @Post()
  @ApiOperation({ summary: '登记 3D 模型资产' })
  @RequirePermissions(Permissions.COMPONENT_MANAGE)
  @ResponseMessage('登记成功')
  @OperationLog({ module: '资产管理', action: '登记模型资产' })
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateModelAssetDto,
  ): Promise<ModelAssetItem> {
    return this.fileService.createAsset(user.tenantId, user.userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除模型资产' })
  @ApiParam({ name: 'id', description: '资产 ID' })
  @RequirePermissions(Permissions.FILE_DELETE)
  @ResponseMessage('删除成功')
  @OperationLog({ module: '资产管理', action: '删除模型资产' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<null> {
    await this.fileService.removeAsset(user.tenantId, id);
    return null;
  }
}
