import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const listen = jest.fn(() => Promise.resolve());
const settings: Record<string, unknown> = { PORT: 3100, SWAGGER_ENABLED: true };
jest.mock('@nestjs/core', () => ({
  ...jest.requireActual<object>('@nestjs/core'),
  NestFactory: {
    create: jest.fn(() =>
      Promise.resolve({
        listen,
        get: (token: unknown) =>
          token === ConfigService
            ? { get: (key: string) => settings[key] }
            : undefined,
      }),
    ),
  },
}));
const configureApp = jest.fn();
jest.mock('./app.setup', () => ({
  ...jest.requireActual<object>('./app.setup'),
  configureApp,
}));
// The whole app is not built here: only how it is started.
jest.mock('./app.module', () => ({ AppModule: class {} }));

import { bootstrap } from './main';

/** Starting the API: the shared pipeline, the port from settings, where to find it. */
describe('bootstrap', () => {
  afterEach(() => jest.restoreAllMocks());

  it('applies the HTTP pipeline, listens on PORT and says where the docs are', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    await bootstrap();
    expect(configureApp).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith(3100);
    expect(log.mock.calls.map(([m]) => m)).toEqual([
      'API on http://localhost:3100/api',
      'Docs on http://localhost:3100/docs',
    ]);
  });

  it('does not mention the docs when they are off', async () => {
    settings.SWAGGER_ENABLED = false;
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    await bootstrap();
    expect(log.mock.calls.map(([m]) => m)).toEqual([
      'API on http://localhost:3100/api',
    ]);
  });
});
