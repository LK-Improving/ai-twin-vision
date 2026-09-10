/**
 * 错误码规范（详细设计文档 4.1.4）
 * 2xx 成功 / 4xx 客户端错误 / 5xx 服务端错误
 * 业务错误码分段：
 *   10000-19999 通用业务
 *   20000-29999 场景模块
 *   30000-39999 组件模块
 *   40000-49999 数据模块
 *   50000-59999 系统模块
 */
export enum BizCode {
  // ---------- HTTP 语义码 ----------
  SUCCESS = 200,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  PAYLOAD_TOO_LARGE = 413,
  UNSUPPORTED_MEDIA_TYPE = 415,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,

  // ---------- 10000-19999 通用业务 ----------
  COMMON_PARAM_INVALID = 10001,
  COMMON_RESOURCE_NOT_FOUND = 10002,
  COMMON_OPERATION_FAILED = 10003,
  COMMON_DUPLICATE_NAME = 10004,
  TOKEN_EXPIRED = 10010,
  TOKEN_INVALID = 10011,
  REFRESH_TOKEN_INVALID = 10012,
  ACCOUNT_DISABLED = 10013,
  ACCOUNT_OR_PASSWORD_ERROR = 10014,
  OLD_PASSWORD_MISMATCH = 10015,
  PERMISSION_DENIED = 10016,
  TENANT_EXPIRED = 10017,

  // ---------- 20000-29999 场景模块 ----------
  SCENE_NOT_FOUND = 20001,
  SCENE_VALIDATE_FAILED = 20002,
  SCENE_NAME_DUPLICATE = 20003,
  SCENE_PUBLISH_FAILED = 20004,
  SCENE_VERSION_NOT_FOUND = 20005,
  SCENE_LOCKED_BY_OTHER = 20006,
  SCENE_CLONE_FAILED = 20007,

  // ---------- 30000-39999 组件模块 ----------
  COMPONENT_NOT_FOUND = 30001,
  COMPONENT_SCHEMA_INVALID = 30002,
  COMPONENT_IN_USE = 30003,
  COMPONENT_TYPE_UNSUPPORTED = 30004,
  TEMPLATE_NOT_FOUND = 30010,

  // ---------- 40000-49999 数据模块 ----------
  DATA_SOURCE_NOT_FOUND = 40001,
  DATA_SOURCE_CONNECT_FAILED = 40002,
  DATA_MAPPING_INVALID = 40003,
  DEVICE_NOT_FOUND = 40010,
  DEVICE_OFFLINE = 40011,
  ALERT_RULE_INVALID = 40012,
  SCRIPT_EXECUTE_FAILED = 40020,

  // ---------- 50000-59999 系统模块 ----------
  FILE_TYPE_NOT_ALLOWED = 50001,
  FILE_TOO_LARGE = 50002,
  FILE_UPLOAD_FAILED = 50003,
  FILE_NOT_FOUND = 50004,
  STORAGE_UNAVAILABLE = 50005,
  USER_NOT_FOUND = 50010,
  USERNAME_DUPLICATE = 50011,
  ROLE_NOT_FOUND = 50012,
  ROLE_IN_USE = 50013,
  SYSTEM_ROLE_READONLY = 50014,
}

/** 错误码 → 默认中文提示 */
export const BIZ_CODE_MESSAGE: Record<number, string> = {
  [BizCode.SUCCESS]: 'success',
  [BizCode.BAD_REQUEST]: '请求参数错误',
  [BizCode.UNAUTHORIZED]: '未认证或令牌已失效',
  [BizCode.FORBIDDEN]: '权限不足',
  [BizCode.NOT_FOUND]: '资源不存在',
  [BizCode.CONFLICT]: '资源冲突',
  [BizCode.PAYLOAD_TOO_LARGE]: '请求体过大',
  [BizCode.UNSUPPORTED_MEDIA_TYPE]: '不支持的媒体类型',
  [BizCode.TOO_MANY_REQUESTS]: '请求过于频繁，请稍后再试',
  [BizCode.INTERNAL_ERROR]: '服务器内部错误',
  [BizCode.SERVICE_UNAVAILABLE]: '服务暂不可用',

  [BizCode.COMMON_PARAM_INVALID]: '参数校验失败',
  [BizCode.COMMON_RESOURCE_NOT_FOUND]: '资源不存在',
  [BizCode.COMMON_OPERATION_FAILED]: '操作失败',
  [BizCode.COMMON_DUPLICATE_NAME]: '名称已存在',
  [BizCode.TOKEN_EXPIRED]: '访问令牌已过期',
  [BizCode.TOKEN_INVALID]: '访问令牌无效',
  [BizCode.REFRESH_TOKEN_INVALID]: '刷新令牌无效或已过期',
  [BizCode.ACCOUNT_DISABLED]: '账号已被禁用',
  [BizCode.ACCOUNT_OR_PASSWORD_ERROR]: '用户名或密码错误',
  [BizCode.OLD_PASSWORD_MISMATCH]: '原密码不正确',
  [BizCode.PERMISSION_DENIED]: '无权执行该操作',
  [BizCode.TENANT_EXPIRED]: '租户服务已到期',

  [BizCode.SCENE_NOT_FOUND]: '场景不存在',
  [BizCode.SCENE_VALIDATE_FAILED]: '场景存在未解决的校验错误',
  [BizCode.SCENE_NAME_DUPLICATE]: '场景名称已存在',
  [BizCode.SCENE_PUBLISH_FAILED]: '场景发布失败',
  [BizCode.SCENE_VERSION_NOT_FOUND]: '场景版本不存在',
  [BizCode.SCENE_LOCKED_BY_OTHER]: '场景正被其他成员编辑',
  [BizCode.SCENE_CLONE_FAILED]: '场景克隆失败',

  [BizCode.COMPONENT_NOT_FOUND]: '组件不存在',
  [BizCode.COMPONENT_SCHEMA_INVALID]: '组件配置 Schema 非法',
  [BizCode.COMPONENT_IN_USE]: '组件已被场景引用，无法删除',
  [BizCode.COMPONENT_TYPE_UNSUPPORTED]: '不支持的组件类型',
  [BizCode.TEMPLATE_NOT_FOUND]: '模板不存在',

  [BizCode.DATA_SOURCE_NOT_FOUND]: '数据源不存在',
  [BizCode.DATA_SOURCE_CONNECT_FAILED]: '数据源连通性测试失败',
  [BizCode.DATA_MAPPING_INVALID]: '数据映射规则非法',
  [BizCode.DEVICE_NOT_FOUND]: '设备不存在',
  [BizCode.DEVICE_OFFLINE]: '设备离线',
  [BizCode.ALERT_RULE_INVALID]: '告警规则非法',
  [BizCode.SCRIPT_EXECUTE_FAILED]: '脚本执行失败',

  [BizCode.FILE_TYPE_NOT_ALLOWED]: '不允许的文件类型',
  [BizCode.FILE_TOO_LARGE]: '文件超出大小限制',
  [BizCode.FILE_UPLOAD_FAILED]: '文件上传失败',
  [BizCode.FILE_NOT_FOUND]: '文件不存在',
  [BizCode.STORAGE_UNAVAILABLE]: '对象存储不可用',
  [BizCode.USER_NOT_FOUND]: '用户不存在',
  [BizCode.USERNAME_DUPLICATE]: '用户名已存在',
  [BizCode.ROLE_NOT_FOUND]: '角色不存在',
  [BizCode.ROLE_IN_USE]: '角色已分配用户，无法删除',
  [BizCode.SYSTEM_ROLE_READONLY]: '系统内置角色不可修改',
};

/** 获取错误码对应的默认文案 */
export function resolveBizMessage(code: number, fallback = '操作失败'): string {
  return BIZ_CODE_MESSAGE[code] ?? fallback;
}

/** 业务码映射到 HTTP 状态码（供 Exception Filter 使用） */
export function toHttpStatus(code: number): number {
  if (code >= 100 && code < 600) return code;
  // 认证/权限类业务码需要回落到 401/403，前端拦截器依赖
  if (
    code === BizCode.TOKEN_EXPIRED ||
    code === BizCode.TOKEN_INVALID ||
    code === BizCode.REFRESH_TOKEN_INVALID ||
    code === BizCode.ACCOUNT_OR_PASSWORD_ERROR ||
    code === BizCode.ACCOUNT_DISABLED
  ) {
    return 401;
  }
  if (code === BizCode.PERMISSION_DENIED || code === BizCode.TENANT_EXPIRED) {
    return 403;
  }
  if (
    code === BizCode.SCENE_NOT_FOUND ||
    code === BizCode.COMPONENT_NOT_FOUND ||
    code === BizCode.DATA_SOURCE_NOT_FOUND ||
    code === BizCode.DEVICE_NOT_FOUND ||
    code === BizCode.FILE_NOT_FOUND ||
    code === BizCode.USER_NOT_FOUND ||
    code === BizCode.TEMPLATE_NOT_FOUND ||
    code === BizCode.SCENE_VERSION_NOT_FOUND ||
    code === BizCode.ROLE_NOT_FOUND ||
    code === BizCode.COMMON_RESOURCE_NOT_FOUND
  ) {
    return 404;
  }
  // 其余业务错误统一 200 承载（前端按 code 分支），保持 RESTful 语义清晰
  return 400;
}
