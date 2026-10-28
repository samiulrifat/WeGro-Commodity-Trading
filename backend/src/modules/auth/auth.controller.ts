import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthUser } from './auth-user';
import { AuthService } from './auth.service';
import {
  AllowPendingPassword,
  AuthThrottle,
  CurrentUser,
  Public,
} from './decorators';
import {
  ChangePasswordDto,
  ConfirmEmailDto,
  DemoLoginDto,
  EmailCodeRequestDto,
  LoginDto,
  PasswordResetCompleteDto,
  PasswordResetRequestDto,
  PasswordResetVerifyDto,
  UpdateMeDto,
} from './dto/auth-request.dto';
import {
  DemoAccountDto,
  MeResponseDto,
  CodeSentDto,
  PasswordResetVerifiedDto,
  TokenResponseDto,
} from './dto/auth-response.dto';
import { MyEmailService } from './my-email.service';
import { PasswordResetService } from './password-reset.service';
import { REFRESH_COOKIE, SessionResponder } from './session-responder';
import { ErrorCode } from '../../common/errors/error-code';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly reset: PasswordResetService,
    private readonly session: SessionResponder,
    private readonly email: MyEmailService,
  ) {}

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokenResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    return this.session.respond(
      res,
      await this.auth.login(
        { phone: dto.phone, email: dto.email },
        dto.password,
      ),
    );
  }

  // Not under the sign-in limit: a refresh token is a 256-bit secret, not a
  // password to guess, and every app load and renewal calls this. Many
  // phones share one address behind a mobile carrier, so 10 a minute per
  // address would sign people out at random.
  @Public()
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
      return this.session.respond(res, await this.auth.refresh(token));
    } catch (error) {
      this.session.clear(res);
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
    this.session.clear(res);
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
    this.session.clear(res);
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
    return this.session.respond(
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

  @ApiBearerAuth()
  @AuthThrottle()
  @Post('me/email/code')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: CodeSentDto,
    description: 'Emails a 6-digit code to the address, to confirm it',
  })
  requestEmailCode(
    @CurrentUser() user: AuthUser,
    @Body() dto: EmailCodeRequestDto,
  ): Promise<CodeSentDto> {
    return this.email.requestCode(user, dto.email);
  }

  @ApiBearerAuth()
  @AuthThrottle()
  @Post('me/email')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: MeResponseDto,
    description: 'Saves the address with its code; it signs in from then on',
  })
  async confirmEmail(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmEmailDto,
  ): Promise<MeResponseDto> {
    await this.email.confirm(user, dto.email, dto.code);
    return this.auth.me(user);
  }

  @ApiBearerAuth()
  @Delete('me/email')
  @ApiOkResponse({ type: MeResponseDto })
  async removeEmail(@CurrentUser() user: AuthUser): Promise<MeResponseDto> {
    await this.email.remove(user);
    return this.auth.me(user);
  }

  @Public()
  @AuthThrottle()
  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: CodeSentDto,
    description:
      'Sends a 6-digit code by SMS if the number is registered; the answer is the same either way',
  })
  requestReset(@Body() dto: PasswordResetRequestDto): Promise<CodeSentDto> {
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
    return this.session.respond(
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
    return this.session.respond(res, await this.auth.demoLogin(dto.role));
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
