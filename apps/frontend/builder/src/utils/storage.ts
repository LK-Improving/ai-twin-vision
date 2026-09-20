/**
 * 本地持久化工具
 * - 双 Token 与过期时间
 * - 设备指纹（X-Device-Id）
 * - 用户资料缓存（用于路由守卫快速复用，避免刷新后重复请求）
 *
 * 所有读写均做 try/catch 兜底，避免隐私模式下 localStorage 抛错导致白屏。
 */

const KEY_ACCESS = 'dt_access_token';
const KEY_REFRESH = 'dt_refresh_token';
const KEY_EXPIRES = 'dt_expires_in';
const KEY_ISSUED = 'dt_token_issued_at';
const KEY_DEVICE = 'dt_device_id';
const KEY_PROFILE = 'dt_profile';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 忽略写入失败 */
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* 忽略 */
  }
}

/** 生成并持久化设备指纹（UUID v4） */
export function getDeviceId(): string {
  let id = read(KEY_DEVICE);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    write(KEY_DEVICE, id);
  }
  return id;
}

export interface TokenStorage {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export function getAccessToken(): string {
  return read(KEY_ACCESS) ?? '';
}

export function getRefreshToken(): string {
  return read(KEY_REFRESH) ?? '';
}

export function setTokens(tokens: TokenStorage): void {
  write(KEY_ACCESS, tokens.accessToken);
  write(KEY_REFRESH, tokens.refreshToken);
  write(KEY_EXPIRES, String(tokens.expiresIn));
  // 记录签发时刻：仅存时长无法判断"还剩多久过期"，实时通道需要它来提前续期
  write(KEY_ISSUED, String(Date.now()));
}

export function getExpiresIn(): number {
  const raw = read(KEY_EXPIRES);
  return raw ? Number(raw) : 0;
}

/** 令牌签发时刻（毫秒时间戳）；无记录时返回 0 */
export function getTokenIssuedAt(): number {
  const raw = read(KEY_ISSUED);
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) ? value : 0;
}

export function setProfile<T>(profile: T): void {
  write(KEY_PROFILE, JSON.stringify(profile));
}

export function getProfile<T>(): T | null {
  const raw = read(KEY_PROFILE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 退出登录 / 令牌失效时清空全部登录态 */
export function clearAuth(): void {
  remove(KEY_ACCESS);
  remove(KEY_REFRESH);
  remove(KEY_EXPIRES);
  remove(KEY_ISSUED);
  remove(KEY_PROFILE);
}
