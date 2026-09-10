-- =============================================================
-- 初始化种子数据
-- 演示账号：
--   admin  / Admin@123   超级管理员
--   dev    / Dev@123     开发者（可编辑场景、管理组件与数据源）
--   viewer / View@123    访客（只读）
-- 密码均为 bcrypt(cost=10) 加密存储。
-- =============================================================

SET client_encoding = 'UTF8';

-- ---------- 租户 ----------
INSERT INTO sys_tenant (id, tenant_code, tenant_name, contact_person, contact_phone, status, expire_at)
VALUES ('10000000-0000-0000-0000-000000000001', 'default', '默认租户', '平台管理员', '13800000000', 1, NULL)
ON CONFLICT DO NOTHING;

-- ---------- 权限（菜单 + 按钮） ----------
INSERT INTO sys_permission (id, permission_code, permission_name, resource_type, parent_id, path, sort_order) VALUES
  ('20000000-0000-0000-0000-000000000001', 'menu:scene',        '场景管理',     'MENU',   NULL, '/scenes',        10),
  ('20000000-0000-0000-0000-000000000002', 'scene:view',        '查看场景',     'BUTTON', '20000000-0000-0000-0000-000000000001', '/api/v1/scenes',         11),
  ('20000000-0000-0000-0000-000000000003', 'scene:create',      '创建场景',     'BUTTON', '20000000-0000-0000-0000-000000000001', '/api/v1/scenes',         12),
  ('20000000-0000-0000-0000-000000000004', 'scene:edit',        '编辑场景',     'BUTTON', '20000000-0000-0000-0000-000000000001', '/api/v1/scenes/:id',     13),
  ('20000000-0000-0000-0000-000000000005', 'scene:delete',      '删除场景',     'BUTTON', '20000000-0000-0000-0000-000000000001', '/api/v1/scenes/:id',     14),
  ('20000000-0000-0000-0000-000000000006', 'scene:publish',     '发布场景',     'BUTTON', '20000000-0000-0000-0000-000000000001', '/api/v1/scenes/:id/publish', 15),
  ('20000000-0000-0000-0000-000000000010', 'menu:component',    '组件库',       'MENU',   NULL, '/components',    20),
  ('20000000-0000-0000-0000-000000000011', 'component:view',    '查看组件',     'BUTTON', '20000000-0000-0000-0000-000000000010', '/api/v1/components',     21),
  ('20000000-0000-0000-0000-000000000012', 'component:manage',  '管理组件',     'BUTTON', '20000000-0000-0000-0000-000000000010', '/api/v1/components',     22),
  ('20000000-0000-0000-0000-000000000020', 'menu:asset',        '资产管理',     'MENU',   NULL, '/assets',        30),
  ('20000000-0000-0000-0000-000000000021', 'file:upload',       '上传文件',     'BUTTON', '20000000-0000-0000-0000-000000000020', '/api/v1/files/upload',   31),
  ('20000000-0000-0000-0000-000000000022', 'file:delete',       '删除文件',     'BUTTON', '20000000-0000-0000-0000-000000000020', '/api/v1/files/:id',      32),
  ('20000000-0000-0000-0000-000000000030', 'menu:data',         '数据接入',     'MENU',   NULL, '/data-sources',  40),
  ('20000000-0000-0000-0000-000000000031', 'datasource:view',   '查看数据源',   'BUTTON', '20000000-0000-0000-0000-000000000030', '/api/v1/data-sources',   41),
  ('20000000-0000-0000-0000-000000000032', 'datasource:manage', '管理数据源',   'BUTTON', '20000000-0000-0000-0000-000000000030', '/api/v1/data-sources',   42),
  ('20000000-0000-0000-0000-000000000033', 'device:view',       '查看设备',     'BUTTON', '20000000-0000-0000-0000-000000000030', '/api/v1/devices',        43),
  ('20000000-0000-0000-0000-000000000034', 'device:manage',     '管理设备',     'BUTTON', '20000000-0000-0000-0000-000000000030', '/api/v1/devices',        44),
  ('20000000-0000-0000-0000-000000000040', 'menu:system',       '系统管理',     'MENU',   NULL, '/system',        50),
  ('20000000-0000-0000-0000-000000000041', 'system:user:manage','用户管理',     'BUTTON', '20000000-0000-0000-0000-000000000040', '/api/v1/users',          51),
  ('20000000-0000-0000-0000-000000000042', 'system:role:manage','角色管理',     'BUTTON', '20000000-0000-0000-0000-000000000040', '/api/v1/roles',          52),
  ('20000000-0000-0000-0000-000000000043', 'system:log:view',   '日志查看',     'BUTTON', '20000000-0000-0000-0000-000000000040', '/api/v1/operation-logs', 53)
ON CONFLICT DO NOTHING;

-- ---------- 角色 ----------
INSERT INTO sys_role (id, tenant_id, role_code, role_name, description, is_system) VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'SUPER_ADMIN',  '超级管理员', '拥有平台全部权限', TRUE),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'TENANT_ADMIN', '租户管理员', '管理本租户全部业务与成员', TRUE),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'DEVELOPER',    '开发者',     '可构建场景、管理组件与数据源', TRUE),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'VIEWER',       '访客',       '仅可浏览已发布场景', TRUE)
ON CONFLICT DO NOTHING;

-- 超级管理员与租户管理员：全部权限
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT '30000000-0000-0000-0000-000000000001', id FROM sys_permission
ON CONFLICT DO NOTHING;
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT '30000000-0000-0000-0000-000000000002', id FROM sys_permission
ON CONFLICT DO NOTHING;

-- 开发者：场景、组件、资产、数据源全量 + 设备只读
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT '30000000-0000-0000-0000-000000000003', id FROM sys_permission
WHERE permission_code IN (
  'menu:scene','scene:view','scene:create','scene:edit','scene:delete','scene:publish',
  'menu:component','component:view','component:manage',
  'menu:asset','file:upload','file:delete',
  'menu:data','datasource:view','datasource:manage','device:view'
) ON CONFLICT DO NOTHING;

-- 访客：只读
INSERT INTO sys_role_permission (role_id, permission_id)
SELECT '30000000-0000-0000-0000-000000000004', id FROM sys_permission
WHERE permission_code IN ('menu:scene','scene:view','menu:component','component:view','menu:data','datasource:view','device:view')
ON CONFLICT DO NOTHING;

-- ---------- 用户 ----------
INSERT INTO sys_user (id, tenant_id, username, password, real_name, email, phone, status) VALUES
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'admin',
   '$2b$10$uSJLNozMpe3R0XkUkEJ/Ze/2Kp/S5UspcZHcmrDzw.epSzrrqwVxy', '平台管理员', 'admin@example.com', '13800000001', 1),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'dev',
   '$2b$10$jHWkX9N6MbLfcfxpwybe8u.mhjNBNLj.D.KYK35v8hm/pAieJN4l.', '孪生开发者', 'dev@example.com', '13800000002', 1),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'viewer',
   '$2b$10$iYK4y49Br10UEaPa.cP9Nupgzf2wcqwuESxI016LJt372//nkpdai', '业务访客', 'viewer@example.com', '13800000003', 1)
ON CONFLICT DO NOTHING;

INSERT INTO sys_user_role (user_id, role_id) VALUES
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;

-- ---------- 内置组件库 ----------
INSERT INTO sys_user (id, tenant_id, username, password, real_name, status)
VALUES ('40000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', '__system__',
        '$2b$10$uSJLNozMpe3R0XkUkEJ/Ze/2Kp/S5UspcZHcmrDzw.epSzrrqwVxy', '系统内置', 0)
ON CONFLICT DO NOTHING;

INSERT INTO biz_component (id, tenant_id, name, description, component_type, category, thumbnail, config_schema, is_public, version, creator_id) VALUES
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '三维模型', '加载 GLTF/GLB/FBX 精细模型，支持 LOD 与材质替换', 'MODEL_3D', 'SCENE_3D', NULL,
   '{"props":[{"key":"modelUrl","label":"模型地址","type":"model","group":"模型","required":true},{"key":"scale","label":"缩放","type":"number","default":1,"min":0.01,"max":1000,"group":"变换"},{"key":"castShadow","label":"投射阴影","type":"boolean","default":true,"group":"渲染"},{"key":"animationName","label":"播放动画","type":"string","group":"动画"}],"emits":[{"name":"click","label":"点击模型"},{"name":"hover","label":"悬浮模型"}],"actions":[{"name":"highlight","label":"高亮"},{"name":"playAnimation","label":"播放动画"}],"dataFields":[{"key":"status","label":"设备状态","type":"string"},{"key":"value","label":"实时数值","type":"number"}]}'::jsonb,
   TRUE, '1.0.0', '40000000-0000-0000-0000-000000000000'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '倾斜摄影/3D Tiles', '加载 3D Tiles 数据集，支持样式与压平', 'TILES_3D', 'SCENE_3D', NULL,
   '{"props":[{"key":"url","label":"数据集地址","type":"string","group":"数据","required":true},{"key":"maximumScreenSpaceError","label":"屏幕空间误差","type":"slider","default":16,"min":1,"max":64,"group":"性能"},{"key":"heightOffset","label":"高度偏移(米)","type":"number","default":0,"group":"变换"}],"emits":[{"name":"click","label":"点击要素"}]}'::jsonb,
   TRUE, '1.0.0', '40000000-0000-0000-0000-000000000000'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'POI 标注点', '地理位置标注，支持图标、文字与弹窗', 'POI', 'SCENE_3D', NULL,
   '{"props":[{"key":"label","label":"标注文字","type":"string","default":"标注点","group":"内容"},{"key":"icon","label":"图标","type":"image","group":"内容"},{"key":"color","label":"颜色","type":"color","default":"#1677ff","group":"样式"},{"key":"scaleByDistance","label":"随距离缩放","type":"boolean","default":true,"group":"样式"}],"emits":[{"name":"click","label":"点击标注"}]}'::jsonb,
   TRUE, '1.0.0', '40000000-0000-0000-0000-000000000000'),
  ('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '环境特效', '雨、雪、雾等环境粒子特效', 'PARTICLE', 'SCENE_3D', NULL,
   '{"props":[{"key":"effect","label":"特效类型","type":"select","default":"rain","options":[{"label":"雨","value":"rain"},{"label":"雪","value":"snow"},{"label":"雾","value":"fog"}],"group":"特效"},{"key":"intensity","label":"强度","type":"slider","default":0.5,"min":0,"max":1,"step":0.05,"group":"特效"}]}'::jsonb,
   TRUE, '1.0.0', '40000000-0000-0000-0000-000000000000'),
  ('50000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', '折线图', '时序趋势折线图，支持多系列与面积填充', 'CHART_LINE', 'CHART', NULL,
   '{"props":[{"key":"title","label":"标题","type":"string","default":"趋势分析","group":"基础"},{"key":"smooth","label":"平滑曲线","type":"boolean","default":true,"group":"样式"},{"key":"area","label":"面积填充","type":"boolean","default":true,"group":"样式"},{"key":"showLegend","label":"显示图例","type":"boolean","default":true,"group":"样式"}],"dataFields":[{"key":"categories","label":"X 轴分类","type":"array","required":true},{"key":"series","label":"数据系列","type":"array","required":true}]}'::jsonb,
   TRUE, '1.0.0', '40000000-0000-0000-0000-000000000000'),
  ('50000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', '指标卡', '关键指标展示，支持趋势与单位', 'METRIC_CARD', 'UI', NULL,
   '{"props":[{"key":"title","label":"指标名称","type":"string","default":"设备总数","group":"基础"},{"key":"value","label":"数值","type":"number","default":0,"group":"基础"},{"key":"unit","label":"单位","type":"string","group":"基础"},{"key":"trend","label":"趋势(%)","type":"number","group":"基础"},{"key":"color","label":"主色","type":"color","default":"#1677ff","group":"样式"}],"dataFields":[{"key":"value","label":"数值","type":"number","required":true}]}'::jsonb,
   TRUE, '1.0.0', '40000000-0000-0000-0000-000000000000'),
  ('50000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', '文本标签', '大屏文字，支持发光与描边', 'TEXT', 'UI', NULL,
   '{"props":[{"key":"content","label":"文本内容","type":"string","default":"数字孪生可视化","group":"内容"},{"key":"fontSize","label":"字号","type":"number","default":24,"group":"样式"},{"key":"color","label":"颜色","type":"color","default":"#1f2937","group":"样式"},{"key":"glow","label":"发光","type":"boolean","default":false,"group":"样式"}]}'::jsonb,
   TRUE, '1.0.0', '40000000-0000-0000-0000-000000000000'),
  ('50000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', '面板容器', '科技感边框容器，用于分组承载其他组件', 'PANEL', 'UI', NULL,
   '{"props":[{"key":"title","label":"面板标题","type":"string","default":"数据面板","group":"基础"},{"key":"opacity","label":"背景透明度","type":"slider","default":0.8,"min":0,"max":1,"step":0.05,"group":"样式"}]}'::jsonb,
   TRUE, '1.0.0', '40000000-0000-0000-0000-000000000000')
ON CONFLICT DO NOTHING;

-- ---------- 示例场景 ----------
INSERT INTO biz_scene (id, tenant_id, name, description, scene_type, engine_config, layout, status, version, publish_version, creator_id) VALUES
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '智慧园区数字孪生',
   '园区宏观地理 + 楼宇精细模型融合示范场景', 'HYBRID',
   '{"cesium":{"enabled":true,"imageryLayers":[{"id":"base-imagery","name":"影像底图","provider":"XYZ","url":"https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}","show":true,"alpha":1,"maximumLevel":18}],"terrain":{"enabled":false},"tilesets":[],"initialView":{"longitude":116.397428,"latitude":39.90923,"height":1500,"heading":20,"pitch":-35,"roll":0},"scene":{"globeShow":true,"skyAtmosphere":true,"fxaa":true,"depthTestAgainstTerrain":false,"maximumScreenSpaceError":16},"environment":{"rain":0,"snow":0,"fog":0,"enableLighting":false}},"threejs":{"enabled":true,"renderer":{"antialias":true,"pixelRatioLimit":2,"shadowMap":true,"toneMapping":"ACES_FILMIC","exposure":1},"environment":{"background":"#0b1220","ambientIntensity":0.6,"directionalIntensity":1.2,"directionalPosition":{"x":50,"y":80,"z":50}},"postProcessing":{"bloom":false,"outline":true,"ssao":false},"lod":{"enabled":true,"levels":[{"distance":100,"detail":"HIGH"},{"distance":500,"detail":"MEDIUM"},{"distance":2000,"detail":"LOW"},{"distance":10000,"detail":"HIDDEN"}],"autoDegradeFps":30,"autoDegradeMemoryMb":2048},"anchor":{"longitude":116.397428,"latitude":39.90923,"height":0}},"layers":[{"id":"layer-gis","name":"GIS 图层","visible":true,"sortOrder":0,"engine":"CESIUM"},{"id":"layer-model","name":"精细模型","visible":true,"sortOrder":1,"engine":"THREE"},{"id":"layer-ui","name":"大屏面板","visible":true,"sortOrder":2,"engine":"DOM"}],"canvas":{"width":1920,"height":1080,"fitMode":"CONTAIN","background":"transparent"},"performance":{"targetFps":60,"minFps":30,"maxMemoryMb":2048,"maxDrawCall":3000}}'::jsonb,
   '{"version":"1.0.0","nodes":[{"id":"node-title","type":"TEXT","name":"大屏标题","rect":{"x":660,"y":32,"width":600,"height":56,"zIndex":10},"props":{"content":"智慧园区运行监测中心","fontSize":34,"color":"#0f2c5c","glow":true}},{"id":"node-metric-1","type":"METRIC_CARD","name":"在线设备","rect":{"x":40,"y":120,"width":260,"height":120,"zIndex":5},"props":{"title":"在线设备","value":186,"unit":"台","trend":3.2,"color":"#1677ff"}},{"id":"node-chart-1","type":"CHART_LINE","name":"能耗趋势","rect":{"x":40,"y":260,"width":420,"height":260,"zIndex":5},"props":{"title":"园区能耗趋势","smooth":true,"area":true,"showLegend":true}}],"events":[],"variables":[]}'::jsonb,
   1, 3, 2, '40000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '变电站设备监测',
   '设备级精细模型与 IoT 遥测联动示范场景', 'MICRO',
   '{"cesium":{"enabled":false,"imageryLayers":[],"terrain":{"enabled":false},"tilesets":[],"initialView":{"longitude":113.264434,"latitude":23.129162,"height":300,"heading":0,"pitch":-30,"roll":0}},"threejs":{"enabled":true,"renderer":{"antialias":true,"pixelRatioLimit":2,"shadowMap":true,"toneMapping":"ACES_FILMIC","exposure":1.1},"environment":{"background":"#08111f","ambientIntensity":0.7,"directionalIntensity":1.4,"directionalPosition":{"x":30,"y":60,"z":40}},"postProcessing":{"bloom":true,"outline":true,"ssao":false},"lod":{"enabled":true,"levels":[{"distance":50,"detail":"HIGH"},{"distance":200,"detail":"MEDIUM"},{"distance":800,"detail":"LOW"}],"autoDegradeFps":30,"autoDegradeMemoryMb":2048},"anchor":{"longitude":113.264434,"latitude":23.129162,"height":0}},"layers":[{"id":"layer-model","name":"设备模型","visible":true,"sortOrder":0,"engine":"THREE"},{"id":"layer-ui","name":"大屏面板","visible":true,"sortOrder":1,"engine":"DOM"}],"canvas":{"width":1920,"height":1080,"fitMode":"CONTAIN","background":"transparent"},"performance":{"targetFps":60,"minFps":30,"maxMemoryMb":2048}}'::jsonb,
   '{"version":"1.0.0","nodes":[],"events":[],"variables":[]}'::jsonb,
   0, 1, NULL, '40000000-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

-- 场景版本快照（示例）
INSERT INTO biz_scene_version (id, scene_id, version_no, snapshot_data, change_log, creator_id) VALUES
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 1,
   '{"config":{},"components":[],"layout":{"version":"1.0.0","nodes":[],"events":[]}}'::jsonb, '初始版本', '40000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 2,
   '{"config":{},"components":[],"layout":{"version":"1.0.0","nodes":[],"events":[]}}'::jsonb, '新增能耗趋势图与指标卡', '40000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- ---------- 示例模板 ----------
INSERT INTO biz_template (id, tenant_id, name, description, category, template_data, is_public, creator_id) VALUES
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '智慧园区模板',
   '含园区底图、楼宇分层与运行指标面板', '智慧园区',
   '{"config":{},"components":[],"layout":{"version":"1.0.0","nodes":[],"events":[]}}'::jsonb, TRUE, '40000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '智能工厂模板',
   '产线设备布局与生产节拍看板', '智能制造',
   '{"config":{},"components":[],"layout":{"version":"1.0.0","nodes":[],"events":[]}}'::jsonb, TRUE, '40000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- ---------- 示例数据源与设备 ----------
INSERT INTO biz_data_source (id, tenant_id, name, type, config, status, creator_id) VALUES
  ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '园区业务库', 'PG',
   '{"host":"localhost","port":5432,"database":"digital_twin","username":"postgres","password":"root"}'::jsonb, 1, '40000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '设备遥测 MQTT', 'MQTT',
   '{"url":"mqtt://localhost:1883","clientId":"dt-platform","topic":"device/+/telemetry","username":"","password":""}'::jsonb, 0, '40000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '第三方能耗接口', 'HTTP',
   '{"baseUrl":"https://api.example.com","method":"GET","path":"/energy/latest","headers":{}}'::jsonb, 1, '40000000-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO iot_device (id, tenant_id, device_code, device_name, device_type, protocol, connection_config, status, last_online_at) VALUES
  ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'TRANS-001', '1 号主变压器', '变压器', 'MQTT',
   '{"topic":"device/TRANS-001/telemetry","qos":1}'::jsonb, 1, NOW()),
  ('90000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'FAN-002', '2 号冷却风机', '风机', 'MODBUS',
   '{"host":"192.168.1.30","port":502,"slaveId":2}'::jsonb, 1, NOW()),
  ('90000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'ENV-003', '环境监测终端', '环境传感器', 'OPC-UA',
   '{"endpoint":"opc.tcp://192.168.1.50:4840","nodeId":"ns=2;s=Env"}'::jsonb, 0, NULL)
ON CONFLICT DO NOTHING;

INSERT INTO iot_device_property (device_id, property_code, property_name, property_type, unit, min_value, max_value, default_value) VALUES
  ('90000000-0000-0000-0000-000000000001', 'temperature', '绕组温度', 'NUMBER', '°C', 0, 150, '65'),
  ('90000000-0000-0000-0000-000000000001', 'load',        '负载率',   'NUMBER', '%',  0, 120, '70'),
  ('90000000-0000-0000-0000-000000000002', 'speed',       '转速',     'NUMBER', 'rpm', 0, 3000, '1450'),
  ('90000000-0000-0000-0000-000000000002', 'vibration',   '振动',     'NUMBER', 'mm/s', 0, 20, '2.5'),
  ('90000000-0000-0000-0000-000000000003', 'humidity',    '湿度',     'NUMBER', '%RH', 0, 100, '55')
ON CONFLICT DO NOTHING;

INSERT INTO iot_alert_rule (id, tenant_id, device_id, property_code, rule_name, condition, threshold, alert_level, notify_channel, enabled) VALUES
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001',
   'temperature', '主变压器温度超限', '{"operator":">","value":95,"duration":30000}'::jsonb, 95, 3,
   '{"websocket":true,"sceneEffect":{"type":"FLASH","color":"#ff4d4f"}}'::jsonb, TRUE)
ON CONFLICT DO NOTHING;
