import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { InputValidationPipe } from './common/errors/validation';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { requestLogger } from './common/middleware/request-logger.middleware';
import { describeEnvelopes, PageMetaDto } from './common/swagger/envelope';
import { describeErrors } from './common/swagger/errors';
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
  // JSON shrinks 5 to 10 times: much of the wait on a phone on 4G. Not for
  // sign-in and session answers, which carry tokens (compressing secrets
  // next to what a request sends lets their length give them away: BREACH).
  app.use(
    compression({
      filter: (req, res) =>
        !req.url.startsWith(`/${API_PREFIX}/auth/`) &&
        compression.filter(req, res),
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
    new InputValidationPipe({
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
    SwaggerModule.setup(DOCS_PATH, app, buildOpenApiDocument(app));
  }
}

/**
 * The OpenAPI document, describing responses exactly as sent (envelope and
 * page meta included). Served at /docs; the frontend's API client and the
 * chain tests' response check are built from it.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  return describeErrors(
    describeEnvelopes(
      SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .setTitle('WeGro Commodity Trading Platform API')
          .setDescription(
            'Prototype API. Responses are wrapped as { data } (or { data, meta } for pages); ' +
              'errors as ErrorBody: { statusCode, error, message, code, details, path, requestId, timestamp }. No real money moves.',
          )
          .setVersion('0.1.0')
          .addBearerAuth()
          .build(),
        {
          extraModels: [PageMetaDto],
          // "Projects_list" rather than "ProjectsController_list": the names
          // generated clients use for their calls.
          operationIdFactory: (controller: string, method: string) =>
            `${controller.replace(/Controller$/, '')}_${method}`,
        },
      ),
    ),
  );
}
