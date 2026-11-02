import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { API_PREFIX, configureApp, DOCS_PATH } from './app.setup';
import type { EnvironmentVariables } from './config/env.validation';

/** Starts the API: the whole app, its HTTP pipeline, on PORT. */
export async function bootstrap(): Promise<void> {
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
// Started as the program; imported (by tests), it waits to be called.
/* istanbul ignore if -- true only when started by npm run; tests call bootstrap() */
if (require.main === module) void bootstrap();
