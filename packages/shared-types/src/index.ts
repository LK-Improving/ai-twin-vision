/**
 * @dt/shared-types
 * 企业级数字孪生低代码平台 — 前后端共享接口契约
 *
 * 后端（NestJS）与前端（Vue3）引用同一份类型定义，
 * 保证「文档先行 → 类型安全 → 并行开发」的联调流程（详细设计 3.1）。
 */

// ---------- 通用 ----------
export * from './common/response';
export * from './common/error-code';
export * from './common/enums';

// ---------- 业务契约 ----------
export * from './dto/auth';
export * from './dto/engine';
export * from './dto/lowcode';
export * from './dto/scene';
export * from './dto/component';
export * from './dto/file';
export * from './dto/data';
export * from './dto/system';

/** 契约版本，用于前后端兼容性校验 */
export const CONTRACT_VERSION = '1.0.0';

/** API 版本前缀 */
export const API_PREFIX = '/api/v1';
