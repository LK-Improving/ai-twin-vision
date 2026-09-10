# 企业级数字孪生低代码平台

Cesium（宏观 GIS）+ Three.js（微观精细模型）双引擎融合的数字孪生可视化低代码平台。
通过拖拽编排即可搭建三维大屏，支持数据源接入、IoT 设备绑定、事件编排与版本发布。

## 技术栈

| 层次 | 选型 |
| --- | --- |
| 包管理 | pnpm workspace（Monorepo） |
| 前端 | Vue 3.4 + TypeScript 5.5 + Vite 5 + TailwindCSS 3 + Pinia |
| 三维引擎 | Cesium 1.121（GIS/3D Tiles）+ Three.js 0.168（GLTF/PBR/特效） |
| 图表 | ECharts 5.5 |
| 后端 | NestJS 10 + TypeORM 0.3 + PostgreSQL 15 + Redis 7 |
| 认证 | JWT 双 Token（access 15min / refresh 7d）+ RBAC |
| 文件存储 | 本地磁盘（MinIO/S3 预留） |

## 目录结构

```
.
├── packages/
│   ├── shared-types/       前后端共享的类型契约（ApiResponse / DTO / 错误码 / 枚举）
│   ├── rendering-engine/   双引擎渲染内核（TwinViewer / 坐标转换 / LOD / 拾取 / 性能监控）
│   └── widgets/            低代码组件库（图表 + UI + WidgetRenderer + 注册表）
├── apps/
│   ├── frontend/builder-server/   Vue3 编辑器应用（登录 / 场景 / 组件 / 资产 / 数据 / 系统）
│   └── backend/widget-server/      NestJS 核心服务
├── docker/                 本地基础设施编排（PostgreSQL / Redis / MinIO / Nginx）
└── docs/                   需求拆解与详细设计文档
```

## 快速开始

### 1. 准备基础设施

```bash
cp .env.example .env.dev      # 按本机环境调整端口与密码
pnpm infra:up                 # 启动 PostgreSQL / Redis / MinIO
```

### 2. 安装依赖

```bash
pnpm install
pnpm build:pkg                # 先构建 shared-types
```

### 3. 初始化数据库

```bash
pnpm db:seed                  # 结构与种子数据（幂等）
```

演示账号：

| 账号 | 密码 | 角色 |
| --- | --- | --- |
| admin | Admin@123 | 超级管理员 |
| developer | Dev@123 | 开发者 |
| viewer | View@123 | 访客 |

### 4. 启动开发服务

```bash
pnpm dev                      # 前后端并行
# 或分别启动
pnpm dev:api                  # http://localhost:3000/api/v1/docs
pnpm dev:web                  # http://localhost:5173
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm typecheck` | 全量 TypeScript 类型检查 |
| `pnpm lint` / `pnpm lint:fix` | ESLint 检查 / 修复 |
| `pnpm format` | Prettier 格式化 |
| `pnpm build` | 全量构建 |
| `pnpm test` | 跑测试（无用例时通过） |
| `pnpm infra:down` | 停止基础设施 |

## 架构要点

### 双引擎融合

Three.js 使用以 `threejs.anchor`（经纬高）为原点的 ENU 局部坐标系，
每帧从 Cesium 相机同步视图/投影矩阵，使两个 canvas 叠加后视觉对齐。
Three 渲染器 `alpha: true` 且 `pointer-events: none`，拾取由统一 Picker 处理。

### 统一响应契约

所有接口返回 `{ code, message, data, timestamp, traceId }`，
前端 axios 拦截器已解包，业务层直接拿到 `data`。
业务错误码分段：通用 1xxxx / 场景 2xxxx / 组件 3xxxx / 数据 4xxxx / 系统 5xxxx。

### 无感续期

access token 过期返回 401 时，前端用单例 refreshing Promise + 等待队列
调用 `/auth/refresh` 并重放原请求；刷新失败才清空登录态跳登录页。

### 文件上传

小文件直传；大于 10MB 自动分片（默认 5MB/片），支持断点续传；
md5 命中即秒传。扩展名走白名单，路径做穿越校验，大小上限 500MB。

## 阶段路线

- **Phase 1（已完成）**：工程底座 + 共享契约 + 后端核心（认证/场景/组件/文件/数据/设备/日志/健康检查）
  + 前端编辑器骨架（三栏编排、属性/数据/事件/样式面板、撤销重做）+ 运行时预览。
- **Phase 2**：数据源网关深化（MQTT/OPC-UA/Modbus 协议栈）、WebSocket 实时推送、
  告警规则引擎、协同编辑（Yjs）与操作冲突合并。
- **Phase 3**：模板市场、自定义组件沙箱执行、大屏发布与访问鉴权、
  性能自适应降级策略完善、多租户配额与计费。

## 接口文档

启动后端后访问：http://localhost:3000/api/docs
