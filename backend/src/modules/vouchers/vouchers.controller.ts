import { ApiFile, ApiPaged } from '../../common/swagger/envelope';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Paginated } from '../../common/dto/pagination.dto';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import type { EnvironmentVariables } from '../../config/env.validation';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import { Role } from '../users/roles';
import { BatchesService } from './batches.service';
import {
  InactivityLimitDto,
  ListBatchesQueryDto,
  ListSalesQueryDto,
  ListSuppliersQueryDto,
  ListVouchersQueryDto,
  ProposeVoucherDto,
  RecordSaleDto,
  RegisterBatchDto,
} from './dto/voucher-request.dto';
import {
  BatchDto,
  BatchVerificationDto,
  RefDto,
  VoucherDetailDto,
  VoucherDto,
  VoucherSaleDto,
  VoucherSummaryDto,
} from './dto/voucher-response.dto';
import { qrSvg } from '../../common/qr';
import { VouchersService } from './vouchers.service';

const uuid = new ParseUUIDPipe({ version: '4' });
const saleId = new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/** Everyone with a part in vouchers; each sees only their own part. */
const VOUCHER_READERS = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPERATIONS,
  Role.ACCOUNTS,
  Role.AUDITOR,
  Role.SUPPLIER,
  Role.FARMER,
  Role.FIELD_OFFICER,
];
const STAFF = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPERATIONS,
  Role.ACCOUNTS,
  Role.AUDITOR,
];

/** Input vouchers (VoucherRegistry): Operations or an admin proposes, Accounts approves, suppliers sell. */
@ApiTags('Vouchers')
@ApiBearerAuth()
@Controller()
export class VouchersController {
  private readonly appUrl: string;

  constructor(
    private readonly vouchers: VouchersService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.appUrl = config
      .get('PUBLIC_APP_URL', { infer: true })
      .replace(/\/+$/, '');
  }

  @Post('projects/:projectId/vouchers')
  @Roles(Role.OPERATIONS, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiCreatedResponse({
    type: VoucherDetailDto,
    description: 'Proposed; usable once Accounts approves',
  })
  propose(
    @CurrentUser() actor: AuthUser,
    @Param('projectId', uuid) projectId: string,
    @Body() dto: ProposeVoucherDto,
  ): Promise<VoucherDto> {
    return this.vouchers.propose(actor, projectId, dto);
  }

  @Get('projects/:projectId/voucher-summary')
  @Roles(...STAFF)
  @ApiOkResponse({
    type: VoucherSummaryDto,
    description:
      "From the ledger: what the project's vouchers commit and spend",
  })
  summary(
    @Param('projectId', uuid) projectId: string,
  ): Promise<VoucherSummaryDto> {
    return this.vouchers.summary(projectId);
  }

  @Get('voucher-suppliers')
  @ApiPaged()
  @Roles(...STAFF)
  @ApiOkResponse({ type: [RefDto] })
  suppliers(@Query() query: ListSuppliersQueryDto): Promise<Paginated<RefDto>> {
    return this.vouchers.suppliersToChoose(query);
  }

  @Get('vouchers')
  @ApiPaged()
  @Roles(...VOUCHER_READERS)
  @ApiOkResponse({ type: [VoucherDto] })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListVouchersQueryDto,
  ): Promise<Paginated<VoucherDto>> {
    return this.vouchers.list(actor, query);
  }

  @Get('vouchers/:id')
  @Roles(...VOUCHER_READERS)
  @ApiOkResponse({ type: VoucherDetailDto })
  findOne(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<VoucherDetailDto> {
    return this.vouchers.findOne(actor, id);
  }

  @Get('vouchers/:id/qr.svg')
  @Roles(...VOUCHER_READERS)
  @RawResponse()
  @Header('Content-Type', 'image/svg+xml')
  @Header('Cache-Control', 'private, max-age=86400')
  @ApiFile('image/svg+xml')
  @ApiOkResponse({
    description:
      "QR for the farmer's voucher: suppliers scan it to open the voucher",
  })
  async qr(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<string> {
    await this.vouchers.visible(actor, id);
    return qrSvg(`${this.appUrl}/vouchers/${id}`);
  }

  @Post('vouchers/:id/approve')
  @Roles(Role.ACCOUNTS)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: VoucherDetailDto,
    description: 'Usable; a funded project becomes active',
  })
  approve(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<VoucherDto> {
    return this.vouchers.approve(actor, id);
  }

  @Post('vouchers/:id/reject')
  @Roles(Role.ACCOUNTS)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: VoucherDetailDto })
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<VoucherDto> {
    return this.vouchers.reject(actor, id);
  }

  @Post('vouchers/:id/cancel')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: VoucherDetailDto,
    description: 'Voids the unused balance',
  })
  cancel(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<VoucherDto> {
    return this.vouchers.cancel(actor, id);
  }

  @Put('vouchers/:id/inactivity-limit')
  @Roles(Role.SUPER_ADMIN)
  @ApiOkResponse({ type: VoucherDetailDto })
  setInactivityLimit(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: InactivityLimitDto,
  ): Promise<VoucherDto> {
    return this.vouchers.setInactivityLimit(actor, id, dto.days ?? null);
  }

  @Delete('vouchers/:id')
  @Roles(Role.OPERATIONS, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Only a proposal the ledger never received',
  })
  discard(@Param('id', uuid) id: string): Promise<void> {
    return this.vouchers.discard(id);
  }

  @Post('vouchers/:id/sales')
  @Roles(Role.SUPPLIER)
  @ApiCreatedResponse({
    type: VoucherSaleDto,
    description: "Held until the farmer's field officer confirms",
  })
  recordSale(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: RecordSaleDto,
  ): Promise<VoucherSaleDto> {
    return this.vouchers.recordSale(actor, id, dto);
  }

  @Get('voucher-sales')
  @ApiPaged()
  @Roles(...VOUCHER_READERS)
  @ApiOkResponse({ type: [VoucherSaleDto] })
  listSales(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListSalesQueryDto,
  ): Promise<Paginated<VoucherSaleDto>> {
    return this.vouchers.listSales(actor, query);
  }

  @Post('voucher-sales/:id/confirm')
  @Roles(Role.FIELD_OFFICER)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: VoucherSaleDto })
  confirmSale(
    @CurrentUser() actor: AuthUser,
    @Param('id', saleId) id: number,
  ): Promise<VoucherSaleDto> {
    return this.vouchers.confirmSale(actor, id);
  }

  @Post('voucher-sales/:id/cancel')
  @Roles(Role.SUPPLIER, Role.FARMER, Role.FIELD_OFFICER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: VoucherSaleDto })
  cancelSale(
    @CurrentUser() actor: AuthUser,
    @Param('id', saleId) id: number,
  ): Promise<VoucherSaleDto> {
    return this.vouchers.cancelSale(actor, id);
  }
}

/** Suppliers' input batches; their ids are what the QR codes on the bags encode. */
@ApiTags('Vouchers')
@ApiBearerAuth()
@Controller('batches')
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Post()
  @Roles(Role.SUPPLIER)
  @ApiCreatedResponse({ type: BatchDto })
  register(
    @CurrentUser() actor: AuthUser,
    @Body() dto: RegisterBatchDto,
  ): Promise<BatchDto> {
    return this.batches.register(actor, dto);
  }

  @Get()
  @ApiPaged()
  @Roles(Role.SUPPLIER, Role.FIELD_OFFICER, ...STAFF)
  @ApiOkResponse({ type: [BatchDto] })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListBatchesQueryDto,
  ): Promise<Paginated<BatchDto>> {
    return this.batches.list(actor, query);
  }

  @Get(':id')
  @Roles(Role.SUPPLIER, Role.FIELD_OFFICER, ...STAFF)
  @ApiOkResponse({ type: BatchDto })
  findOne(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<BatchDto> {
    return this.batches.findOne(actor, id);
  }
}

/** Open to anyone with a QR code: no sign-in, rate-limited like every route. */
@ApiTags('Verify')
@Public()
@Controller('verify')
export class VerifyController {
  constructor(private readonly batches: BatchesService) {}

  @Get('batches/:id')
  @ApiOkResponse({ type: BatchVerificationDto })
  batch(@Param('id') id: string): Promise<BatchVerificationDto> {
    return this.batches.verify(id);
  }

  @Get('batches/:id/qr.svg')
  @RawResponse()
  @Header('Content-Type', 'image/svg+xml')
  @Header('Cache-Control', 'public, max-age=86400, immutable')
  @ApiFile('image/svg+xml')
  @ApiOkResponse({
    description: 'Print-ready QR code linking to the verify page',
  })
  qr(@Param('id', uuid) id: string): Promise<string> {
    return qrSvg(this.batches.verifyUrl(id));
  }
}
