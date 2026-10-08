import 'reflect-metadata';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
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

/**
 * Every environment variable the backend reads, with its default. The app
 * refuses to start if a required one is missing or malformed.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

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

  @IsString()
  JWT_EXPIRES_IN: string = '1h';

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

  /** Seed every person's key is derived from. Required from Phase 1 on. */
  @IsOptional()
  @IsString()
  KEY_MASTER_MNEMONIC?: string;

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
  return env;
}
