import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { API_PREFIX } from '../../app.setup';
import {
  NodeEnv,
  type EnvironmentVariables,
} from '../../config/env.validation';
import type { AuthUser } from './auth-user';
import { AuthService, type SignInResult } from './auth.service';
import {
  AllowPendingPassword,
  AuthThrottle,
  CurrentUser,
  Public,
} from './decorators';
import {
  ChangePasswordDto,
  DemoLoginDto,
  LoginDto,
  PasswordResetCompleteDto,
  PasswordResetRequestDto,
  PasswordResetVerifyDto,
  UpdateMeDto,
} from './dto/auth-request.dto';
import {
  DemoAccountDto,
  MeResponseDto,
  PasswordResetRequestedDto,
  PasswordResetVerifiedDto,
  TokenResponseDto,
} from './dto/auth-response.dto';
import { PasswordResetService } from './password-reset.service';
import { ErrorCode } from '../../common/errors/error-code';

export const REFRESH_COOKIE = 'wegro_rt';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly cookie: CookieOptions;

  constructor(
    private readonly auth: AuthService,
    private readonly reset: PasswordResetService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    // Script-proof (httpOnly), never sent cross-site (Strict), and only to
    // the auth endpoints that need it.
    this.cookie = {
      httpOnly: true,
      secure: config.get('NODE_ENV', { infer: true }) === NodeEnv.PRODUCTION,
      sameSite: 'strict',
      path: `/${API_PREFIX}/auth`,
    };
  }

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokenResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    return this.respond(res, await this.auth.login(dto.phone, dto.password));
  }

  @Public()
  @AuthThrottle()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOkResponse({ type: TokenResponseDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    const token = readCookie(req, REFRESH_COOKIE);
    if (!token) {
      throw new UnauthorizedException({
        message: 'Sign in required',
        code: ErrorCode.SIGN_IN_REQUIRED,
      });
    }
    try {
      return this.respond(res, await this.auth.refresh(token));
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE, this.cookie);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'This session ended' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readCookie(req, REFRESH_COOKIE));
    res.clearCookie(REFRESH_COOKIE, this.cookie);
  }

  @ApiBearerAuth()
  @AllowPendingPassword()
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Every session on every device ended' })
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutEverywhere(user.id);
    res.clearCookie(REFRESH_COOKIE, this.cookie);
  }

  @ApiBearerAuth()
  @AllowPendingPassword()
  @AuthThrottle()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokenResponseDto })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    return this.respond(
      res,
      await this.auth.changePassword(
        user.id,
        dto.currentPassword,
        dto.newPassword,
      ),
    );
  }

  @ApiBearerAuth()
  @AllowPendingPassword()
  @Get('me')
  @ApiOkResponse({ type: MeResponseDto })
  me(@CurrentUser() user: AuthUser): Promise<MeResponseDto> {
    return this.auth.me(user);
  }

  @ApiBearerAuth()
  @AllowPendingPassword()
  @Patch('me')
  @ApiOkResponse({ type: MeResponseDto })
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMeDto,
  ): Promise<MeResponseDto> {
    return this.auth.updateMe(user, dto);
  }

  @Public()
  @AuthThrottle()
  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: PasswordResetRequestedDto,
    description:
      'Sends a 6-digit code by SMS if the number is registered; the answer is the same either way',
  })
  requestReset(
    @Body() dto: PasswordResetRequestDto,
  ): Promise<PasswordResetRequestedDto> {
    return this.reset.request(dto.phone);
  }

  @Public()
  @AuthThrottle()
  @Post('password-reset/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PasswordResetVerifiedDto })
  async verifyReset(
    @Body() dto: PasswordResetVerifyDto,
  ): Promise<PasswordResetVerifiedDto> {
    await this.reset.verify(dto.phone, dto.code);
    return { valid: true };
  }

  @Public()
  @AuthThrottle()
  @Post('password-reset/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: TokenResponseDto,
    description: 'Sets the new password, ends every other session and signs in',
  })
  async completeReset(
    @Body() dto: PasswordResetCompleteDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    return this.respond(
      res,
      await this.reset.complete(dto.phone, dto.code, dto.newPassword),
    );
  }

  @Public()
  @Get('demo/accounts')
  @ApiOkResponse({
    type: [DemoAccountDto],
    description: 'Demo mode only (404 otherwise)',
  })
  demoAccounts(): Promise<DemoAccountDto[]> {
    return this.auth.demoAccounts();
  }

  @Public()
  @AuthThrottle()
  @Post('demo/login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: TokenResponseDto,
    description: 'Demo mode only (404 otherwise)',
  })
  async demoLogin(
    @Body() dto: DemoLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    return this.respond(res, await this.auth.demoLogin(dto.role));
  }

  private respond(
    res: Response,
    { user, tokens }: SignInResult,
  ): TokenResponseDto {
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
}

/** Reads one cookie from the header; no cookie-parser needed for a single value. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
