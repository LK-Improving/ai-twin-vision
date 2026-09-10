import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config/configuration';

/**
 * Redis 封装。
 * Redis 不可用时降级为「跳过缓存」而非抛错，保证核心业务可用性。
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private available = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const options = this.config.get<AppConfig['redis']>('redis')!;
    this.client = new Redis({
      host: options.host,
      port: options.port,
      password: options.password,
      db: options.db,
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 500, 3000)),
    });

    this.client.on('ready', () => {
      this.available = true;
      this.logger.log(`Redis 已连接 ${options.host}:${options.port} db=${options.db}`);
    });
    this.client.on('error', (error) => {
      if (this.available) {
        this.logger.warn(`Redis 连接异常，缓存能力降级：${error.message}`);
      }
      this.available = false;
    });
    this.client.on('end', () => {
      this.available = false;
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
      this.client = null;
    }
  }

  /** Redis 是否可用 */
  get isAvailable(): boolean {
    return this.available && this.client !== null;
  }

  /** 原始客户端，供订阅等高级用法使用 */
  get raw(): Redis | null {
    return this.client;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.isAvailable) return null;
    try {
      const raw = await this.client!.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  /** 写入缓存，ttlSeconds 为空表示不过期 */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.isAvailable) return;
    try {
      const raw = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client!.set(key, raw, 'EX', ttlSeconds);
      } else {
        await this.client!.set(key, raw);
      }
    } catch {
      // 缓存失败不影响主流程
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.isAvailable || keys.length === 0) return;
    try {
      await this.client!.del(...keys);
    } catch {
      // 忽略
    }
  }

  /** 按前缀批量删除（使用 scan 避免阻塞） */
  async delByPrefix(prefix: string): Promise<void> {
    if (!this.isAvailable) return;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.client!.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
        cursor = next;
        if (keys.length > 0) await this.client!.del(...keys);
      } while (cursor !== '0');
    } catch {
      // 忽略
    }
  }

  /** 缓存穿透保护：读不到则回源并写入 */
  async remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null && cached !== undefined) return cached;
    const value = await loader();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * 简易分布式锁（SET NX PX）。
   * 返回释放函数；Redis 不可用时返回空实现，避免阻塞业务。
   */
  async acquireLock(key: string, ttlMs = 10_000): Promise<(() => Promise<void>) | null> {
    if (!this.isAvailable) return async () => undefined;
    const token = randomUUID();
    const ok = await this.client!.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
    if (!ok) return null;
    return async () => {
      // 仅当持有者一致时才释放，避免误删他人锁
      const current = await this.client!.get(`lock:${key}`).catch(() => null);
      if (current === token) {
        await this.client!.del(`lock:${key}`).catch(() => undefined);
      }
    };
  }

  /** 探活，供健康检查使用 */
  async ping(): Promise<{ ok: boolean; latency?: number; message?: string }> {
    if (!this.client) return { ok: false, message: 'Redis 未初始化' };
    const start = Date.now();
    try {
      await this.client.ping();
      return { ok: true, latency: Date.now() - start };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }
}
