import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodeEnv, type EnvironmentVariables } from '../config/env.validation';
import { SnakeNamingStrategy } from './snake-naming.strategy';

/**
 * PostgreSQL through TypeORM. Schema changes go through migrations only; the
 * schema is never synchronised automatically.
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
        logging:
          config.get('NODE_ENV', { infer: true }) === NodeEnv.Development
            ? ['error' as const, 'warn' as const, 'migration' as const]
            : ['error' as const],
      }),
    }),
  ],
})
export class DatabaseModule {}
