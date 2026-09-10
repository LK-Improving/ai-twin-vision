/// <reference types="vite/client" />

/**
 * 环境变量类型声明（VITE_ 前缀，构建期由 Vite 注入）
 */
interface ImportMetaEnv {
  /** 应用标题 */
  readonly VITE_APP_TITLE: string;
  /** 接口基础路径（含版本前缀 /api/v1） */
  readonly VITE_API_BASE_URL: string;
  /** WebSocket 地址 */
  readonly VITE_WS_URL: string;
  /** 是否启用本地 Mock 适配器 */
  readonly VITE_USE_MOCK: string;
  /** Cesium Ion Token */
  readonly VITE_CESIUM_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Vue 单文件组件全局声明（无 nativets 支持时由 Vite 提供）
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

/** vite-plugin-cesium 注入的全局构建标志 */
declare module 'vite-plugin-cesium' {
  const cesium: (options?: Record<string, unknown>) => import('vite').Plugin;
  export default cesium;
}
