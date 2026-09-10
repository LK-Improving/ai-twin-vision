import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileEntity, ModelAssetEntity } from './entities';
import { FileService } from './file.service';
import { FileController, ModelAssetController } from './file.controller';

/**
 * 文件与资产模块（需求模块四：模型与资产管理）。
 * 提供直传、分片上传（断点续传/秒传）与 3D 模型资产登记。
 */
@Module({
  imports: [TypeOrmModule.forFeature([FileEntity, ModelAssetEntity])],
  controllers: [FileController, ModelAssetController],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}
