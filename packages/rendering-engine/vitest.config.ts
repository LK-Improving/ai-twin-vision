import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * rendering-engine 单测配置：只覆盖不依赖浏览器/Cesium 运行时的纯逻辑层
 * （坐标与类型工具、事件总线、LOD 决策）。引擎实体（CesiumEngine / ThreeEngine）
 * 需要 WebGL 与 GL 上下文，属迭代 5 里 Playwright e2e 的范围，不在这里伪装成单测。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@dt/shared-types': fileURLToPath(new URL('../shared-types/src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
