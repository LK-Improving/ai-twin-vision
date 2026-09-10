import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { RedisModule } from '../../redis/redis.module';
import { HealthController } from './health.controller';

/** 健康检查模块：聚合数据库与 Redis 的存活探测 */
@Module({
  imports: [TerminusModule, RedisModule],
  controllers: [HealthController],
})
export class HealthModule {}
