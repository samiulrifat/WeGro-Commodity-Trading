import 'reflect-metadata';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateBy,
  validateSync,
} from 'class-validator';
import { Mnemonic } from 'ethers';

export enum SmsProvider {
  LOG = 'log',
  MEMORY = 'memory',
}

export enum EmailProvider {
  LOG = 'log',
  MEMORY = 'memory',
}

export enum NodeEnv {
  DEVELOPMENT = 'development',
  TEST = 'test',
  PRODUCTION = 'production',
}

/**
 * "true"/"1" -> true; anything else -> false. Reads the raw value: implicit
 * conversion would already have turned the string "false" into true.
 */
const toBoolean = ({
  obj,
  key,
  value,
}: {
  obj: Record<string, unknown>;
  key: string;
  value: unknown;
}) => {
  const raw = key in obj ? obj[key] : value;
  return raw === true || raw === 'true' || raw === '1';
};

/** A valid BIP-39 phrase (word list and checksum). */
const IsMnemonic = () =>
  ValidateBy({
    name: 'isMnemonic',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && Mnemonic.isValidMnemonic(value.trim()),
      defaultMessage: () =>
        'KEY_MASTER_MNEMONIC must be a valid BIP-39 phrase (12 or 24 words)',
    },
  });

/**
 * Every environment variable the backend reads, with its default. The app
 * refuses to start if a required one is missing or malformed.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.DEVELOPMENT;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsUrl({ protocols: ['postgres', 'postgresql'], require_tld: false })
  DATABASE_URL: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  /** Access token lifetime: a number with s, m or h. Kept short; sessions renew through the refresh token. */
  @Matches(/^[1-9]\d*[smh]$/, {
    message: 'JWT_EXPIRES_IN must look like 15m, 900s or 1h',
  })
  JWT_EXPIRES_IN: string = '15m';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  REFRESH_TOKEN_TTL_DAYS: number = 7;

  /** Login attempts allowed per client per minute, on top of the per-account lockout. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  AUTH_THROTTLE_LIMIT: number = 10;

  /**
   * 32 random bytes as 64 hex characters. Encrypts personal details and keys
   * their lookup indexes and the password pepper (each a separate derived key).
   * Losing it makes stored personal details unreadable.
   */
  @Matches(/^[0-9a-fA-F]{64}$/, {
    message: 'IDENTITY_MASTER_KEY must be 64 hex characters (32 bytes)',
  })
  IDENTITY_MASTER_KEY: string;

  /**
   * Who sends text messages (codes, temporary passwords): `log` writes them to the
   * backend log (local work), `memory` keeps them for tests. A real SMS
   * provider is added here; production refuses both of these.
   */
  @IsEnum(SmsProvider)
  SMS_PROVIDER: SmsProvider = SmsProvider.LOG;

  /**
   * Who delivers email (codes confirming an address): `log` writes it to the
   * log, `memory` keeps it for tests. A real provider is added here;
   * production refuses both of these.
   */
  @IsEnum(EmailProvider)
  EMAIL_PROVIDER: EmailProvider = EmailProvider.LOG;

  /** Ready-made accounts, one per role, with password-free login. Never in production. */
  @Transform(toBoolean)
  @IsBoolean()
  DEMO_MODE: boolean = false;

  /** Comma-separated origins allowed to call the API (the frontend). */
  @IsString()
  CORS_ORIGINS: string = 'http://localhost:5173';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_TTL_SECONDS: number = 60;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = 100;

  @Transform(toBoolean)
  @IsBoolean()
  SWAGGER_ENABLED: boolean = true;

  @IsUrl({ protocols: ['http', 'https', 'ws', 'wss'], require_tld: false })
  CHAIN_RPC_URL: string = 'http://127.0.0.1:8545';

  @Type(() => Number)
  @IsInt()
  CHAIN_ID: number = 31337;

  /**
   * Seed every key is derived from: index 0 is the operator / super admin,
   * users get 1, 2, 3... Locally, Hardhat's default test mnemonic.
   */
  @IsMnemonic()
  KEY_MASTER_MNEMONIC: string;

  /** Test currency (wei) sent to a new key so it can pay fees; 0 disables (Besu with free gas). */
  @Matches(/^\d+$/, {
    message: 'KEY_FUNDING_WEI must be a whole number of wei',
  })
  KEY_FUNDING_WEI: string = '1000000000000000000';

  /** Secret for the keyed hash of payment references put on the ledger. */
  @IsString()
  @MinLength(32)
  PAYMENT_REF_SECRET: string;

  /** Blocks to wait after a transaction is mined before treating it as final. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  TX_CONFIRMATIONS: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  TX_TIMEOUT_MS: number = 30000;

  @Transform(toBoolean)
  @IsBoolean()
  INDEXER_ENABLED: boolean = true;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  INDEXER_POLL_MS: number = 1000;

  /** Largest block range fetched in one getLogs call. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  INDEXER_BATCH_BLOCKS: number = 2000;

  /** Blocks the indexer stays behind the head; 0 on instant-finality chains. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  INDEXER_CONFIRMATIONS: number = 0;

  /** Block to start indexing from. Unset: found automatically from the deployment. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  CHAIN_START_BLOCK?: number;

  /** Run background jobs (expiring reservations, ...). Off in tests that drive them by hand. */
  @Transform(toBoolean)
  @IsBoolean()
  JOBS_ENABLED: boolean = true;

  /** How often items past their ledger deadline (reservations, voucher sales) are released. */
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  EXPIRY_SWEEP_MS: number = 60_000;

  /** How often time-based reminders (deadlines, inactivity, expiring storage) are sent. */
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  REMINDER_SWEEP_MS: number = 300_000;

  /** How often sign-ups the ledger has not confirmed are sent again. */
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  SIGN_UP_RETRY_MS: number = 60_000;

  /** How often the indexer watchdog checks that the database keeps up with the ledger. */
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  WATCHDOG_INTERVAL_MS: number = 300_000;

  /** Blocks the indexer may fall behind the chain before admins are notified. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  WATCHDOG_LAG_BLOCKS: number = 100;

  /** The frontend's address: QR codes link to pages under it. */
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  PUBLIC_APP_URL: string = 'http://localhost:5173';

  /** Hardhat Ignition deployment folder holding the contract addresses. */
  @IsString()
  CONTRACTS_DEPLOYMENT_DIR: string =
    '../contracts/ignition/deployments/chain-31337';

  /** Local folder for uploaded photos. */
  @IsString()
  UPLOAD_DIR: string = './uploads';
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(env, { whitelist: false });
  if (errors.length > 0) {
    const problems = errors
      .map(
        (e) =>
          `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('; ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  if (env.DEMO_MODE && env.NODE_ENV === NodeEnv.PRODUCTION) {
    throw new Error(
      'Invalid environment configuration: DEMO_MODE cannot be on in production',
    );
  }
  // Codes written to a log or kept in memory would never reach anyone:
  // production needs a real SMS provider (none is added yet).
  const NOT_SENT: readonly SmsProvider[] = [
    SmsProvider.LOG,
    SmsProvider.MEMORY,
  ];
  if (
    env.NODE_ENV === NodeEnv.PRODUCTION &&
    NOT_SENT.includes(env.SMS_PROVIDER)
  ) {
    throw new Error(
      'Invalid environment configuration: set SMS_PROVIDER to a real SMS provider in production',
    );
  }
  if (
    env.NODE_ENV === NodeEnv.PRODUCTION &&
    [EmailProvider.LOG, EmailProvider.MEMORY].includes(env.EMAIL_PROVIDER)
  ) {
    throw new Error(
      'Invalid environment configuration: set EMAIL_PROVIDER to a real email provider in production',
    );
  }
  return env;
}
