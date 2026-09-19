import { join } from 'node:path';

/** 应用配置类型，供 ConfigService 泛型使用 */
export interface AppConfig {
  env: string;
  name: string;
  port: number;
  apiPrefix: string;
  apiVersion: string;
  corsOrigins: string[];
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    poolMin: number;
    poolMax: number;
    logging: boolean;
    synchronize: boolean;
    /** 应用启动时是否自动执行待处理迁移（默认 false） */
    migrationsRun: boolean;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  realtime: {
    mqttIngest: {
      enabled: boolean;
      defaultBrokerUrl: string;
      username?: string;
      password?: string;
      clientIdPrefix: string;
      /** 设备在线状态落库节流窗口（毫秒） */
      statusThrottleMs: number;
    };
    /** 大屏公开访问票据有效期（秒），用于 /screen/:token 的 WS 握手 */
    screenTicketTtlSec: number;
  };
  jwt: {
    accessSecret: string;
    accessExpiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  storage: {
    driver: 'local' | 's3';
    localDir: string;
    maxSize: number;
    minio: {
      endPoint: string;
      port: number;
      useSSL: boolean;
      accessKey: string;
      secretKey: string;
      bucket: string;
    };
  };
}

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value !== undefined && value !== '' ? parsed : fallback;
};

const toBoolean = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
};

/**
 * 配置工厂：集中读取环境变量，避免业务代码散落 process.env。
 * 多环境通过 .env.dev / .env.test / .env.prod 加载（详细设计 6.1）。
 */
export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  name: process.env.APP_NAME ?? 'digital-twin-platform',
  port: toNumber(process.env.API_PORT, 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  apiVersion: process.env.API_VERSION ?? 'v1',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
  database: {
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: toNumber(process.env.POSTGRES_PORT, 5432),
    username: process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.POSTGRES_PASSWORD ?? 'root',
    database: process.env.POSTGRES_DB ?? 'digital_twin',
    poolMin: toNumber(process.env.DB_POOL_MIN, 5),
    poolMax: toNumber(process.env.DB_POOL_MAX, 20),
    logging: toBoolean(process.env.DB_LOGGING, false),
    synchronize: toBoolean(process.env.DB_SYNCHRONIZE, false),
    // 默认不在应用启动时自动跑迁移：避免“重启意外改库”。
    // 生产推荐显式打开（DB_MIGRATIONS_RUN=true）并配合部署前备份。
    migrationsRun: toBoolean(process.env.DB_MIGRATIONS_RUN, false),
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: toNumber(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: toNumber(process.env.REDIS_DB, 0),
  },
  realtime: {
    mqttIngest: {
      enabled: toBoolean(process.env.MQTT_INGEST_ENABLED, true),
      defaultBrokerUrl: process.env.MQTT_INGEST_BROKER_URL ?? 'mqtt://localhost:1883',
      username: process.env.MQTT_INGEST_USERNAME || undefined,
      password: process.env.MQTT_INGEST_PASSWORD || undefined,
      clientIdPrefix: process.env.MQTT_INGEST_CLIENT_ID_PREFIX ?? 'dt-ingest',
      statusThrottleMs: toNumber(process.env.MQTT_STATUS_THROTTLE_MS, 30_000),
    },
    screenTicketTtlSec: toNumber(process.env.SCREEN_TICKET_TTL_SEC, 7_200),
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER as 'local' | 's3') ?? 'local',
    localDir: process.env.LOCAL_STORAGE_DIR
      ? join(process.cwd(), process.env.LOCAL_STORAGE_DIR)
      : join(process.cwd(), 'uploads'),
    maxSize: toNumber(process.env.UPLOAD_MAX_SIZE, 500 * 1024 * 1024),
    minio: {
      endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
      port: toNumber(process.env.MINIO_PORT, 9000),
      useSSL: toBoolean(process.env.MINIO_USE_SSL, false),
      accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
      bucket: process.env.MINIO_BUCKET ?? 'digital-twin',
    },
  },
});
