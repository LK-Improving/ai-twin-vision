import { http } from '@/services/request';
import type {
  CreateDeviceRequest,
  DeviceItem,
  DeviceQuery,
  PageResult,
} from '@dt/shared-types';

/** 设备分页列表 */
export function getDevicesApi(params: DeviceQuery): Promise<PageResult<DeviceItem>> {
  return http.get<PageResult<DeviceItem>>('/devices', { params });
}

/** 新增设备 */
export function createDeviceApi(data: CreateDeviceRequest): Promise<DeviceItem> {
  return http.post<DeviceItem>('/devices', data);
}

/** 删除设备 */
export function deleteDeviceApi(id: string): Promise<null> {
  return http.del<null>(`/devices/${id}`);
}
