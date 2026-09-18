import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { BizCode, type ApiResponse } from '@dt/shared-types';
import {
  buildSceneDetail,
  buildTemplateDetail,
  mockComponents,
  mockDataSources,
  mockDevices,
  mockHealth,
  mockModelAssets,
  mockOperationLogs,
  mockPermissionTree,
  mockRoles,
  mockScenes,
  mockTemplates,
  mockUsers,
  paginate,
  toComponentListItem,
} from './data';

/**
 * 本地 Mock 适配器
 * 在 VITE_USE_MOCK=true 时挂载到 axios 实例，
 * 按 method + url 匹配并返回符合 ApiResponse 结构的数据（HTTP 状态恒为 200，业务码承载语义）。
 */

interface MockCtx {
  method: string;
  url: string;
  params: Record<string, unknown>;
  body: unknown;
}

function wrap<T>(data: T, code = BizCode.SUCCESS, message = 'success'): ApiResponse<T> {
  return { code, message, data, timestamp: new Date().toISOString() };
}

function buildResponse<T>(config: InternalAxiosRequestConfig, payload: ApiResponse<T>): AxiosResponse<ApiResponse<T>> {
  return {
    data: payload,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    request: {},
  };
}

function parseBody(config: InternalAxiosRequestConfig): unknown {
  const raw = config.data;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

function parseCtx(config: InternalAxiosRequestConfig): MockCtx {
  return {
    method: (config.method ?? 'get').toLowerCase(),
    url: config.url ?? '',
    params: (config.params ?? {}) as Record<string, unknown>,
    body: parseBody(config),
  };
}

function delay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

let idSeq = 5000;
function genId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_m${idSeq}`;
}

/** 匹配 /xxx/:id 末段 */
function lastSegment(url: string, prefix: string): string | null {
  const re = new RegExp(`^${prefix}/([^/]+)(?:/.*)?$`);
  const m = url.match(re);
  return m ? m[1] : null;
}

function handle(ctx: MockCtx): ApiResponse<unknown> {
  const { method, url, params, body } = ctx;

  /* ---------------- 认证 ---------------- */
  if (method === 'post' && url === '/auth/login') {
    const req = body as { username?: string; password?: string };
    if (req.username === 'admin' && req.password === 'Admin@123') {
      return wrap({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 900,
        tokenType: 'Bearer',
      });
    }
    return wrap(null, BizCode.ACCOUNT_OR_PASSWORD_ERROR, '用户名或密码错误');
  }
  if (method === 'get' && url === '/auth/profile') {
    return wrap({
      id: 'u_1',
      username: 'admin',
      realName: '系统管理员',
      email: 'admin@example.com',
      phone: '13800000000',
      avatar: null,
      tenantId: 'tenant_1',
      tenantName: '演示租户',
      roles: ['SUPER_ADMIN'],
      permissions: [
        'scene:view',
        'scene:create',
        'scene:edit',
        'scene:delete',
        'scene:publish',
        'component:view',
        'component:manage',
        'file:upload',
        'file:delete',
        'datasource:view',
        'datasource:manage',
        'device:view',
        'device:manage',
        'system:user:manage',
        'system:role:manage',
        'system:log:view',
      ],
      lastLoginAt: new Date().toISOString(),
    });
  }
  if (method === 'post' && url === '/auth/refresh') {
    return wrap({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', expiresIn: 900 });
  }
  if (method === 'post' && url === '/auth/logout') return wrap(null);
  if (method === 'put' && url === '/auth/password') return wrap(null);

  /* ---------------- 场景 ---------------- */
  if (url === '/scenes' && method === 'get') {
    let list = [...mockScenes];
    const keyword = (params.keyword as string) ?? '';
    const status = params.status as string | undefined;
    const sceneType = params.sceneType as string | undefined;
    if (keyword) list = list.filter((s) => s.name.includes(keyword));
    if (status) list = list.filter((s) => s.status === status);
    if (sceneType) list = list.filter((s) => s.sceneType === sceneType);
    return wrap(paginate(list, Number(params.page) || 1, Number(params.limit) || 20));
  }
  if (url === '/scenes' && method === 'post') {
    const req = body as Record<string, unknown>;
    const item = {
      id: genId('scene'),
      name: String(req.name ?? '未命名场景'),
      description: (req.description as string) ?? null,
      coverImage: null,
      sceneType: (req.sceneType as never) ?? ('MACRO' as never),
      status: 'DRAFT',
      version: 1,
      publishVersion: null,
      creatorId: 'u_1',
      creatorName: 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockScenes.unshift(item);
    return wrap(buildSceneDetail(item));
  }
  {
    const id = lastSegment(url, '/scenes');
    if (id) {
      const sub = url.replace(`/scenes/${id}`, '');
      if (!sub && method === 'get') {
        const found = mockScenes.find((s) => s.id === id);
        return found ? wrap(buildSceneDetail(found)) : wrap(null, BizCode.SCENE_NOT_FOUND, '场景不存在');
      }
      if (!sub && (method === 'put' || method === 'patch')) {
        const found = mockScenes.find((s) => s.id === id);
        if (!found) return wrap(null, BizCode.SCENE_NOT_FOUND, '场景不存在');
        const req = body as Record<string, unknown>;
        if (req.name) found.name = String(req.name);
        if (req.description !== undefined) found.description = (req.description as string) ?? null;
        if (req.sceneType) found.sceneType = req.sceneType as never;
        found.updatedAt = new Date().toISOString();
        return wrap(buildSceneDetail(found));
      }
      if (!sub && method === 'delete') {
        const idx = mockScenes.findIndex((s) => s.id === id);
        if (idx >= 0) mockScenes.splice(idx, 1);
        return wrap(null);
      }
      if (sub === '/publish' && method === 'post') {
        const found = mockScenes.find((s) => s.id === id);
        if (!found) return wrap(null, BizCode.SCENE_NOT_FOUND, '场景不存在');
        found.status = 'PUBLISHED';
        found.version += 1;
        found.publishVersion = found.version;
        return wrap({
          id: found.id,
          status: found.status,
          version: `1.${found.version}.0`,
          versionNo: found.version,
          updatedAt: new Date().toISOString(),
        });
      }
      if (sub === '/clone' && method === 'post') {
        const found = mockScenes.find((s) => s.id === id);
        if (!found) return wrap(null, BizCode.SCENE_NOT_FOUND, '场景不存在');
        const req = body as Record<string, unknown>;
        const copy = { ...found, id: genId('scene'), name: String(req.name ?? `${found.name}-副本`), description: (req.description as string) ?? found.description, status: 'DRAFT', version: 1, publishVersion: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        mockScenes.unshift(copy);
        return wrap(copy);
      }
      if (sub === '/versions' && method === 'get') {
        return wrap([
          { id: genId('v'), sceneId: id, versionNo: 1, version: '1.0.0', changeLog: '初始版本', publishedBy: 'u_1', publishedByName: 'admin', publishedAt: '2025-08-01T08:00:00.000Z' },
          { id: genId('v'), sceneId: id, versionNo: 2, version: '1.1.0', changeLog: '优化光照', publishedBy: 'u_1', publishedByName: 'admin', publishedAt: '2025-08-20T08:00:00.000Z' },
        ]);
      }
      const verMatch = sub.match(/^\/versions\/(\d+)\/rollback$/);
      if (verMatch && method === 'post') {
        const found = mockScenes.find((s) => s.id === id);
        if (!found) return wrap(null, BizCode.SCENE_NOT_FOUND, '场景不存在');
        return wrap(buildSceneDetail(found));
      }
    }
  }

  /* ---------------- 组件 ---------------- */
  if (url === '/components' && method === 'get') {
    let list = [...mockComponents];
    const keyword = (params.keyword as string) ?? '';
    const category = params.category as string | undefined;
    if (keyword) list = list.filter((c) => c.name.includes(keyword));
    if (category) list = list.filter((c) => c.category === category);
    return wrap(paginate(list, Number(params.page) || 1, Number(params.limit) || 20));
  }
  if (url === '/components' && method === 'post') {
    const req = body as Record<string, unknown>;
    const detail = {
      id: genId('comp'),
      name: String(req.name ?? '未命名组件'),
      componentType: (req.componentType as string) ?? 'MODEL_3D',
      category: (req.category as string) ?? 'SCENE_3D',
      modelUrl: null,
      thumbnailUrl: null,
      isPublic: Boolean(req.isPublic),
      version: (req.version as string) ?? '1.0.0',
      creatorId: 'u_1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      description: (req.description as string) ?? null,
      configSchema: (req.configSchema as { props: [] }) ?? { props: [] },
      sourceCode: (req.sourceCode as string) ?? null,
    };
    mockComponents.unshift(detail);
    return wrap(detail);
  }
  {
    const id = lastSegment(url, '/components');
    if (id) {
      if (method === 'get') {
        const found = mockComponents.find((c) => c.id === id);
        return found ? wrap(found) : wrap(null, BizCode.COMPONENT_NOT_FOUND, '组件不存在');
      }
      if (method === 'put' || method === 'patch') {
        const found = mockComponents.find((c) => c.id === id);
        if (!found) return wrap(null, BizCode.COMPONENT_NOT_FOUND, '组件不存在');
        const req = body as Record<string, unknown>;
        if (req.name) found.name = String(req.name);
        if (req.description !== undefined) found.description = (req.description as string) ?? null;
        if (req.configSchema) found.configSchema = req.configSchema as { props: [] };
        found.updatedAt = new Date().toISOString();
        return wrap(found);
      }
      if (method === 'delete') {
        const idx = mockComponents.findIndex((c) => c.id === id);
        if (idx >= 0) mockComponents.splice(idx, 1);
        return wrap(null);
      }
    }
  }

  /* ---------------- 模板 ---------------- */
  if (url === '/templates' && method === 'get') {
    return wrap(paginate(mockTemplates, Number(params.page) || 1, Number(params.limit) || 20));
  }
  if (url === '/templates' && method === 'post') {
    const req = body as Record<string, unknown>;
    const item = {
      id: genId('tpl'),
      name: String(req.name ?? '未命名模板'),
      description: (req.description as string) ?? null,
      category: (req.category as string) ?? '通用',
      coverImage: null,
      isPublic: Boolean(req.isPublic),
      creatorId: 'u_1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockTemplates.unshift(item);
    return wrap(buildTemplateDetail(item));
  }
  {
    const id = lastSegment(url, '/templates');
    if (id && method === 'get') {
      const found = mockTemplates.find((t) => t.id === id);
      return found ? wrap(buildTemplateDetail(found)) : wrap(null, BizCode.TEMPLATE_NOT_FOUND, '模板不存在');
    }
  }

  /* ---------------- 文件 / 模型资产 ---------------- */
  if (url === '/files/upload' && method === 'post') {
    const form = body as FormData;
    const file = form.get('file') as File | null;
    return wrap({
      id: genId('file'),
      fileName: file?.name ?? 'upload.bin',
      fileType: file?.type ?? 'application/octet-stream',
      fileSize: file?.size ?? 0,
      storagePath: `/uploads/${genId('file')}`,
      storageType: 'LOCAL',
      md5: 'mock-md5',
      url: 'https://cdn.example.com/uploads/mock.bin',
      creatorId: 'u_1',
      createdAt: new Date().toISOString(),
    });
  }
  if (url === '/files/multipart/init' && method === 'post') {
    const req = body as { fileName: string; fileSize: number; chunkSize?: number };
    const chunkSize = req.chunkSize ?? 5 * 1024 * 1024;
    const totalChunks = Math.max(1, Math.ceil((req.fileSize || chunkSize) / chunkSize));
    return wrap({ uploadId: genId('up'), uploadedChunks: [], chunkSize, totalChunks });
  }
  if (url === '/files/multipart/chunk' && method === 'post') {
    const form = body as FormData;
    return wrap({ index: Number(form.get('index')) || 0 });
  }
  if (url === '/files/multipart/complete' && method === 'post') {
    const req = body as { fileName: string };
    return wrap({
      id: genId('file'),
      fileName: req.fileName,
      fileType: 'model',
      fileSize: 0,
      storagePath: `/uploads/${genId('file')}`,
      storageType: 'LOCAL',
      md5: 'mock-md5',
      url: 'https://cdn.example.com/uploads/mock.bin',
      creatorId: 'u_1',
      createdAt: new Date().toISOString(),
    });
  }
  {
    const id = lastSegment(url, '/files');
    if (id && method === 'delete') return wrap(null);
  }
  if (url === '/model-assets' && method === 'get') {
    return wrap(paginate(mockModelAssets, Number(params.page) || 1, Number(params.limit) || 20));
  }
  if (url === '/model-assets' && method === 'post') {
    const req = body as Record<string, unknown>;
    const item = {
      id: genId('asset'),
      assetName: String(req.assetName ?? '未命名资产'),
      assetType: (req.assetType as string) ?? 'GLB',
      fileId: String(req.fileId ?? genId('file')),
      url: 'https://cdn.example.com/models/mock.glb',
      thumbnailUrl: null,
      polygonCount: 0,
      textureCount: 0,
      creatorId: 'u_1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockModelAssets.unshift(item);
    return wrap(item);
  }
  {
    const id = lastSegment(url, '/model-assets');
    if (id && method === 'delete') {
      const idx = mockModelAssets.findIndex((a) => a.id === id);
      if (idx >= 0) mockModelAssets.splice(idx, 1);
      return wrap(null);
    }
  }

  /* ---------------- 数据源 ---------------- */
  if (url === '/data-sources' && method === 'get') {
    return wrap(paginate(mockDataSources, Number(params.page) || 1, Number(params.limit) || 20));
  }
  if (url === '/data-sources' && method === 'post') {
    const req = body as Record<string, unknown>;
    const item = {
      id: genId('ds'),
      name: String(req.name ?? '未命名数据源'),
      type: (req.type as string) ?? 'PG',
      config: (req.config as Record<string, unknown>) ?? {},
      status: 1,
      testResult: null,
      creatorId: 'u_1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockDataSources.unshift(item);
    return wrap(item);
  }
  {
    const id = lastSegment(url, '/data-sources');
    if (id) {
      if (method === 'put' || method === 'patch') {
        const found = mockDataSources.find((d) => d.id === id);
        if (!found) return wrap(null, BizCode.DATA_SOURCE_NOT_FOUND, '数据源不存在');
        const req = body as Record<string, unknown>;
        if (req.name) found.name = String(req.name);
        if (req.config) found.config = req.config as Record<string, unknown>;
        found.updatedAt = new Date().toISOString();
        return wrap(found);
      }
      if (method === 'delete') {
        const idx = mockDataSources.findIndex((d) => d.id === id);
        if (idx >= 0) mockDataSources.splice(idx, 1);
        return wrap(null);
      }
      if (method === 'post' && url.endsWith('/test')) {
        return wrap({ success: true, message: '连接成功', latency: 18, schemas: ['metrics', 'devices'] });
      }
    }
  }

  /* ---------------- 设备 ---------------- */
  if (url === '/devices' && method === 'get') {
    return wrap(paginate(mockDevices, Number(params.page) || 1, Number(params.limit) || 20));
  }
  if (url === '/devices' && method === 'post') {
    const req = body as Record<string, unknown>;
    const item = {
      id: genId('dev'),
      deviceCode: String(req.deviceCode ?? genId('dev')),
      deviceName: String(req.deviceName ?? '未命名设备'),
      deviceType: (req.deviceType as string) ?? '传感器',
      protocol: (req.protocol as string) ?? 'MQTT',
      connectionConfig: (req.connectionConfig as Record<string, unknown>) ?? {},
      status: 1,
      lastOnlineAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockDevices.unshift(item);
    return wrap(item);
  }
  {
    const id = lastSegment(url, '/devices');
    if (id && method === 'delete') {
      const idx = mockDevices.findIndex((d) => d.id === id);
      if (idx >= 0) mockDevices.splice(idx, 1);
      return wrap(null);
    }
  }

  /* ---------------- 系统 ---------------- */
  if (url === '/users' && method === 'get') {
    return wrap(paginate(mockUsers, Number(params.page) || 1, Number(params.limit) || 20));
  }
  if (url === '/users' && method === 'post') {
    const req = body as Record<string, unknown>;
    const item = {
      id: genId('user'),
      tenantId: 'tenant_1',
      username: String(req.username ?? 'user'),
      realName: (req.realName as string) ?? null,
      email: (req.email as string) ?? null,
      phone: (req.phone as string) ?? null,
      avatar: null,
      status: 1,
      roles: (req.roleIds as string[])?.map((rid) => ({ id: rid, roleCode: rid, roleName: rid })) ?? [],
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockUsers.unshift(item);
    return wrap(item);
  }
  {
    const id = lastSegment(url, '/users');
    if (id) {
      if (method === 'put' || method === 'patch') {
        const found = mockUsers.find((u) => u.id === id);
        if (!found) return wrap(null, BizCode.USER_NOT_FOUND, '用户不存在');
        const req = body as Record<string, unknown>;
        if (req.realName !== undefined) found.realName = (req.realName as string) ?? null;
        if (req.status !== undefined) found.status = Number(req.status);
        found.updatedAt = new Date().toISOString();
        return wrap(found);
      }
      if (method === 'delete') {
        const idx = mockUsers.findIndex((u) => u.id === id);
        if (idx >= 0) mockUsers.splice(idx, 1);
        return wrap(null);
      }
    }
  }
  if (url === '/roles' && method === 'get') return wrap(mockRoles);
  if (url === '/roles' && method === 'post') {
    const req = body as Record<string, unknown>;
    return wrap({
      id: genId('role'),
      tenantId: 'tenant_1',
      roleCode: String(req.roleCode ?? genId('role')),
      roleName: String(req.roleName ?? '自定义角色'),
      description: (req.description as string) ?? null,
      isSystem: false,
      permissionIds: (req.permissionIds as string[]) ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  {
    const id = lastSegment(url, '/roles');
    if (id) {
      if (method === 'put' || method === 'patch') {
        const found = mockRoles.find((r) => r.id === id);
        if (!found) return wrap(null, BizCode.ROLE_NOT_FOUND, '角色不存在');
        const req = body as Record<string, unknown>;
        if (req.roleName) found.roleName = String(req.roleName);
        if (req.permissionIds) found.permissionIds = req.permissionIds as string[];
        found.updatedAt = new Date().toISOString();
        return wrap(found);
      }
      if (method === 'delete') {
        const idx = mockRoles.findIndex((r) => r.id === id);
        if (idx >= 0) mockRoles.splice(idx, 1);
        return wrap(null);
      }
    }
  }
  if (url === '/permissions/tree' && method === 'get') return wrap(mockPermissionTree);
  if (url === '/operation-logs' && method === 'get') {
    return wrap(paginate(mockOperationLogs, Number(params.page) || 1, Number(params.limit) || 20));
  }

  /* ---------------- 健康 ---------------- */
  if (url === '/health' && method === 'get') return wrap(mockHealth);

  return wrap(null, BizCode.NOT_FOUND, '接口未匹配（Mock）');
}

/** 创建 axios 适配器 */
export function createMockAdapter(): (config: InternalAxiosRequestConfig) => Promise<AxiosResponse> {
  return (config: InternalAxiosRequestConfig) => {
    const ctx = parseCtx(config);
    const payload = handle(ctx);
    return delay(buildResponse(config, payload));
  };
}
