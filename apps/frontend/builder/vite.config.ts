import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import cesium from 'vite-plugin-cesium';

/**
 * Vite 构建配置
 * - vue + cesium 插件
 * - 工作区源码包以别名直连 src，避免打包阶段依赖未构建产物
 * - /api 代理到本地后端（5173 → 3000），生产由网关/反向代理处理
 */
export default defineConfig(({ mode }) => {
  // mode 由 --mode 决定，默认 development / production
  void mode;
  return {
    plugins: [vue(), cesium()],
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
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    // cesium 体积庞大，需排除预构建以避免重复实例化
    optimizeDeps: {
      exclude: ['cesium'],
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('cesium')) return 'vendor-cesium';
              if (id.includes('three') || id.includes('@dt/rendering-engine')) return 'vendor-three';
              if (id.includes('echarts') || id.includes('zrender')) return 'vendor-echarts';
              if (
                id.includes('vue') ||
                id.includes('vue-router') ||
                id.includes('pinia') ||
                id.includes('@vue')
              ) {
                return 'vendor-vue';
              }
              if (id.includes('axios')) return 'vendor-axios';
            }
            return undefined;
          },
        },
      },
    },
  };
});
