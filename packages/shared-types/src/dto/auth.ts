import type { PermissionCode } from '../common/enums';

/** POST /api/v1/auth/login 请求体 */
export interface LoginRequest {
  username: string;
  password: string;
  /** 设备指纹，用于 Refresh Token 绑定 */
  deviceId?: string;
}

/** 登录 / 刷新令牌响应 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Access Token 过期时间（秒） */
  expiresIn: number;
  tokenType?: 'Bearer';
}

/** POST /api/v1/auth/refresh 请求体 */
export interface RefreshRequest {
  refreshToken: string;
  deviceId?: string;
}

/** GET /api/v1/auth/profile 响应 */
export interface UserProfile {
  id: string;
  username: string;
  realName?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar?: string | null;
  tenantId: string;
  tenantName?: string;
  /** 角色编码列表，如 ['SUPER_ADMIN'] */
  roles: string[];
  /** 权限编码列表，用于前端按钮级鉴权 */
  permissions: PermissionCode[] | string[];
  lastLoginAt?: string | null;
}

/** PUT /api/v1/auth/password 请求体 */
export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

/** JWT Access Token 载荷 */
export interface JwtAccessPayload {
  /** 用户 ID */
  sub: string;
  username: string;
  tenantId: string;
  roles: string[];
  /** 签发/过期时间戳（秒），由 jsonwebtoken 自动填充 */
  iat?: number;
  exp?: number;
}

/** JWT Refresh Token 载荷 */
export interface JwtRefreshPayload {
  sub: string;
  /** 令牌唯一标识，用于轮换与吊销 */
  jti: string;
  deviceId?: string;
  iat?: number;
  exp?: number;
}
