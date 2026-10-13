import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Paginated } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { Role } from '../users/roles';
import { BankAccountsService } from './bank-accounts.service';
import {
  BankAccountsDto,
  BankDetailsDto,
  ListPendingQueryDto,
  PendingBankAccountDto,
  RejectBankAccountDto,
} from './dto/bank-account.dto';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/** Where farmers and investors are paid. Changes count once an admin verifies them. */
@ApiTags('Bank accounts')
@ApiBearerAuth()
@Controller()
export class BankAccountsController {
  constructor(private readonly accounts: BankAccountsService) {}

  @Get('me/bank-account')
  @Roles(Role.Farmer, Role.Investor)
  @ApiOkResponse({ type: BankAccountsDto })
  mine(@CurrentUser() actor: AuthUser): Promise<BankAccountsDto> {
    return this.accounts.forUser(actor, actor.id);
  }

  @Put('me/bank-account')
  @Roles(Role.Farmer, Role.Investor)
  @ApiOkResponse({
    type: BankAccountsDto,
    description: 'Waits for an admin to verify it',
  })
  submitMine(
    @CurrentUser() actor: AuthUser,
    @Body() dto: BankDetailsDto,
  ): Promise<BankAccountsDto> {
    return this.accounts.submit(actor, actor.id, dto);
  }

  @Get('bank-accounts/pending')
  @Roles(Role.SuperAdmin, Role.Admin)
  @ApiOkResponse({
    type: [PendingBankAccountDto],
    description: 'Waiting for verification, oldest first',
  })
  pending(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListPendingQueryDto,
  ): Promise<Paginated<PendingBankAccountDto>> {
    return this.accounts.listPending(actor, query);
  }

  @Get('participants/:id/bank-account')
  @Roles(Role.SuperAdmin, Role.Admin, Role.Accounts, Role.Auditor)
  @ApiOkResponse({ type: BankAccountsDto })
  forParticipant(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<BankAccountsDto> {
    return this.accounts.forUser(actor, id);
  }

  @Put('participants/:id/bank-account')
  @Roles(Role.Admin)
  @ApiOkResponse({
    type: BankAccountsDto,
    description: 'Entered for the payee; another admin verifies it',
  })
  submitFor(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: BankDetailsDto,
  ): Promise<BankAccountsDto> {
    return this.accounts.submit(actor, id, dto);
  }

  @Post('participants/:id/bank-account/verify')
  @Roles(Role.SuperAdmin, Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: BankAccountsDto,
    description: 'By someone other than who entered it',
  })
  verify(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<BankAccountsDto> {
    return this.accounts.verify(actor, id);
  }

  @Post('participants/:id/bank-account/reject')
  @Roles(Role.SuperAdmin, Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: BankAccountsDto })
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: RejectBankAccountDto,
  ): Promise<BankAccountsDto> {
    return this.accounts.reject(actor, id, dto.reason);
  }
}
