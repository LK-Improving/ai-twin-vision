# 企业级数字孪生低代码平台

Cesium（宏观 GIS）+ Three.js（微观精细模型）双引擎融合的数字孪生可视化低代码平台。
通过拖拽编排即可搭建三维大屏，支持数据源接入、IoT 设备绑定、事件编排与版本发布。

## 技术栈

| 层次     | 选型                                                          |
| -------- | ------------------------------------------------------------- |
| 包管理   | pnpm workspace（Monorepo）                                    |
| 前端     | Vue 3.4 + TypeScript 5.5 + Vite 5 + TailwindCSS 3 + Pinia     |
| 三维引擎 | Cesium 1.121（GIS/3D Tiles）+ Three.js 0.168（GLTF/PBR/特效） |
| 图表     | ECharts 5.5                                                   |
| 后端     | NestJS 10 + TypeORM 0.3 + PostgreSQL 15 + Redis 7             |
| 认证     | JWT 双 Token（access 15min / refresh 7d）+ RBAC               |
| 文件存储 | 本地磁盘（MinIO/S3 预留）                                     |

## 目录结构

```
.
├── packages/
│   ├── shared-types/       前后端共享的类型契约（ApiResponse / DTO / 错误码 / 枚举）
│   ├── rendering-engine/   双引擎渲染内核（TwinViewer / 坐标转换 / LOD / 拾取 / 性能监控）
│   └── widgets/            低代码组件库（图表 + UI + WidgetRenderer + 注册表）
├── apps/
│   ├── frontend/builder/          Vue3 编辑器应用（登录 / 场景 / 组件 / 资产 / 数据 / 系统）
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

结构演进以 **migration 为唯一通道**（迭代 8.2），`01_schema.sql` 是已冻结的基线快照：

```bash
pnpm db:migrate               # 建表/升级（写入 sys_migrations 版本记录，可 revert）
pnpm db:seed                  # 演示数据（幂等，可重复执行）
pnpm db:status                # 查看已应用/待应用迁移
pnpm db:check-drift           # 改了 entity 忘加 migration 时会拦下（净变更为 0 才通过）
```

> 用 `pnpm infra:up` 拉起时，容器首次启动会自己执行 `docker-entrypoint-initdb.d` 里的基线 SQL；
> 之后新增结构变更仍靠 `pnpm db:migrate` 追平（幂等，不会覆盖已有数据）。
> `pnpm --filter @dt/widget-server schema:init` 仅用于空库一次性引导，不作为升级路径。

演示账号：

| 账号      | 密码      | 角色       |
| --------- | --------- | ---------- |
| admin     | Admin@123 | 超级管理员 |
| developer | Dev@123   | 开发者     |
| viewer    | View@123  | 访客       |

### 4. 启动开发服务

```bash
pnpm dev                      # 前后端并行
# 或分别启动
pnpm dev:api                  # http://localhost:3001/api/v1（接口文档 /api/docs）
pnpm dev:web                  # http://localhost:5173
```

## 常用命令

| 命令                                       | 说明                                                           |
| ------------------------------------------ | -------------------------------------------------------------- |
| `pnpm typecheck`                           | 全量 TypeScript 类型检查                                       |
| `pnpm lint` / `pnpm lint:fix`              | 逐个子项目 + 根级配置 ESLint 检查 / 修复                       |
| `pnpm lint:style`                          | Stylelint：只管 CSS 语义问题，格式归 Prettier                  |
| `pnpm lint:spell`                          | cspell 拼写检查（代码与配置；中文文档正文不纳入）              |
| `pnpm format`                              | Prettier 格式化                                                |
| `pnpm build`                               | 全量构建                                                       |
| `pnpm test`                                | 跑全部单测（当前 129 个用例；`code-editor`/`widgets` 尚无）    |
| `pnpm test:e2e`                            | Playwright 端到端冒烟（需先起服务，见下节）                    |
| `pnpm iot:sim`                             | IoT 设备模拟器：持续上报 TRANS-001 遥测（需先 `infra:up:iot`） |
| `pnpm infra:down`                          | 停止基础设施                                                   |
| `node scripts/ci-size-report.mjs --update` | 用当前实测值刷新前端产物体积预算                               |

## CI 流水线

定义在 `.github/workflows/ci.yml`，与本地可跑的命令完全一致，不把只有 CI 能跑的黑盒当门禁：

| Job         | 时机      | 内容                                                                                                                                                                                           |
| ----------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality`   | PR / main | `pnpm install --frozen-lockfile` → `pnpm -r typecheck` → `pnpm lint`（error 即失败）→ `pnpm lint:style` → `pnpm lint:spell` → `pnpm -r test` → `pnpm -r build` → 产物体积棘轮 → 上传 dist 产物 |
| `api-smoke` | main      | 起 Postgres(TimescaleDB) + Redis 服务，`cp .env.example .env.dev` → 构建后端 → `schema:init` → 启服务并断言 `/health` 与 `/auth/login` 拿到 accessToken                                        |
| `migration` | PR        | 空库 `db:migrate` → 断言版本记录与表数 → `db:seed` 跑两遍验幂等 → `pnpm db:check-drift`（entity 改了忘加迁移则失败）                                                                           |
| `e2e`       | PR / main | 起服务与前端（5199 + `--strictPort`）→ `pnpm test:e2e` 跑 `e2e/` 下编辑器冒烟；失败时上传报告与现场截图                                                                                        |
| `docker`    | main      | 两个 Dockerfile 各自 build；仅当配了 registry 变量与凭据才登录并推送                                                                                                                           |

本地等价校验（CI 红之前先自己跑一遍）：

```bash
pnpm install --frozen-lockfile && pnpm -r typecheck && pnpm lint && pnpm lint:style && pnpm lint:spell
pnpm -r test && pnpm -r build
node scripts/ci-size-report.mjs --budget scripts/size-budget.json
```

需要配置的仓库变量/凭据（都不配也能跑，仅不推镜像）：

- Variable `DOCKER_REGISTRY`；Secret `DOCKER_USERNAME` / `DOCKER_PASSWORD`
- 体积预算：`scripts/size-budget.json`（含 10% 余量）；确实要涨时跑 `--update` 并在 PR 里说明

## 端到端测试（Playwright）

单测能证明纯逻辑正确，但看不到“路由守卫、真实登录、Pinia store 与 DOM 事件接线”这类集成问题，
所以 e2e 只补这一层（`e2e/`，不抢单测的活）。它**不**自动拉起服务（后端要连数据库/Redis），本地跑法：

```bash
pnpm infra:up:iot            # Postgres / Redis / MinIO / Mosquitto
pnpm dev:api                 # 后端 :3001（需已 db:migrate + db:seed）
# 前端固定用 5199 与专用端口，不与开发者自己的 5173/5174 抢
pnpm --filter @dt/builder exec vite --port 5199 --strictPort
pnpm test:e2e                # 另开一个终端；E2E_BASE_URL 可覆盖默认 http://localhost:5199
```

说明：

- 登录夹具走真实表单（`e2e/auth.setup.ts`），凭据默认 `admin / Admin@123`（可用 `E2E_USERNAME`/`E2E_PASSWORD` 覆盖），
  会话写入 `e2e/.auth/`（已 gitignore，内含 token，不得入库）。
- `workers: 1` 且禁并发：用例共享同一套种子数据与历史栈，并行会互相踩。
- **Playwright 版本被钉在 1.47.2**（不是越新越好）：仓库声明支持 `node >= 20.0.0`，而新版 Playwright
  加载 `.ts` 配置依赖更新 Node 的原生类型剥离，在 20.0.0 上直接报 `Cannot use import statement outside a module`。
  升级 Playwright 前请先提升本仓的 Node 基线。

已知未覆盖：脚本沙箱的浏览器内回归（Worker 能否在产物里启动、越权标识符被遮蔽、死循环不卡死 UI）
与“发布→预览”完整链路仍待补（见迭代清单 5.1 后续项），不假称已覆盖。

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
  - 前端编辑器骨架（三栏编排、属性/数据/事件/样式面板、撤销重做）+ 运行时预览。
- **Phase 2**：数据源网关深化（MQTT/OPC-UA/Modbus 协议栈）、WebSocket 实时推送、
  告警规则引擎、协同编辑（Yjs）与操作冲突合并。
- **Phase 3**：模板市场、自定义组件沙箱执行、大屏发布与访问鉴权、
  性能自适应降级策略完善、多租户配额与计费。

## 接口文档

启动后端后访问：http://localhost:3000/api/docs
