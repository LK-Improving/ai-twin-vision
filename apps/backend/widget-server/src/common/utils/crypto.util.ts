import { compare, hash } from 'bcryptjs';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';

/** 密码加密强度（bcrypt cost） */
const SALT_ROUNDS = 10;

/** 加密明文密码 */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, SALT_ROUNDS);
}

/** 校验密码 */
export function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return compare(plain, hashed);
}

/** 生成 UUID v4 */
export function uuid(): string {
  return randomUUID();
}

/** 计算字符串的 MD5（文件秒传、缓存键） */
export function md5(input: string | Buffer): string {
  return createHash('md5').update(input).digest('hex');
}

/** 计算 Buffer 的 SHA256 */
export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * 脱敏工具：隐藏连接配置中的敏感字段，避免通过接口泄漏数据源密码。
 */
export function maskSensitive<T extends Record<string, unknown>>(
  config: T,
  keys: string[] = ['password', 'secret', 'secretKey', 'token', 'privateKey', 'accessKey'],
): T {
  const cloned: Record<string, unknown> = { ...config };
  for (const key of Object.keys(cloned)) {
    if (keys.some((item) => key.toLowerCase().includes(item.toLowerCase()))) {
      const value = cloned[key];
      cloned[key] = typeof value === 'string' && value.length > 0 ? '******' : value;
    }
  }
  return cloned as T;
}

/**
 * 数据源凭据可逆加密（AES-256-GCM）。
 *
 * 为什么不用 bcrypt：数据源密码需要原样回传给驱动建立连接，
 * 只能做可逆加密；密钥取自环境变量 SECRET_ENC_KEY，长度不足时派生为 32 字节。
 */
const ENC_KEY = (() => {
  const raw = process.env.SECRET_ENC_KEY || 'dt-platform-default-enc-key';
  return createHash('sha256').update(raw).digest();
})();

/** 加密字符串，输出 iv:tag:ciphertext(base64) */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

/** 解密字符串，失败时抛错（调用方需 try/catch 兼容历史明文） */
export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('密文格式非法');
  const decipher = createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

/** 掩码展示（前端回显用） */
export function maskSecret(_value: string): string {
  return '******';
}

/** 语义化版本号：内部版本号 → x.y.0（对外展示用） */
export function toSemver(versionNo: number): string {
  const major = Math.floor(versionNo / 10);
  const minor = versionNo % 10;
  return `${major}.${minor}.0`;
}
