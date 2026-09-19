/**
 * 布局引擎纯逻辑出口（不含 Vue）。
 * 非浏览器消费方（Node 脚本、单测、未来的服务端布局校验）走这个入口。
 */
export * from './types';
export * from './geometry';
export * from './transform';
export * from './alignment';
export * from './drag-payload';
