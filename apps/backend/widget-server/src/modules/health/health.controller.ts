import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RedisService } from '../../redis/redis.service';

/**
 * 健康检查（详细设计 3.6：可观测性）。
 * /health 对外公开，供容器探针与前端顶栏状态灯使用。
 */
@ApiTags('系统运维')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: '健康检查（数据库 + Redis）' })
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 3000 }),
      async () => {
        const res = await this.redis.ping();
        return {
          redis: {
            status: res.ok ? ('up' as const) : ('down' as const),
            latency: res.latency,
            message: res.message,
          },
        };
      },
    ]);
  }
}
