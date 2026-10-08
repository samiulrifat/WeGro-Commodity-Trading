import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { requestLogger } from './common/middleware/request-logger.middleware';
import type { EnvironmentVariables } from './config/env.validation';

export const API_PREFIX = 'api';
export const DOCS_PATH = 'docs';

/**
 * Everything applied to the HTTP app, shared by `main.ts` and the e2e tests so
 * both run the same pipeline.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const swaggerEnabled = config.get('SWAGGER_ENABLED', { infer: true });

  app.use(requestLogger);
  app.use(
    helmet({
      // Swagger UI needs inline scripts and styles; the API itself serves JSON only.
      contentSecurityPolicy: swaggerEnabled
        ? {
            directives: {
              'script-src': ["'self'", "'unsafe-inline'"],
              'style-src': ["'self'", "'unsafe-inline'"],
              'img-src': ["'self'", 'data:'],
            },
          }
        : undefined,
    }),
  );
  app.enableCors({
    origin: config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
  });

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(
    new ResponseEnvelopeInterceptor(app.get(Reflector)),
  );
  app.enableShutdownHooks();

  if (swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('WeGro Commodity Trading Platform API')
        .setDescription(
          'Prototype API. Responses are wrapped as { data } (or { data, meta } for pages); ' +
            'errors as { statusCode, error, message, path, requestId, timestamp }. No real money moves.',
        )
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(DOCS_PATH, app, document);
  }
}
