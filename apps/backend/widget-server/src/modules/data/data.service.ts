import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as net from 'node:net';
import { Brackets, Repository } from 'typeorm';
import {
  BizCode,
  type DataSourceItem,
  type DataSourceTestResult,
  type PageResult,
} from '@dt/shared-types';
import { DataSourceEntity, DataMappingEntity } from './entities';
import { BizException } from '../../common/exceptions/biz.exception';
import { normalizePage } from '../../common/utils/page.util';
import { encryptSecret, decryptSecret, maskSecret } from '../../common/utils/crypto.util';
import type {
  CreateDataMappingDto,
  CreateDataSourceDto,
  DataSourceQueryBodyDto,
  DataSourceQueryDto,
  UpdateDataSourceDto,
} from './dto/data.dto';
import { PageQueryDto } from '../../common/dto/page-query.dto';

/** 需要脱敏/加密的配置字段 */
const SECRET_KEYS = ['password', 'secret', 'token', 'accessKey'];

/**
 * 数据源服务（需求模块五：数据接入与绑定）。
 *
 * 连通性测试按类型分级实现：
 * - PG：使用 pg 驱动真实连接并执行 SELECT 1，同时探测 public schema 下的表。
 * - HTTP：发起真实请求（默认 GET）测量延迟。
 * - 其余协议：做 TCP 可达性探测（OPC-UA/MQTT/MODBUS 的完整协议栈在 Phase 3 接入）。
 * - STATIC：校验 JSON 合法性。
 */
@Injectable()
export class DataSourceService {
  private readonly logger = new Logger(DataSourceService.name);

  constructor(
    @InjectRepository(DataSourceEntity)
    private readonly dsRepo: Repository<DataSourceEntity>,
    @InjectRepository(DataMappingEntity)
    private readonly mappingRepo: Repository<DataMappingEntity>,
  ) {}

  // ---------- 列表与详情 ----------

  async paginate(
    tenantId: string,
    query: DataSourceQueryDto & PageQueryDto,
  ): Promise<PageResult<DataSourceItem>> {
    const { page, limit, skip } = normalizePage(query);
    const qb = this.dsRepo
      .createQueryBuilder('ds')
      .where('ds.deleted_at IS NULL')
      .andWhere('ds.tenant_id = :tenantId', { tenantId });

    if (query.type) qb.andWhere('ds.type = :type', { type: query.type });
    if (query.status !== undefined) qb.andWhere('ds.status = :status', { status: query.status });
    if (query.keyword) {
      qb.andWhere(
        new Brackets((sub) => {
          sub.where('ds.name ILIKE :kw', { kw: `%${query.keyword}%` });
        }),
      );
    }

    const [rows, total] = await qb
      .orderBy('ds.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { total, page, limit, dataList: rows.map((r) => this.toItem(r)) };
  }

  async detail(tenantId: string, id: string): Promise<DataSourceItem> {
    const entity = await this.findOrFail(tenantId, id);
    return this.toItem(entity);
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateDataSourceDto,
  ): Promise<DataSourceItem> {
    const saved = await this.dsRepo.save(
      this.dsRepo.create({
        tenantId,
        name: dto.name,
        type: dto.type,
        config: this.encryptConfig(dto.config),
        creatorId: userId,
      }),
    );
    return this.toItem(saved);
  }

  async update(tenantId: string, id: string, dto: UpdateDataSourceDto): Promise<DataSourceItem> {
    const entity = await this.findOrFail(tenantId, id);
    if (dto.name !== undefined) entity.name = dto.name;
    if (dto.type !== undefined) entity.type = dto.type;
    if (dto.config !== undefined) {
      const plain = this.decryptConfig(entity.config as Record<string, unknown>);
      // 前端对脱敏字段传空串表示保持原值
      const merged: Record<string, unknown> = { ...plain };
      Object.entries(dto.config).forEach(([k, v]) => {
        if (v === '' && SECRET_KEYS.includes(k)) return;
        merged[k] = v;
      });
      entity.config = this.encryptConfig(merged);
    }
    await this.dsRepo.save(entity);
    return this.toItem(entity);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const entity = await this.findOrFail(tenantId, id);
    await this.dsRepo.softDelete({ id });
    await this.mappingRepo.softDelete({ dataSourceId: id });
  }

  // ---------- 连通性测试 ----------

  async test(tenantId: string, id: string): Promise<DataSourceTestResult> {
    const entity = await this.findOrFail(tenantId, id);
    const cfg = this.decryptConfig(entity.config as Record<string, unknown>);
    const started = Date.now();

    let result: DataSourceTestResult;
    try {
      switch (entity.type) {
        case 'PG':
          result = await this.testPostgres(cfg);
          break;
        case 'MYSQL':
          result = await this.testTcp(cfg, Number(cfg.port ?? 3306), 'MySQL 端口可达');
          break;
        case 'HTTP':
          result = await this.testHttp(cfg);
          break;
        case 'WEBSOCKET':
          result = await this.testTcpFromUrl(String(cfg.url ?? ''), 'WebSocket 地址可达');
          break;
        case 'MQTT':
          result = await this.testTcpFromUrl(String(cfg.broker ?? ''), 'MQTT Broker 可达');
          break;
        case 'OPC-UA':
          result = await this.testTcpFromUrl(String(cfg.endpoint ?? ''), 'OPC-UA 端点可达');
          break;
        case 'MODBUS':
          result = await this.testTcp(cfg, Number(cfg.port ?? 502), 'Modbus 端口可达');
          break;
        case 'STATIC':
          result = this.testStatic(cfg);
          break;
        default:
          result = { success: false, message: `暂不支持的数据源类型：${entity.type}` };
      }
    } catch (e) {
      result = { success: false, message: e instanceof Error ? e.message : '连接异常' };
    }

    result.latency = Date.now() - started;
    entity.status = result.success ? 1 : 0;
    entity.testResult = result as unknown as Record<string, unknown>;
    await this.dsRepo.save(entity);

    return result;
  }

  /** PostgreSQL：真实连接 + 探测表清单 */
  private async testPostgres(cfg: Record<string, unknown>): Promise<DataSourceTestResult> {
    // 动态引入，避免未使用时也加载驱动
    const { Client } = await import('pg');
    const client = new Client({
      host: String(cfg.host ?? '127.0.0.1'),
      port: Number(cfg.port ?? 5432),
      database: String(cfg.database ?? 'postgres'),
      user: String(cfg.username ?? 'postgres'),
      password: cfg.password ? String(cfg.password) : undefined,
      connectionTimeoutMillis: 5000,
    });
    await client.connect();
    try {
      await client.query('SELECT 1');
      const tables = await client.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' LIMIT 50",
      );
      return {
        success: true,
        message: '连接成功',
        schemas: tables.rows.map((r) => r.table_name),
      };
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  /** HTTP：发起真实请求，默认 GET */
  private async testHttp(cfg: Record<string, unknown>): Promise<DataSourceTestResult> {
    const url = String(cfg.url ?? '');
    if (!url) return { success: false, message: '缺少接口地址' };
    const method = String(cfg.method ?? 'GET').toUpperCase();
    const headers = (cfg.headers ?? {}) as Record<string, string>;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body:
          method === 'GET' || method === 'HEAD' ? undefined : ((cfg.body as string) ?? undefined),
        signal: controller.signal,
      });
      return {
        success: res.ok,
        message: `HTTP ${res.status}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** 静态数据：校验 JSON 合法性 */
  private testStatic(cfg: Record<string, unknown>): DataSourceTestResult {
    const payload = cfg.payload;
    if (payload === undefined || payload === null) {
      return { success: false, message: '静态数据为空' };
    }
    if (typeof payload === 'string') {
      try {
        JSON.parse(payload);
      } catch {
        return { success: false, message: '静态数据不是合法 JSON' };
      }
    }
    return { success: true, message: '静态数据可用' };
  }

  /** 通用 TCP 可达性探测（host + port） */
  private async testTcp(
    cfg: Record<string, unknown>,
    port: number,
    okMessage: string,
  ): Promise<DataSourceTestResult> {
    const host = String(cfg.host ?? '');
    if (!host) return { success: false, message: '缺少主机地址' };
    return new Promise<DataSourceTestResult>((resolve) => {
      const socket = net.createConnection({ host, port, timeout: 4000 });
      const finish = (ok: boolean, message: string): void => {
        socket.destroy();
        resolve({ success: ok, message });
      };
      socket.on('connect', () => finish(true, okMessage));
      socket.on('timeout', () => finish(false, '连接超时'));
      socket.on('error', (err: Error) => finish(false, err.message));
    });
  }

  /** 从 URL（mqtt://host:port、opc.tcp://host:port、wss://host）提取地址做 TCP 探测 */
  private async testTcpFromUrl(raw: string, okMessage: string): Promise<DataSourceTestResult> {
    if (!raw) return { success: false, message: '缺少连接地址' };
    let url: URL;
    try {
      // 非标准协议（opc.tcp://）补一层 http 前缀以便解析
      url = new URL(raw.includes('://') ? raw : `http://${raw}`);
    } catch {
      return { success: false, message: '连接地址格式不合法' };
    }
    const port = Number(
      url.port || (url.protocol === 'https:' || url.protocol === 'wss:' ? 443 : 80),
    );
    return this.testTcp({ host: url.hostname }, port, okMessage);
  }

  // ---------- 运行时查询 ----------

  /**
   * 运行时代理查询：大屏节点绑定的数据源在此统一出口拉取，
   * 避免前端直连业务库造成凭据泄露。
   */
  async queryRuntime(tenantId: string, id: string, body: DataSourceQueryBodyDto): Promise<unknown> {
    const entity = await this.findOrFail(tenantId, id);
    const cfg = this.decryptConfig(entity.config as Record<string, unknown>);

    switch (entity.type) {
      case 'PG': {
        const sql = String(body.params?.sql ?? cfg.sql ?? 'SELECT 1');
        const { Client } = await import('pg');
        const client = new Client({
          host: String(cfg.host ?? '127.0.0.1'),
          port: Number(cfg.port ?? 5432),
          database: String(cfg.database ?? 'postgres'),
          user: String(cfg.username ?? 'postgres'),
          password: cfg.password ? String(cfg.password) : undefined,
          connectionTimeoutMillis: 5000,
        });
        await client.connect();
        try {
          const res = await client.query(sql);
          return res.rows;
        } finally {
          await client.end().catch(() => undefined);
        }
      }
      case 'HTTP': {
        const url = String(body.params?.url ?? cfg.url ?? '');
        if (!url) return [];
        const res = await fetch(url, { method: String(cfg.method ?? 'GET') });
        return (await res.json()) as unknown;
      }
      case 'STATIC':
        return typeof cfg.payload === 'string' ? JSON.parse(cfg.payload) : cfg.payload;
      default:
        // MQTT / OPC-UA / Modbus 走网关推送，轮询场景下返回空数组
        return [];
    }
  }

  // ---------- 数据映射 ----------

  async createMapping(tenantId: string, dto: CreateDataMappingDto): Promise<{ id: string }> {
    const ds = await this.findOrFail(tenantId, dto.dataSourceId);
    const saved = await this.mappingRepo.save(
      this.mappingRepo.create({
        sceneId: dto.sceneId,
        dataSourceId: ds.id,
        targetComponentId: dto.targetComponentId,
        mappingConfig: dto.mappingConfig as DataMappingEntity['mappingConfig'],
        refreshInterval: dto.refreshInterval ?? 5000,
      }),
    );
    return { id: saved.id };
  }

  async listMappings(sceneId: string): Promise<DataMappingEntity[]> {
    return this.mappingRepo.find({ where: { sceneId }, order: { createdAt: 'ASC' } });
  }

  async removeMapping(id: string): Promise<void> {
    await this.mappingRepo.softDelete({ id });
  }

  // ---------- 内部工具 ----------

  private async findOrFail(tenantId: string, id: string): Promise<DataSourceEntity> {
    const entity = await this.dsRepo.findOne({ where: { id, tenantId } });
    if (!entity) throw new BizException(BizCode.DATA_SOURCE_NOT_FOUND);
    return entity;
  }

  /** 入库前加密敏感字段 */
  private encryptConfig(config: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...config };
    SECRET_KEYS.forEach((k) => {
      const v = out[k];
      if (typeof v === 'string' && v.length > 0) out[k] = encryptSecret(v);
    });
    return out;
  }

  /** 出库前解密敏感字段（仅内部使用） */
  private decryptConfig(config: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...config };
    SECRET_KEYS.forEach((k) => {
      const v = out[k];
      if (typeof v === 'string' && v.length > 0) {
        try {
          out[k] = decryptSecret(v);
        } catch {
          // 历史明文数据：原样返回，不做解密
        }
      }
    });
    return out;
  }

  /** 对外返回时脱敏 */
  private toItem(entity: DataSourceEntity): DataSourceItem {
    const plain = this.decryptConfig(entity.config as Record<string, unknown>);
    const safe: Record<string, unknown> = { ...plain };
    SECRET_KEYS.forEach((k) => {
      if (typeof safe[k] === 'string') safe[k] = maskSecret(String(safe[k]));
    });
    return {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      config: safe,
      status: entity.status,
      testResult: (entity.testResult as DataSourceItem['testResult']) ?? null,
      creatorId: entity.creatorId,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
