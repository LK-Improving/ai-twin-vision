import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * 单测专用配置：不复用 vite.config.ts，避免 vue/cesium 插件在 node 环境下
 * 参与模块转换（Cesium 资产复制等逻辑对单测无意义且显著拖慢）。
 * 别名需与 vite.config.ts 保持一致，否则被测代码里的 @/ 导入会解析失败。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@dt/shared-types': fileURLToPath(
        new URL('../../../packages/shared-types/src', import.meta.url),
      ),
      '@dt/rendering-engine': fileURLToPath(
        new URL('../../../packages/rendering-engine/src', import.meta.url),
      ),
      '@dt/widgets': fileURLToPath(new URL('../../../packages/widgets/src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
