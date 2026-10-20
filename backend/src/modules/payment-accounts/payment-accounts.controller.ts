import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { Role } from '../users/roles';
import {
  CreatePaymentAccountDto,
  PaymentAccountDto,
  UpdatePaymentAccountDto,
} from './dto/payment-account.dto';
import { PaymentAccountsService } from './payment-accounts.service';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });
const KEEPERS = [Role.SUPER_ADMIN, Role.ACCOUNTS];

/** WeGro's accounts investors pay into. */
@ApiTags('Payment accounts')
@ApiBearerAuth()
@Controller('payment-accounts')
export class PaymentAccountsController {
  constructor(private readonly accounts: PaymentAccountsService) {}

  @Get()
  @ApiOkResponse({ type: [PaymentAccountDto], description: 'Those in use' })
  inUse(): Promise<PaymentAccountDto[]> {
    return this.accounts.list();
  }

  @Get('all')
  @Roles(...KEEPERS)
  @ApiOkResponse({ type: [PaymentAccountDto], description: 'Retired ones too' })
  all(): Promise<PaymentAccountDto[]> {
    return this.accounts.list(true);
  }

  @Post()
  @Roles(...KEEPERS)
  @ApiCreatedResponse({ type: PaymentAccountDto })
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreatePaymentAccountDto,
  ): Promise<PaymentAccountDto> {
    return this.accounts.create(actor, dto);
  }

  @Patch(':id')
  @Roles(...KEEPERS)
  @ApiOkResponse({ type: PaymentAccountDto })
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: UpdatePaymentAccountDto,
  ): Promise<PaymentAccountDto> {
    return this.accounts.update(actor, id, dto);
  }
}
