import {
  Body,
  Controller,
  Get,
  Global,
  INestApplication,
  Module,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { IsInt, IsString, Min } from 'class-validator';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { configureApp } from '../src/app.setup';
import { RawResponse } from '../src/common/decorators/raw-response.decorator';
import {
  Paginated,
  PaginationQueryDto,
} from '../src/common/dto/pagination.dto';
import {
  type EnvironmentVariables,
  validateEnv,
} from '../src/config/env.validation';
import { HealthModule } from '../src/modules/health/health.module';

class EchoDto {
  @IsString()
  name: string;

  @IsInt()
  @Min(1)
  slots: number;
}

/** Endpoints that exercise the shared HTTP pipeline. */
@Controller('probe')
class ProbeController {
  @Get('items')
  list(@Query() query: PaginationQueryDto) {
    return new Paginated([{ n: 1 }, { n: 2 }], 41, query);
  }

  @Post('echo')
  echo(@Body() dto: EchoDto) {
    return dto;
  }

  @Get('boom')
  boom() {
    throw new Error('internal detail: db password=abc');
  }

  @Get('csv')
  @RawResponse()
  csv() {
    return 'a,b\n1,2';
  }
}

const dbQuery = jest.fn();

/** Stands in for DatabaseModule: a DataSource whose query() the tests control. */
@Global()
@Module({
  providers: [{ provide: DataSource, useValue: { query: dbQuery } }],
  exports: [DataSource],
})
class FakeDatabaseModule {}

/**
 * AppModule without a real database (the DataSource is a stub). Built inside a
 * function because ConfigModule validates the environment when the module is
 * defined, so each suite sets its env first.
 */
function buildTestModule(env: Record<string, string>) {
  Object.assign(process.env, {
    DATABASE_URL: 'postgres://test:test@localhost:5432/test',
    JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
    NODE_ENV: 'test',
    ...env,
  });

  @Module({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        validate: validateEnv,
      }),
      ThrottlerModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
          throttlers: [
            {
              ttl: config.get('THROTTLE_TTL_SECONDS', { infer: true }) * 1000,
              limit: config.get('THROTTLE_LIMIT', { infer: true }),
            },
          ],
        }),
      }),
      FakeDatabaseModule,
      HealthModule,
    ],
    controllers: [ProbeController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  })
  class TestAppModule {}
  return TestAppModule;
}

async function startApp(
  env: Record<string, string>,
): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [buildTestModule(env)],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    logger: false,
  });
  configureApp(app);
  await app.init();
  return app;
}

describe('HTTP pipeline (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await startApp({ THROTTLE_LIMIT: '1000' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health', () => {
    it('reports ok when the database answers', async () => {
      dbQuery.mockResolvedValueOnce([{ '?column?': 1 }]);
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);
      expect(res.body.data).toMatchObject({ status: 'ok', database: 'up' });
      expect(typeof res.body.data.uptimeSeconds).toBe('number');
    });

    it('returns 503 when the database is down', async () => {
      dbQuery.mockRejectedValueOnce(new Error('connection refused'));
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(503);
      expect(res.body).toMatchObject({
        statusCode: 503,
        message: 'Database unavailable',
        path: '/api/health',
      });
    });
  });

  describe('response envelope', () => {
    it('wraps a page as { data, meta }', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/probe/items?page=2&limit=10')
        .expect(200);
      expect(res.body).toEqual({
        data: [{ n: 1 }, { n: 2 }],
        meta: { page: 2, limit: 10, total: 41, totalPages: 5 },
      });
    });

    it('leaves raw responses unwrapped', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/probe/csv')
        .expect(200);
      expect(res.text).toBe('a,b\n1,2');
    });
  });

  describe('validation', () => {
    it('accepts and wraps a valid body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/probe/echo')
        .send({ name: 'Nasrin', slots: 4 })
        .expect(201);
      expect(res.body).toEqual({ data: { name: 'Nasrin', slots: 4 } });
    });

    it('rejects bad and unknown fields with a 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/probe/echo')
        .send({ name: 'Nasrin', slots: 0, admin: true })
        .expect(400);
      expect(res.body.statusCode).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'property admin should not exist',
          'slots must not be less than 1',
        ]),
      );
    });

    it('rejects a bad page size', async () => {
      await request(app.getHttpServer())
        .get('/api/probe/items?limit=500')
        .expect(400);
    });
  });

  describe('errors', () => {
    it('hides internal error details behind a plain 500', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/probe/boom')
        .expect(500);
      expect(res.body.message).toBe('Something went wrong. Please try again.');
      expect(JSON.stringify(res.body)).not.toContain('password');
    });

    it('returns the standard shape for unknown routes, with a request id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/nope')
        .set('x-request-id', 'trace-123')
        .expect(404);
      expect(res.headers['x-request-id']).toBe('trace-123');
      expect(res.body).toMatchObject({
        statusCode: 404,
        error: 'Not Found',
        path: '/api/nope',
        requestId: 'trace-123',
      });
      expect(typeof res.body.timestamp).toBe('string');
    });
  });

  describe('security and docs', () => {
    it('sets security headers and allows the frontend origin', async () => {
      dbQuery.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', 'http://localhost:5173')
        .expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['access-control-allow-origin']).toBe(
        'http://localhost:5173',
      );
    });

    it('does not allow other origins', async () => {
      dbQuery.mockResolvedValueOnce([]);
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', 'https://evil.example');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('serves the OpenAPI document', async () => {
      const res = await request(app.getHttpServer())
        .get('/docs-json')
        .expect(200);
      expect(res.body.info.title).toBe('WeGro Commodity Trading Platform API');
      expect(res.body.paths['/api/health']).toBeDefined();
    });
  });
});

describe('rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await startApp({ THROTTLE_LIMIT: '3' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 429 once a client goes over the limit', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 3; i++)
      await request(server).get('/api/probe/items').expect(200);
    const res = await request(server).get('/api/probe/items').expect(429);
    expect(res.body.statusCode).toBe(429);
  });

  it('never limits the health check', async () => {
    dbQuery.mockResolvedValue([]);
    for (let i = 0; i < 5; i++)
      await request(app.getHttpServer()).get('/api/health').expect(200);
  });
});
