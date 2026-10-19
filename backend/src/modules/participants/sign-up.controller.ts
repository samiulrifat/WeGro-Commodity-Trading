import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthThrottle, Public } from '../auth/decorators';
import { CodeSentDto, TokenResponseDto } from '../auth/dto/auth-response.dto';
import { SessionResponder } from '../auth/session-responder';
import { TokenService } from '../auth/token.service';
import type { CodeIssued } from '../auth/verification-code.service';
import { SignUpCodeRequestDto, SignUpDto } from './dto/sign-up.dto';
import { ParticipantsService } from './participants.service';

/**
 * Investors and buyers signing up themselves: their number confirmed by a
 * code, then registered and verified at once. Every other role is
 * registered for them (farmers by their field officer or an admin, staff by
 * the super admin, the rest by an admin).
 */
@ApiTags('Auth')
@Controller('auth/sign-up')
export class SignUpController {
  constructor(
    private readonly participants: ParticipantsService,
    private readonly tokens: TokenService,
    private readonly session: SessionResponder,
  ) {}

  @Public()
  @AuthThrottle()
  @Post('code')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: CodeSentDto,
    description: 'Texts a 6-digit code to the number, unless it is registered',
  })
  requestCode(@Body() dto: SignUpCodeRequestDto): Promise<CodeIssued> {
    return this.participants.signUpCode(dto.phone, dto.language ?? null);
  }

  @Public()
  @AuthThrottle()
  @Post()
  @ApiCreatedResponse({
    type: TokenResponseDto,
    description: 'Registers and verifies them on the ledger, and signs them in',
  })
  async create(
    @Body() dto: SignUpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    const user = await this.participants.signUp(dto);
    return this.session.respond(res, {
      user,
      tokens: await this.tokens.issue(user),
    });
  }
}
