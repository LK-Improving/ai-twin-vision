import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import cesium from 'vite-plugin-cesium';

/**
 * Vite 构建配置
 * - vue + cesium 插件
 * - 工作区源码包以别名直连 src，避免打包阶段依赖未构建产物
 * - /api 代理到本地后端（5173 → 3001），生产由网关/反向代理处理
 *
 * 后端端口默认 3001：3000 常被本机其他服务占用，改端口时设置 BACKEND_PORT 即可，
 * 需与根 .env.dev 的 API_PORT 保持一致。
 */
export default defineConfig(({ mode }) => {
  // mode 由 --mode 决定，默认 development / production
  void mode;
  const backendTarget = `http://localhost:${process.env.BACKEND_PORT ?? '3001'}`;
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
        '@dt/layout-engine': fileURLToPath(
          new URL('../../../packages/layout-engine/src', import.meta.url),
        ),
        '@dt/data-processor': fileURLToPath(
          new URL('../../../packages/data-processor/src', import.meta.url),
        ),
        '@dt/code-editor': fileURLToPath(
          new URL('../../../packages/code-editor/src', import.meta.url),
        ),
        '@dt/widgets': fileURLToPath(new URL('../../../packages/widgets/src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
        // 上传的 3D 模型 / 贴图由后端 /static 托管，dev 下同源代理过去，
        // 否则 GLTFLoader 取模型会 404
        '/static': {
          target: backendTarget,
          changeOrigin: true,
        },
        // Socket.IO 实时推送：同源走代理，生产由 Nginx 反代（详细设计 6.4）
        '/socket.io': {
          target: backendTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    // 让 Vite 正常预构建 Cesium：其内部 CJS 依赖（mersenne-twister 等）需要 esbuild 做 ESM
    // 互操作，否则会以未预构建的 ESM 源码形式提供，触发
    // "mersenne-twister does not provide an export named 'default'"，
    // 导致编辑器/预览模块图整体加载失败、页面空白。
    optimizeDeps: {
      include: ['cesium'],
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('cesium')) return 'vendor-cesium';
              if (id.includes('three') || id.includes('@dt/rendering-engine'))
                return 'vendor-three';
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
