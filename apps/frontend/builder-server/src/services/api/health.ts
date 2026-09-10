import { http } from '@/services/request';
import type { HealthStatus } from '@dt/shared-types';

/** 服务健康检查 */
export function getHealthApi(): Promise<HealthStatus> {
  return http.get<HealthStatus>('/health');
}
