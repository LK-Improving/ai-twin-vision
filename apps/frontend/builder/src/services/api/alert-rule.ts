import { http } from '@/services/request';
import type {
  AlertRuleItem,
  CreateAlertRuleRequest,
  UpdateAlertRuleRequest,
} from '@dt/shared-types';

/** 告警规则列表（按当前租户） */
export function getAlertRulesApi(): Promise<AlertRuleItem[]> {
  return http.get<AlertRuleItem[]>('/alert-rules');
}

/** 新建告警规则 */
export function createAlertRuleApi(data: CreateAlertRuleRequest): Promise<AlertRuleItem> {
  return http.post<AlertRuleItem>('/alert-rules', data);
}

/** 更新告警规则 */
export function updateAlertRuleApi(
  id: string,
  data: UpdateAlertRuleRequest,
): Promise<AlertRuleItem> {
  return http.put<AlertRuleItem>(`/alert-rules/${id}`, data);
}

/** 删除告警规则 */
export function deleteAlertRuleApi(id: string): Promise<null> {
  return http.del<null>(`/alert-rules/${id}`);
}

/** 设备物模型属性（用于规则绑定 propertyCode） */
export interface DevicePropertyItem {
  id: string;
  deviceId: string;
  propertyCode: string;
  propertyName: string;
  propertyType: string;
  unit: string | null;
  minValue: string | null;
  maxValue: string | null;
}

/** 设备属性列表 */
export function getDevicePropertiesApi(deviceId: string): Promise<DevicePropertyItem[]> {
  return http.get<DevicePropertyItem[]>(`/devices/${deviceId}/properties`);
}
