-- =============================================================
-- 企业级数字孪生低代码平台 — 数据库结构（PostgreSQL 15+）
-- 设计原则（详细设计 5.2）：
--   1. 表名/字段名统一 snake_case
--   2. 业务表必含 id(UUID 主键)、created_at、updated_at、deleted_at(软删除)
--   3. 高频查询字段建索引，联合索引遵循最左前缀
--   4. 字符集 UTF8（PostgreSQL 对应 utf8mb4 的完整 Unicode 支持）
-- 该文件被 docker-entrypoint-initdb.d 首次启动自动执行，
-- 也可通过 pnpm --filter @dt/widget-server schema:init 手动执行。
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

SET client_encoding = 'UTF8';
SET timezone = 'Asia/Shanghai';

-- =============================================================
-- 一、用户与权限（多租户 RBAC）
-- =============================================================

-- 租户表
CREATE TABLE IF NOT EXISTS sys_tenant (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_code    VARCHAR(50)  NOT NULL,
    tenant_name    VARCHAR(100) NOT NULL,
    contact_person VARCHAR(50),
    contact_phone  VARCHAR(20),
    status         SMALLINT     NOT NULL DEFAULT 1,
    expire_at      TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ
);
COMMENT ON TABLE  sys_tenant IS '租户表：多租户数据隔离的顶层维度';
COMMENT ON COLUMN sys_tenant.status IS '状态：1-正常，0-冻结';
CREATE UNIQUE INDEX IF NOT EXISTS uk_tenant_code ON sys_tenant (tenant_code) WHERE deleted_at IS NULL;

-- 用户表
CREATE TABLE IF NOT EXISTS sys_user (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID         NOT NULL REFERENCES sys_tenant (id),
    username      VARCHAR(50)  NOT NULL,
    password      VARCHAR(255) NOT NULL,
    real_name     VARCHAR(50),
    email         VARCHAR(100),
    phone         VARCHAR(20),
    avatar        VARCHAR(255),
    status        SMALLINT     NOT NULL DEFAULT 1,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);
COMMENT ON TABLE  sys_user IS '用户表';
COMMENT ON COLUMN sys_user.password IS 'bcrypt 加密后的密码，禁止明文存储';
COMMENT ON COLUMN sys_user.status IS '状态：1-启用，0-禁用';
CREATE UNIQUE INDEX IF NOT EXISTS uk_user_username ON sys_user (username) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_tenant_status ON sys_user (tenant_id, status);

-- 角色表
CREATE TABLE IF NOT EXISTS sys_role (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID         NOT NULL REFERENCES sys_tenant (id),
    role_code   VARCHAR(50)  NOT NULL,
    role_name   VARCHAR(100) NOT NULL,
    description TEXT,
    is_system   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);
COMMENT ON TABLE  sys_role IS '角色表';
COMMENT ON COLUMN sys_role.is_system IS '系统内置角色不允许修改或删除';
CREATE UNIQUE INDEX IF NOT EXISTS uk_role_tenant_code ON sys_role (tenant_id, role_code) WHERE deleted_at IS NULL;

-- 权限表（菜单 / 按钮 / 接口三级资源）
CREATE TABLE IF NOT EXISTS sys_permission (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_code VARCHAR(100) NOT NULL,
    permission_name VARCHAR(100) NOT NULL,
    resource_type   VARCHAR(20)  NOT NULL,
    parent_id       UUID         REFERENCES sys_permission (id),
    path            VARCHAR(255),
    sort_order      INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
COMMENT ON TABLE  sys_permission IS '权限表：MENU/BUTTON/API 三类资源';
CREATE UNIQUE INDEX IF NOT EXISTS uk_permission_code ON sys_permission (permission_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_permission_parent ON sys_permission (parent_id, sort_order);

-- 用户角色关联
CREATE TABLE IF NOT EXISTS sys_user_role (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES sys_user (id) ON DELETE CASCADE,
    role_id    UUID        NOT NULL REFERENCES sys_role (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE sys_user_role IS '用户角色关联表';
CREATE UNIQUE INDEX IF NOT EXISTS uk_user_role ON sys_user_role (user_id, role_id);
CREATE INDEX IF NOT EXISTS idx_user_role_role ON sys_user_role (role_id);

-- 角色权限关联
CREATE TABLE IF NOT EXISTS sys_role_permission (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id       UUID        NOT NULL REFERENCES sys_role (id) ON DELETE CASCADE,
    permission_id UUID        NOT NULL REFERENCES sys_permission (id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE sys_role_permission IS '角色权限关联表';
CREATE UNIQUE INDEX IF NOT EXISTS uk_role_permission ON sys_role_permission (role_id, permission_id);

-- 刷新令牌表（JWT 双 Token 机制，Refresh Token 绑定设备指纹，详细设计 2.3）
CREATE TABLE IF NOT EXISTS sys_refresh_token (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES sys_user (id) ON DELETE CASCADE,
    jti        VARCHAR(64)  NOT NULL,
    token_hash VARCHAR(64)  NOT NULL,
    device_id  VARCHAR(128),
    user_agent VARCHAR(500),
    ip_address VARCHAR(45),
    expires_at TIMESTAMPTZ  NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE  sys_refresh_token IS '刷新令牌表：支持令牌轮换、设备绑定与主动吊销';
COMMENT ON COLUMN sys_refresh_token.token_hash IS '仅存储 SHA256 摘要，避免明文令牌落库';
CREATE UNIQUE INDEX IF NOT EXISTS uk_refresh_jti ON sys_refresh_token (jti);
CREATE INDEX IF NOT EXISTS idx_refresh_user_device ON sys_refresh_token (user_id, device_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON sys_refresh_token (expires_at);

-- =============================================================
-- 二、场景与组件
-- =============================================================

-- 场景表
CREATE TABLE IF NOT EXISTS biz_scene (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL REFERENCES sys_tenant (id),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    cover_image     VARCHAR(255),
    scene_type      VARCHAR(20)  NOT NULL DEFAULT 'HYBRID',
    engine_config   JSONB        NOT NULL DEFAULT '{}'::jsonb,
    layout          JSONB        NOT NULL DEFAULT '{}'::jsonb,
    status          SMALLINT     NOT NULL DEFAULT 0,
    version         INT          NOT NULL DEFAULT 1,
    publish_version INT,
    -- 发布访问令牌（/screen/:token 公开访问），首次发布时生成后保持不变
    publish_token   VARCHAR(64),
    creator_id      UUID         NOT NULL REFERENCES sys_user (id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
COMMENT ON TABLE  biz_scene IS '场景表：数字孪生场景元数据与引擎配置';
COMMENT ON COLUMN biz_scene.scene_type IS '场景类型：MACRO 宏观GIS / MICRO 微观模型 / HYBRID 双引擎融合';
COMMENT ON COLUMN biz_scene.engine_config IS 'Cesium 与 Three.js 引擎配置（JSONB）';
COMMENT ON COLUMN biz_scene.layout IS '低代码 2D 大屏画布 Schema（节点树 + 事件编排）';
COMMENT ON COLUMN biz_scene.status IS '状态：0-草稿，1-已发布，2-已归档';
CREATE INDEX IF NOT EXISTS idx_scene_tenant_status ON biz_scene (tenant_id, status, updated_at DESC);
-- 幂等升级：CREATE TABLE IF NOT EXISTS 不会为已存在的表补列，
-- 在旧版本初始化的库上重放本脚本时需显式补齐，否则下方索引会因缺列报错。
ALTER TABLE biz_scene ADD COLUMN IF NOT EXISTS publish_token VARCHAR(64);
-- 发布令牌唯一索引（NULL 不参与唯一性约束）
CREATE UNIQUE INDEX IF NOT EXISTS idx_scene_publish_token ON biz_scene (publish_token) WHERE publish_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scene_creator ON biz_scene (creator_id);
CREATE UNIQUE INDEX IF NOT EXISTS uk_scene_tenant_name ON biz_scene (tenant_id, name) WHERE deleted_at IS NULL;

-- 组件表（组件库定义）
CREATE TABLE IF NOT EXISTS biz_component (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL REFERENCES sys_tenant (id),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    component_type  VARCHAR(50)  NOT NULL,
    category        VARCHAR(50)  NOT NULL,
    model_file_path VARCHAR(500),
    thumbnail       VARCHAR(255),
    config_schema   JSONB        NOT NULL DEFAULT '{}'::jsonb,
    source_code     TEXT,
    is_public       BOOLEAN      NOT NULL DEFAULT FALSE,
    version         VARCHAR(20)  NOT NULL DEFAULT '1.0.0',
    creator_id      UUID         NOT NULL REFERENCES sys_user (id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
COMMENT ON TABLE  biz_component IS '组件表：可视化组件库定义（含 3D 与 2D 组件）';
COMMENT ON COLUMN biz_component.config_schema IS '属性面板 Schema，驱动前端动态表单';
COMMENT ON COLUMN biz_component.source_code IS '自定义组件源码，沙箱执行';
CREATE INDEX IF NOT EXISTS idx_component_tenant_category ON biz_component (tenant_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_component_type ON biz_component (component_type);
CREATE INDEX IF NOT EXISTS idx_component_public ON biz_component (is_public) WHERE is_public = TRUE;

-- 场景组件实例表
CREATE TABLE IF NOT EXISTS biz_scene_component (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_id         UUID        NOT NULL REFERENCES biz_scene (id) ON DELETE CASCADE,
    component_id     UUID        NOT NULL REFERENCES biz_component (id),
    name             VARCHAR(200),
    component_config JSONB       NOT NULL DEFAULT '{}'::jsonb,
    position         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    layer_id         VARCHAR(64),
    sort_order       INT         NOT NULL DEFAULT 0,
    visible          BOOLEAN     NOT NULL DEFAULT TRUE,
    locked           BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);
COMMENT ON TABLE  biz_scene_component IS '场景组件实例表：组件在具体场景中的实例化配置';
COMMENT ON COLUMN biz_scene_component.position IS '空间变换：经纬高 / 局部坐标 / 旋转 / 缩放';
CREATE INDEX IF NOT EXISTS idx_scene_component_scene ON biz_scene_component (scene_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_scene_component_component ON biz_scene_component (component_id);

-- 场景版本表（发布快照）
CREATE TABLE IF NOT EXISTS biz_scene_version (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_id      UUID        NOT NULL REFERENCES biz_scene (id) ON DELETE CASCADE,
    version_no    INT         NOT NULL,
    snapshot_data JSONB       NOT NULL,
    change_log    TEXT,
    creator_id    UUID        NOT NULL REFERENCES sys_user (id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE  biz_scene_version IS '场景版本表：发布时的完整快照，支持回滚';
CREATE UNIQUE INDEX IF NOT EXISTS uk_scene_version ON biz_scene_version (scene_id, version_no);
CREATE INDEX IF NOT EXISTS idx_scene_version_created ON biz_scene_version (scene_id, created_at DESC);

-- 模板表
CREATE TABLE IF NOT EXISTS biz_template (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID         NOT NULL REFERENCES sys_tenant (id),
    name          VARCHAR(200) NOT NULL,
    description   TEXT,
    category      VARCHAR(50)  NOT NULL,
    template_data JSONB        NOT NULL,
    cover_image   VARCHAR(255),
    is_public     BOOLEAN      NOT NULL DEFAULT FALSE,
    creator_id    UUID         NOT NULL REFERENCES sys_user (id),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);
COMMENT ON TABLE biz_template IS '模板表：多行业场景模板（智慧城市/工厂/园区）';
CREATE INDEX IF NOT EXISTS idx_template_tenant_category ON biz_template (tenant_id, category);

-- =============================================================
-- 三、文件与 3D 资产
-- =============================================================

CREATE TABLE IF NOT EXISTS biz_file (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID          NOT NULL REFERENCES sys_tenant (id),
    file_name    VARCHAR(500)  NOT NULL,
    file_type    VARCHAR(50)   NOT NULL,
    file_size    BIGINT        NOT NULL,
    storage_path VARCHAR(1000) NOT NULL,
    storage_type VARCHAR(10)   NOT NULL DEFAULT 'LOCAL',
    md5          VARCHAR(64)   NOT NULL,
    creator_id   UUID          NOT NULL REFERENCES sys_user (id),
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ
);
COMMENT ON TABLE  biz_file IS '文件表：仅记录元数据与访问路径，二进制存于对象存储';
COMMENT ON COLUMN biz_file.md5 IS '内容指纹（md5=32 或 sha256=64 十六进制），用于秒传与完整性校验';
-- 幂等升级：旧库 md5 列为 VARCHAR(32)，容纳不下 sha256 指纹，拓宽为 64（已是 64 时为空操作）
ALTER TABLE biz_file ALTER COLUMN md5 TYPE VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_file_tenant_md5 ON biz_file (tenant_id, md5);
CREATE INDEX IF NOT EXISTS idx_file_creator ON biz_file (creator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS biz_model_asset (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID         NOT NULL REFERENCES sys_tenant (id),
    asset_name    VARCHAR(200) NOT NULL,
    asset_type    VARCHAR(10)  NOT NULL,
    file_id       UUID         NOT NULL REFERENCES biz_file (id),
    thumbnail     VARCHAR(255),
    lod_levels    JSONB,
    bounding_box  JSONB,
    polygon_count INT,
    texture_count INT,
    creator_id    UUID         NOT NULL REFERENCES sys_user (id),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);
COMMENT ON TABLE  biz_model_asset IS '3D 模型资产表：GLTF/FBX/OBJ/3DTILES 及其 LOD 层级';
COMMENT ON COLUMN biz_model_asset.lod_levels IS 'LOD 层级配置：{HIGH:url, MEDIUM:url, LOW:url}';
CREATE INDEX IF NOT EXISTS idx_model_asset_tenant_type ON biz_model_asset (tenant_id, asset_type);

-- =============================================================
-- 四、数据源与 IoT
-- =============================================================

CREATE TABLE IF NOT EXISTS biz_data_source (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID         NOT NULL REFERENCES sys_tenant (id),
    name        VARCHAR(200) NOT NULL,
    type        VARCHAR(20)  NOT NULL,
    config      JSONB        NOT NULL,
    status      SMALLINT     NOT NULL DEFAULT 0,
    test_result JSONB,
    creator_id  UUID         NOT NULL REFERENCES sys_user (id),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);
COMMENT ON TABLE  biz_data_source IS '数据源表：PG/MYSQL/HTTP/WEBSOCKET/MQTT/OPC-UA/MODBUS';
COMMENT ON COLUMN biz_data_source.config IS '连接配置，敏感字段接口返回时脱敏';
CREATE INDEX IF NOT EXISTS idx_data_source_tenant_type ON biz_data_source (tenant_id, type);

CREATE TABLE IF NOT EXISTS biz_data_mapping (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_id             UUID        NOT NULL REFERENCES biz_scene (id) ON DELETE CASCADE,
    data_source_id       UUID        NOT NULL REFERENCES biz_data_source (id),
    target_component_id  UUID        NOT NULL,
    mapping_config       JSONB       NOT NULL,
    refresh_interval     INT         NOT NULL DEFAULT 5000,
    status               SMALLINT    NOT NULL DEFAULT 1,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMPTZ
);
COMMENT ON TABLE  biz_data_mapping IS '数据映射表：数据源字段 → 三维组件属性的映射与转换规则';
COMMENT ON COLUMN biz_data_mapping.target_component_id IS '目标组件实例 ID（biz_scene_component.id）';
CREATE INDEX IF NOT EXISTS idx_data_mapping_scene ON biz_data_mapping (scene_id, status);
CREATE INDEX IF NOT EXISTS idx_data_mapping_source ON biz_data_mapping (data_source_id);

CREATE TABLE IF NOT EXISTS iot_device (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID         NOT NULL REFERENCES sys_tenant (id),
    device_code       VARCHAR(100) NOT NULL,
    device_name       VARCHAR(200) NOT NULL,
    device_type       VARCHAR(50)  NOT NULL,
    protocol          VARCHAR(20)  NOT NULL,
    connection_config JSONB        NOT NULL DEFAULT '{}'::jsonb,
    status            SMALLINT     NOT NULL DEFAULT 0,
    last_online_at    TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ
);
COMMENT ON TABLE  iot_device IS 'IoT 设备表：驱动三维模型状态变化的物理设备';
COMMENT ON COLUMN iot_device.status IS '状态：0-离线，1-在线';
CREATE UNIQUE INDEX IF NOT EXISTS uk_device_code ON iot_device (device_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_device_tenant_status ON iot_device (tenant_id, status);

CREATE TABLE IF NOT EXISTS iot_device_property (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id     UUID         NOT NULL REFERENCES iot_device (id) ON DELETE CASCADE,
    property_code VARCHAR(100) NOT NULL,
    property_name VARCHAR(200) NOT NULL,
    property_type VARCHAR(20)  NOT NULL,
    unit          VARCHAR(20),
    min_value     DECIMAL,
    max_value     DECIMAL,
    default_value VARCHAR(100),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);
COMMENT ON TABLE iot_device_property IS '设备属性表：物模型属性定义';
CREATE UNIQUE INDEX IF NOT EXISTS uk_device_property ON iot_device_property (device_id, property_code) WHERE deleted_at IS NULL;

-- 遥测数据（时序表）。主键包含时间列以满足 TimescaleDB 分区约束。
CREATE TABLE IF NOT EXISTS iot_device_telemetry (
    id            UUID             NOT NULL DEFAULT gen_random_uuid(),
    device_id     UUID             NOT NULL,
    property_code VARCHAR(100)     NOT NULL,
    value         DOUBLE PRECISION NOT NULL,
    "timestamp"   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, "timestamp")
);
COMMENT ON TABLE iot_device_telemetry IS '设备遥测数据表（时序）：高频 IoT 数据，按时间分区';
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time
    ON iot_device_telemetry (device_id, property_code, "timestamp" DESC);

-- 若安装了 TimescaleDB 扩展则转为 hypertable，否则退化为普通表（保证纯 PostgreSQL 环境可用）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
        CREATE EXTENSION IF NOT EXISTS timescaledb;
        PERFORM create_hypertable(
            'iot_device_telemetry', 'timestamp',
            chunk_time_interval => INTERVAL '7 days',
            if_not_exists => TRUE, migrate_data => TRUE
        );
        RAISE NOTICE 'iot_device_telemetry 已转换为 TimescaleDB hypertable';
    ELSE
        RAISE NOTICE 'TimescaleDB 不可用，iot_device_telemetry 保持为普通表';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'hypertable 创建跳过：%', SQLERRM;
END $$;

CREATE TABLE IF NOT EXISTS iot_alert_rule (
    id             UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID             NOT NULL REFERENCES sys_tenant (id),
    device_id      UUID             REFERENCES iot_device (id) ON DELETE CASCADE,
    property_code  VARCHAR(100)     NOT NULL,
    rule_name      VARCHAR(200)     NOT NULL,
    condition      JSONB            NOT NULL,
    threshold      DOUBLE PRECISION,
    alert_level    SMALLINT         NOT NULL DEFAULT 2,
    notify_channel JSONB            NOT NULL DEFAULT '{}'::jsonb,
    enabled        BOOLEAN          NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ
);
COMMENT ON TABLE  iot_alert_rule IS '告警规则表：阈值触发三维场景告警与消息推送';
COMMENT ON COLUMN iot_alert_rule.alert_level IS '告警级别：1-提示 2-警告 3-严重 4-紧急';
CREATE INDEX IF NOT EXISTS idx_alert_rule_device ON iot_alert_rule (device_id, enabled);

CREATE TABLE IF NOT EXISTS iot_alert_event (
    id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID             NOT NULL REFERENCES sys_tenant (id),
    rule_id       UUID             NOT NULL REFERENCES iot_alert_rule (id) ON DELETE CASCADE,
    rule_name     VARCHAR(200)     NOT NULL,
    device_id     UUID,
    property_code VARCHAR(100)     NOT NULL,
    trigger_value DOUBLE PRECISION NOT NULL,
    alert_level   SMALLINT         NOT NULL,
    status        SMALLINT         NOT NULL DEFAULT 0,
    message       VARCHAR(500)     NOT NULL,
    triggered_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    recovered_at  TIMESTAMPTZ,
    handled_by    UUID
);
COMMENT ON TABLE  iot_alert_event IS '告警事件表：规则触发后的事件流水';
COMMENT ON COLUMN iot_alert_event.status IS '状态：0-未处理，1-已确认，2-已恢复';
CREATE INDEX IF NOT EXISTS idx_alert_event_tenant_time ON iot_alert_event (tenant_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_event_status ON iot_alert_event (status, alert_level);

-- =============================================================
-- 五、系统日志
-- =============================================================

CREATE TABLE IF NOT EXISTS sys_operation_log (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL,
    user_id         UUID         NOT NULL,
    username        VARCHAR(50)  NOT NULL,
    module          VARCHAR(100) NOT NULL,
    action          VARCHAR(100) NOT NULL,
    request_method  VARCHAR(10)  NOT NULL,
    request_url     VARCHAR(500) NOT NULL,
    request_params  JSONB,
    response_status INT          NOT NULL,
    response_time   INT          NOT NULL,
    ip_address      VARCHAR(45)  NOT NULL,
    user_agent      VARCHAR(500),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE sys_operation_log IS '操作日志表：记录用户操作轨迹，便于问题追溯';
CREATE INDEX IF NOT EXISTS idx_oplog_tenant_time ON sys_operation_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oplog_user_time ON sys_operation_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oplog_module ON sys_operation_log (module, created_at DESC);

CREATE TABLE IF NOT EXISTS sys_system_log (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    level       VARCHAR(10)  NOT NULL,
    logger      VARCHAR(200) NOT NULL,
    message     TEXT         NOT NULL,
    exception   JSONB,
    stack_trace TEXT,
    hostname    VARCHAR(100),
    trace_id    VARCHAR(64),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE sys_system_log IS '系统日志表：ERROR/FATAL 级别持久化，便于告警与排障';
CREATE INDEX IF NOT EXISTS idx_syslog_level_time ON sys_system_log (level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_syslog_trace ON sys_system_log (trace_id);

-- =============================================================
-- 六、通用触发器：自动维护 updated_at
-- =============================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'sys_tenant','sys_user','sys_role','biz_scene','biz_component','biz_scene_component',
        'biz_template','biz_file','biz_model_asset','biz_data_source','biz_data_mapping',
        'iot_device','iot_device_property','iot_alert_rule'
    ] LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl AND column_name = 'updated_at'
        ) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I', tbl, tbl);
            EXECUTE format(
                'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I
                 FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tbl, tbl
            );
        END IF;
    END LOOP;
END $$;
