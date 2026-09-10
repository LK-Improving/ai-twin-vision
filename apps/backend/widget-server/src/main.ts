import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';

/**
 * 应用启动入口。
 *
 * 关键中间件：
 * - helmet：注入安全响应头（CSP 交由部署层按静态资源策略调整）
 * - compression：gzip 压缩，大屏场景 JSON 体积可观
 * - 全局前缀 api/v1 + URI 版本控制
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // 关闭 Nest 默认日志中的冗余上下文，交由 winston 统一输出
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const port = Number(config.get<number>('port') ?? 3000);
  const apiPrefix = config.get<string>('apiPrefix') ?? 'api';
  const apiVersion = config.get<string>('apiVersion') ?? 'v1';
  const corsOrigins = config.get<string[]>('corsOrigins') ?? ['http://localhost:5173'];

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(compression());

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
