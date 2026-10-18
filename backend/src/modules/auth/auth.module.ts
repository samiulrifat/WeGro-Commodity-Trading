import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  type EnvironmentVariables,
  SmsProvider,
} from '../../config/env.validation';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetCode } from './entities/password-reset-code.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtStrategy } from './jwt.strategy';
import { PasswordResetService } from './password-reset.service';
import { LogSmsSender, MemorySmsSender, SmsSender } from './sms/sms-sender';
import { TokenService } from './token.service';

/**
 * Sign-in and sessions. Its guards (JwtAuthGuard, RolesGuard) are registered
 * globally in AppModule, after rate limiting.
 */
@Module({
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([RefreshToken, PasswordResetCode]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtStrategy,
    PasswordResetService,
    {
      provide: SmsSender,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        config.get('SMS_PROVIDER', { infer: true }) === SmsProvider.MEMORY
          ? new MemorySmsSender()
          : new LogSmsSender(),
    },
  ],
  exports: [TokenService],
})
export class AuthModule {}
