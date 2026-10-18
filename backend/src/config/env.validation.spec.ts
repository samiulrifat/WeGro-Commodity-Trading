import { NodeEnv, validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
  KEY_MASTER_MNEMONIC:
    'test test test test test test test test test test test junk',
  PAYMENT_REF_SECRET: 'p'.repeat(32),
  IDENTITY_MASTER_KEY: 'ab'.repeat(32),
};

describe('validateEnv', () => {
  it('fills in defaults for everything optional', () => {
    const env = validateEnv(base);
    expect(env.NODE_ENV).toBe(NodeEnv.DEVELOPMENT);
    expect(env.PORT).toBe(3000);
    expect(env.CHAIN_ID).toBe(31337);
    expect(env.SWAGGER_ENABLED).toBe(true);
    expect(env.KEY_FUNDING_WEI).toBe('1000000000000000000');
    expect(env.INDEXER_ENABLED).toBe(true);
    expect(env.CHAIN_START_BLOCK).toBeUndefined();
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

  it('requires a valid seed phrase and payment-ref secret', () => {
    expect(() =>
      validateEnv({ ...base, KEY_MASTER_MNEMONIC: 'not a real phrase' }),
    ).toThrow(/KEY_MASTER_MNEMONIC/);
    // Right words, wrong checksum.
    expect(() =>
      validateEnv({
        ...base,
        KEY_MASTER_MNEMONIC:
          'test test test test test test test test test test test test',
      }),
    ).toThrow(/KEY_MASTER_MNEMONIC/);
    expect(() => validateEnv({ ...base, PAYMENT_REF_SECRET: 'short' })).toThrow(
      /PAYMENT_REF_SECRET/,
    );
    expect(() => validateEnv({ ...base, KEY_FUNDING_WEI: '1.5' })).toThrow(
      /KEY_FUNDING_WEI/,
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

  it('requires a 32-byte identity key and a short access token lifetime format', () => {
    expect(() =>
      validateEnv({ ...base, IDENTITY_MASTER_KEY: 'ab'.repeat(31) }),
    ).toThrow(/IDENTITY_MASTER_KEY/);
    expect(() =>
      validateEnv({ ...base, JWT_EXPIRES_IN: '15 minutes' }),
    ).toThrow(/JWT_EXPIRES_IN/);
    expect(validateEnv(base).JWT_EXPIRES_IN).toBe('15m');
  });

  it('refuses demo mode in production', () => {
    expect(validateEnv({ ...base, DEMO_MODE: 'true' }).DEMO_MODE).toBe(true);
    expect(() =>
      validateEnv({ ...base, DEMO_MODE: 'true', NODE_ENV: 'production' }),
    ).toThrow(/DEMO_MODE/);
  });

  it('writes SMS to the log unless told otherwise, and refuses that in production', () => {
    expect(validateEnv(base).SMS_PROVIDER).toBe('log');
    expect(validateEnv({ ...base, SMS_PROVIDER: 'memory' }).SMS_PROVIDER).toBe(
      'memory',
    );
    expect(() =>
      validateEnv({ ...base, SMS_PROVIDER: 'carrier-pigeon' }),
    ).toThrow(/SMS_PROVIDER/);
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /SMS_PROVIDER/,
    );
  });
});
