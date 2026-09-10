import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSourceEntity, DataMappingEntity } from './entities';
import { DataSourceService } from './data.service';
import { DataMappingController, DataSourceController } from './data.controller';

/**
 * 数据接入模块（需求模块五）：数据源 CRUD、连通性测试、运行时代理查询与字段映射。
 */
@Module({
  imports: [TypeOrmModule.forFeature([DataSourceEntity, DataMappingEntity])],
  controllers: [DataSourceController, DataMappingController],
  providers: [DataSourceService],
  exports: [DataSourceService],
})
export class DataModule {}
