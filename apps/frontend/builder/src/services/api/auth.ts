import { http } from '@/services/request';
import type {
  ChangePasswordRequest,
  LoginRequest,
  RefreshRequest,
  TokenPair,
  UserProfile,
} from '@dt/shared-types';

/** 登录 */
export function loginApi(data: LoginRequest): Promise<TokenPair> {
  return http.post<TokenPair>('/auth/login', data);
}

/** 刷新令牌（无感续期内部使用，业务层一般不直接调用） */
export function refreshTokenApi(data: RefreshRequest): Promise<TokenPair> {
  return http.post<TokenPair>('/auth/refresh', data);
}

/** 退出登录 */
export function logoutApi(): Promise<null> {
  return http.post<null>('/auth/logout');
}

/** 获取当前用户资料 */
export function getProfileApi(): Promise<UserProfile> {
  return http.get<UserProfile>('/auth/profile');
}

/** 修改密码 */
export function changePasswordApi(data: ChangePasswordRequest): Promise<null> {
  return http.put<null>('/auth/password', data);
}
