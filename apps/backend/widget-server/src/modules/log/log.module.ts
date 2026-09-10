import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperationLogEntity, SystemLogEntity } from './entities';
import { OperationLogService } from './operation-log.service';
import { LogController } from './log.controller';

/**
 * 日志模块（需求模块六）：操作审计日志的写入与查询。
 * OperationLogService 被 OperationLogInterceptor 依赖，故导出。
 */
@Module({
  imports: [TypeOrmModule.forFeature([OperationLogEntity, SystemLogEntity])],
  controllers: [LogController],
  providers: [OperationLogService],
  exports: [OperationLogService],
})
export class LogModule {}
