import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { API_PREFIX } from '../../app.setup';
import {
  type EnvironmentVariables,
  NodeEnv,
} from '../../config/env.validation';
import type { SignInResult } from './auth.service';
import type { TokenResponseDto } from './dto/auth-response.dto';

export const REFRESH_COOKIE = 'wegro_rt';

/**
 * Answers a sign-in (password, reset, sign-up, demo): the access token in the
 * body, the refresh token as a cookie that scripts cannot read (httpOnly),
 * never sent cross-site (Strict) and only to the auth endpoints that need it.
 */
@Injectable()
export class SessionResponder {
  readonly cookie: CookieOptions;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.cookie = {
      httpOnly: true,
      secure: config.get('NODE_ENV', { infer: true }) === NodeEnv.PRODUCTION,
      sameSite: 'strict',
      path: `/${API_PREFIX}/auth`,
    };
  }

  respond(res: Response, { user, tokens }: SignInResult): TokenResponseDto {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.cookie,
      expires: tokens.refreshExpiresAt,
    });
    res.setHeader('Cache-Control', 'no-store');
    return {
      accessToken: tokens.accessToken,
      tokenType: 'Bearer',
      expiresIn: tokens.expiresIn,
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user.id,
        role: user.role,
        status: user.status,
        language: user.language,
      },
    };
  }

  clear(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, this.cookie);
  }
}
