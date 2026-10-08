import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { API_PREFIX, configureApp, DOCS_PATH } from './app.setup';
import type { EnvironmentVariables } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API on http://localhost:${port}/${API_PREFIX}`);
  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    logger.log(`Docs on http://localhost:${port}/${DOCS_PATH}`);
  }
}
void bootstrap();
