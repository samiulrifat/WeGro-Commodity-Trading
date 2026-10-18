import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodeEnv, type EnvironmentVariables } from '../config/env.validation';
import { SnakeNamingStrategy } from './snake-naming.strategy';

/**
 * PostgreSQL through TypeORM. Schema changes through migrations.
 * No auto schema synchronisation.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        type: 'postgres' as const,
        url: config.get('DATABASE_URL', { infer: true }),
        autoLoadEntities: true,
        synchronize: false,
        migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
        migrationsRun: false,
        namingStrategy: new SnakeNamingStrategy(),
        // uuid defaults via gen_random_uuid(), built into PostgreSQL 13+: no extension to install.
        uuidExtension: 'pgcrypto' as const,
        logging:
          config.get('NODE_ENV', { infer: true }) === NodeEnv.DEVELOPMENT
            ? ['error' as const, 'warn' as const, 'migration' as const]
            : ['error' as const],
      }),
    }),
  ],
})
export class DatabaseModule {}
