import 'reflect-metadata';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { AppEnv } from '@adpulse/config';
import type { Logger } from '@adpulse/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { AppModule } from './app.module';
import type { AppRequest } from './common/request-context';
import { requestIdMiddleware } from './common/request-id.middleware';
import { APP_ENV, LOGGER } from './infra/tokens';
import { CSRF_HEADER } from './modules/auth/auth-cookies';

export const API_PREFIX = 'api/v1';

function allowedOrigins(env: AppEnv): string[] {
  const extra =
    env.CORS_ORIGINS?.split(',')
      .map((o) => o.trim())
      .filter(Boolean) ?? [];
  return [...new Set([env.WEB_URL, ...extra])];
}

export function configureApp(app: NestExpressApplication, env: AppEnv, logger: Logger): void {
  app.set('trust proxy', env.TRUST_PROXY ? 1 : false);
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '100kb', extended: false });

  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as AppRequest).requestId,
      autoLogging: { ignore: (req) => (req.url ?? '').includes('/health') },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      strictTransportSecurity:
        env.NODE_ENV === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  app.use(cookieParser());

  const origins = allowedOrigins(env);
  app.enableCors({
    origin: (origin, callback) => callback(null, !origin || origins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Organization-Id',
      'X-Request-Id',
      'Idempotency-Key',
      CSRF_HEADER,
    ],
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    maxAge: 600,
  });

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
      validationError: { target: false, value: false },
    }),
  );
  app.enableShutdownHooks();

  if (env.SWAGGER_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle('ADPULSE API')
      .setDescription(
        'Google Ads performance management platform. Organization-scoped routes require the X-Organization-Id header.',
      )
      .setVersion(env.APP_VERSION)
      .addCookieAuth('adpulse_at')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Organization-Id' }, 'organization')
      .addSecurityRequirements('organization')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, document, {
      jsonDocumentUrl: `${API_PREFIX}/docs/openapi.json`,
    });
  }
}

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  const env = app.get<AppEnv>(APP_ENV);
  const logger = app.get<Logger>(LOGGER);
  app.useLogger({
    log: (message: unknown) => logger.debug(String(message)),
    error: (message: unknown, trace?: unknown) => logger.error({ trace }, String(message)),
    warn: (message: unknown) => logger.warn(String(message)),
    debug: (message: unknown) => logger.debug(String(message)),
    verbose: (message: unknown) => logger.trace(String(message)),
  });
  configureApp(app, env, logger);
  return app;
}
