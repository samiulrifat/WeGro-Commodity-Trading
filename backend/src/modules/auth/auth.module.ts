import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  EmailProvider,
  type EnvironmentVariables,
  SmsProvider,
} from '../../config/env.validation';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  EmailSender,
  LogEmailSender,
  MemoryEmailSender,
} from './email/email-sender';
import { VerificationCode } from './entities/verification-code.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtStrategy } from './jwt.strategy';
import { MyEmailService } from './my-email.service';
import { PasswordResetService } from './password-reset.service';
import { VerificationCodeService } from './verification-code.service';
import { LogSmsSender, MemorySmsSender, SmsSender } from './sms/sms-sender';
import { SessionResponder } from './session-responder';
import { TokenService } from './token.service';

/**
 * Sign-in and sessions. Its guards (JwtAuthGuard, RolesGuard) are registered
 * globally in AppModule, after rate limiting.
 */
@Module({
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([RefreshToken, VerificationCode]),
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
    VerificationCodeService,
    SessionResponder,
    MyEmailService,
    {
      provide: SmsSender,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        config.get('SMS_PROVIDER', { infer: true }) === SmsProvider.MEMORY
          ? new MemorySmsSender()
          : new LogSmsSender(),
    },
    {
      provide: EmailSender,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        config.get('EMAIL_PROVIDER', { infer: true }) === EmailProvider.MEMORY
          ? new MemoryEmailSender()
          : new LogEmailSender(),
    },
  ],
  exports: [TokenService, VerificationCodeService, SmsSender, SessionResponder],
})
export class AuthModule {}
