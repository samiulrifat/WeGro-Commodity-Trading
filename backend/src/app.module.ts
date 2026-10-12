import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  type EnvironmentVariables,
  validateEnv,
} from './config/env.validation';
import { BlockchainModule } from './blockchain/blockchain.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { AUTH_THROTTLE } from './modules/auth/decorators';
import { JwtAuthGuard, RolesGuard } from './modules/auth/guards';
import { FieldRecordsModule } from './modules/field-records/field-records.module';
import { HealthModule } from './modules/health/health.module';
import { ParticipantsModule } from './modules/participants/participants.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { UsersModule } from './modules/users/users.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get('THROTTLE_TTL_SECONDS', { infer: true }) * 1000,
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
          {
            // Sign-in endpoints only: a much tighter budget against password guessing.
            name: 'auth',
            ttl: 60_000,
            limit: config.get('AUTH_THROTTLE_LIMIT', { infer: true }),
            skipIf: (ctx) =>
              Reflect.getMetadata(AUTH_THROTTLE, ctx.getHandler()) !== true,
          },
        ],
      }),
    }),
    DatabaseModule,
    BlockchainModule,
    CryptoModule,
    UsersModule,
    AuthModule,
    ParticipantsModule,
    CatalogModule,
    ProjectsModule,
    VouchersModule,
    FieldRecordsModule,
    HealthModule,
  ],
  // In this order: rate limit, then authenticate, then check the role.
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
