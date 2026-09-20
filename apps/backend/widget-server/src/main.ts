import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import * as path from 'node:path';
import { AppModule } from './app.module';

/**
 * 模型/贴图等静态资源扩展名 → Content-Type 映射。
 * Express 自带的 mime 表对 .glb/.fbx 等可能给不出正确类型，显式补齐，
 * 便于浏览器与 GLTFLoader 正确处理（.wasm 必须为 application/wasm，否则流式实例化失败）。
 */
const MODEL_MIME: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.fbx': 'application/octet-stream',
  '.obj': 'text/plain; charset=utf-8',
  '.mtl': 'text/plain; charset=utf-8',
  '.drc': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.hdr': 'image/vnd.radiance',
  '.b3dm': 'application/octet-stream',
  '.pnts': 'application/octet-stream',
  '.i3dm': 'application/octet-stream',
  '.cmpt': 'application/octet-stream',
  '.wasm': 'application/wasm',
};

/**
 * 应用启动入口。
 *
 * 关键中间件：
 * - helmet：注入安全响应头（CSP 交由部署层按静态资源策略调整）
 * - compression：gzip 压缩，大屏场景 JSON 体积可观
 * - 全局前缀 api/v1 + URI 版本控制
 * - /static：托管上传目录（3D 模型、贴图、3D Tiles 切片）
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // 关闭 Nest 默认日志中的冗余上下文，交由 winston 统一输出
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const port = Number(config.get<number>('port') ?? 3000);
  const apiPrefix = config.get<string>('apiPrefix') ?? 'api';
  const apiVersion = config.get<string>('apiVersion') ?? 'v1';
  const corsOrigins = config.get<string[]>('corsOrigins') ?? ['http://localhost:5173'];
  const storageDir = config.get<string>('storage.localDir') ?? path.join(process.cwd(), 'uploads');
  // 与 FileService.toFileItem 返回的 url 前缀保持一致
  const staticPrefix = process.env.UPLOAD_URL_PREFIX ?? '/static';

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(compression());

  // 上传的模型/贴图通过 /static 暴露，供预览页与发布大屏直接加载
  app.useStaticAssets(storageDir, {
    prefix: `${staticPrefix}/`,
    index: false,
    fallthrough: true,
    setHeaders: (res, filePath) => {
      const mime = MODEL_MIME[path.extname(filePath).toLowerCase()];
      if (mime) res.setHeader('Content-Type', mime);
      // 文件名带 md5，内容不可变，可长期缓存
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  });

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id', 'X-Request-Id'],
  });

  // URI 版本控制：/api/v1/xxx
  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: apiVersion });

  // 全局校验管道（AppModule 已注册 APP_PIPE，此处显式声明保证顺序清晰）
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 优雅停机：K8s 滚动更新时先摘流量再关闭连接
  app.enableShutdownHooks();

  // Swagger 文档：生产环境可通过 ENABLE_SWAGGER=false 关闭
  if (process.env.ENABLE_SWAGGER !== 'false') {
    const doc = new DocumentBuilder()
      .setTitle('企业级数字孪生低代码平台 API')
      .setDescription('场景编排、组件管理、数据接入与系统管理的后端接口文档')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build();
    const document = SwaggerModule.createDocument(app, doc);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(port, '0.0.0.0');

  const url = await app.getUrl();
  // eslint-disable-next-line no-console
  console.log(`服务已启动：${url}/${apiPrefix}/${apiVersion}`);
  if (process.env.ENABLE_SWAGGER !== 'false') {
    // eslint-disable-next-line no-console
    console.log(`接口文档：${url}/${apiPrefix}/docs`);
  }
}

void bootstrap();
