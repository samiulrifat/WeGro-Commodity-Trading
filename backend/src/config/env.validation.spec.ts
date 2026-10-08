import { NodeEnv, validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('fills in defaults for everything optional', () => {
    const env = validateEnv(base);
    expect(env.NODE_ENV).toBe(NodeEnv.Development);
    expect(env.PORT).toBe(3000);
    expect(env.CHAIN_ID).toBe(31337);
    expect(env.SWAGGER_ENABLED).toBe(true);
    expect(env.KEY_MASTER_MNEMONIC).toBeUndefined();
  });

  it('turns env strings into numbers and booleans', () => {
    const env = validateEnv({
      ...base,
      PORT: '8080',
      THROTTLE_LIMIT: '5',
      SWAGGER_ENABLED: 'false',
    });
    expect(env.PORT).toBe(8080);
    expect(env.THROTTLE_LIMIT).toBe(5);
    expect(env.SWAGGER_ENABLED).toBe(false);
  });

  it('requires a database URL and a long JWT secret', () => {
    expect(() => validateEnv({ JWT_SECRET: 'x'.repeat(32) })).toThrow(
      /DATABASE_URL/,
    );
    expect(() => validateEnv({ ...base, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('rejects malformed values', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: 'mysql://x/y' })).toThrow(
      /DATABASE_URL/,
    );
    expect(() => validateEnv({ ...base, PORT: '70000' })).toThrow(/PORT/);
    expect(() => validateEnv({ ...base, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });
});
