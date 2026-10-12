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
  ApiProduces,
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
  ListVouchersQueryDto,
  ProposeVoucherDto,
  RecordSaleDto,
  RegisterBatchDto,
} from './dto/voucher-request.dto';
import {
  BatchDto,
  BatchVerificationDto,
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
  Role.SuperAdmin,
  Role.Admin,
  Role.Operations,
  Role.Accounts,
  Role.Auditor,
  Role.Supplier,
  Role.Farmer,
  Role.FieldOfficer,
];
const STAFF = [
  Role.SuperAdmin,
  Role.Admin,
  Role.Operations,
  Role.Accounts,
  Role.Auditor,
];

/** Input vouchers (VoucherRegistry): Operations proposes, Accounts approves, suppliers sell. */
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
  @Roles(Role.Operations)
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

  @Get('vouchers')
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
  @ApiProduces('image/svg+xml')
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
  @Roles(Role.Accounts)
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
  @Roles(Role.Accounts)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: VoucherDetailDto })
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<VoucherDto> {
    return this.vouchers.reject(actor, id);
  }

  @Post('vouchers/:id/cancel')
  @Roles(Role.Admin)
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
  @Roles(Role.SuperAdmin)
  @ApiOkResponse({ type: VoucherDetailDto })
  setInactivityLimit(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: InactivityLimitDto,
  ): Promise<VoucherDto> {
    return this.vouchers.setInactivityLimit(actor, id, dto.days ?? null);
  }

  @Delete('vouchers/:id')
  @Roles(Role.Operations, Role.Admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Only a proposal the ledger never received',
  })
  discard(@Param('id', uuid) id: string): Promise<void> {
    return this.vouchers.discard(id);
  }

  @Post('vouchers/:id/sales')
  @Roles(Role.Supplier)
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
  @Roles(...VOUCHER_READERS)
  @ApiOkResponse({ type: [VoucherSaleDto] })
  listSales(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListSalesQueryDto,
  ): Promise<Paginated<VoucherSaleDto>> {
    return this.vouchers.listSales(actor, query);
  }

  @Post('voucher-sales/:id/confirm')
  @Roles(Role.FieldOfficer)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: VoucherSaleDto })
  confirmSale(
    @CurrentUser() actor: AuthUser,
    @Param('id', saleId) id: number,
  ): Promise<VoucherSaleDto> {
    return this.vouchers.confirmSale(actor, id);
  }

  @Post('voucher-sales/:id/cancel')
  @Roles(Role.Supplier, Role.Farmer, Role.FieldOfficer, Role.Admin)
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
  @Roles(Role.Supplier)
  @ApiCreatedResponse({ type: BatchDto })
  register(
    @CurrentUser() actor: AuthUser,
    @Body() dto: RegisterBatchDto,
  ): Promise<BatchDto> {
    return this.batches.register(actor, dto);
  }

  @Get()
  @Roles(Role.Supplier, Role.FieldOfficer, ...STAFF)
  @ApiOkResponse({ type: [BatchDto] })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListBatchesQueryDto,
  ): Promise<Paginated<BatchDto>> {
    return this.batches.list(actor, query);
  }

  @Get(':id')
  @Roles(Role.Supplier, Role.FieldOfficer, ...STAFF)
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
  @ApiProduces('image/svg+xml')
  @ApiOkResponse({
    description: 'Print-ready QR code linking to the verify page',
  })
  qr(@Param('id', uuid) id: string): Promise<string> {
    return qrSvg(this.batches.verifyUrl(id));
  }
}
