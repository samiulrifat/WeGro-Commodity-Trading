import { ApiFile, ApiPaged } from '../../common/swagger/envelope';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  type PipeTransform,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { Paginated } from '../../common/dto/pagination.dto';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { qrSvg } from '../../common/qr';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import { Role } from '../users/roles';
import {
  CreateSiteDto,
  IssueReceiptDto,
  ListReceiptsQueryDto,
  RecheckDto,
  ReceiptDetailDto,
  ReceiptDto,
  ReceiptVerificationDto,
  SiteDto,
} from './dto/warehouse.dto';
import { RECEIPT_ID } from './warehouse.enums';
import { WarehouseService } from './warehouse.service';

const uuid = new ParseUUIDPipe({ version: '4' });

/** A malformed receipt id can never exist: 404 without a lookup. */
class ReceiptIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const id = value.toLowerCase();
    if (!RECEIPT_ID.test(id)) throw new NotFoundException('Receipt not found');
    return id;
  }
}
const receiptId = new ReceiptIdPipe();

class AssignOperatorDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'null removes them from their site',
  })
  @IsOptional()
  @IsUUID('4')
  siteId: string | null;
}

const STAFF = [
  Role.SuperAdmin,
  Role.Admin,
  Role.Operations,
  Role.Accounts,
  Role.Auditor,
];
const RECEIPT_READERS = [
  ...STAFF,
  Role.Warehouse,
  Role.Farmer,
  Role.FieldOfficer,
  Role.Buyer,
];

/** Warehouse sites, operators and receipts (WarehouseReceipt). */
@ApiTags('Warehouse')
@ApiBearerAuth()
@Controller()
export class WarehouseController {
  constructor(private readonly warehouse: WarehouseService) {}

  @Post('warehouse-sites')
  @Roles(Role.Admin)
  @ApiCreatedResponse({ type: SiteDto })
  createSite(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateSiteDto,
  ): Promise<SiteDto> {
    return this.warehouse.createSite(actor, dto);
  }

  @Get('warehouse-sites')
  @Roles(...STAFF, Role.Warehouse, Role.FieldOfficer)
  @ApiOkResponse({ type: [SiteDto] })
  listSites(@CurrentUser() actor: AuthUser): Promise<SiteDto[]> {
    return this.warehouse.listSites(actor);
  }

  @Get('warehouse-sites/:id')
  @Roles(...STAFF, Role.Warehouse, Role.FieldOfficer)
  @ApiOkResponse({ type: SiteDto })
  site(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<SiteDto> {
    return this.warehouse.site(actor, id);
  }

  @Put('warehouse-operators/:operatorId')
  @Roles(Role.Admin)
  @ApiOkResponse({
    type: SiteDto,
    description: 'The site they now work at, or null',
  })
  assignOperator(
    @CurrentUser() actor: AuthUser,
    @Param('operatorId', uuid) operatorId: string,
    @Body() dto: AssignOperatorDto,
  ): Promise<SiteDto | null> {
    return this.warehouse.assignOperator(actor, operatorId, dto.siteId ?? null);
  }

  @Post('warehouse-receipts')
  @Roles(Role.Warehouse)
  @ApiCreatedResponse({
    type: ReceiptDetailDto,
    description: "Issued to the project's farmer",
  })
  issue(
    @CurrentUser() actor: AuthUser,
    @Body() dto: IssueReceiptDto,
  ): Promise<ReceiptDetailDto> {
    return this.warehouse.issue(actor, dto);
  }

  @Get('warehouse-receipts')
  @ApiPaged()
  @Roles(...RECEIPT_READERS)
  @ApiOkResponse({ type: [ReceiptDto] })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListReceiptsQueryDto,
  ): Promise<Paginated<ReceiptDto>> {
    return this.warehouse.list(actor, query);
  }

  @Get('warehouse-receipts/:id')
  @Roles(...RECEIPT_READERS)
  @ApiOkResponse({ type: ReceiptDetailDto })
  findOne(
    @CurrentUser() actor: AuthUser,
    @Param('id', receiptId) id: string,
  ): Promise<ReceiptDetailDto> {
    return this.warehouse.findOne(actor, id);
  }

  @Post('warehouse-receipts/:id/extend')
  @Roles(Role.Warehouse)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ReceiptDetailDto,
    description: 'After a quality re-check at the issuing site',
  })
  extend(
    @CurrentUser() actor: AuthUser,
    @Param('id', receiptId) id: string,
    @Body() dto: RecheckDto,
  ): Promise<ReceiptDetailDto> {
    return this.warehouse.extend(actor, id, dto);
  }

  @Post('warehouse-receipts/:id/collect')
  @Roles(Role.Warehouse)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ReceiptDetailDto,
    description: 'Unsold goods left the warehouse. Final.',
  })
  collect(
    @CurrentUser() actor: AuthUser,
    @Param('id', receiptId) id: string,
  ): Promise<ReceiptDetailDto> {
    return this.warehouse.collect(actor, id);
  }

  @Post('warehouse-receipts/:id/handover')
  @Roles(Role.FieldOfficer)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ReceiptDetailDto,
    description: "Buy-back: offer the farmer's receipt to WeGro",
  })
  offerHandover(
    @CurrentUser() actor: AuthUser,
    @Param('id', receiptId) id: string,
  ): Promise<ReceiptDetailDto> {
    return this.warehouse.offerHandover(actor, id);
  }

  @Post('warehouse-receipts/:id/handover/accept')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ReceiptDetailDto })
  acceptHandover(
    @CurrentUser() actor: AuthUser,
    @Param('id', receiptId) id: string,
  ): Promise<ReceiptDetailDto> {
    return this.warehouse.acceptHandover(actor, id);
  }

  @Post('warehouse-receipts/:id/handover/cancel')
  @Roles(Role.Admin, Role.FieldOfficer)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ReceiptDetailDto })
  cancelHandover(
    @CurrentUser() actor: AuthUser,
    @Param('id', receiptId) id: string,
  ): Promise<ReceiptDetailDto> {
    return this.warehouse.cancelHandover(actor, id);
  }
}

/** Open to anyone with a receipt QR: no sign-in, never shows the owner. */
@ApiTags('Verify')
@Public()
@Controller('verify/receipts')
export class ReceiptVerifyController {
  constructor(private readonly warehouse: WarehouseService) {}

  @Get(':id')
  @ApiOkResponse({ type: ReceiptVerificationDto })
  verify(@Param('id') id: string): Promise<ReceiptVerificationDto> {
    return this.warehouse.verify(id.toLowerCase());
  }

  @Get(':id/qr.svg')
  @RawResponse()
  @Header('Content-Type', 'image/svg+xml')
  @Header('Cache-Control', 'public, max-age=86400, immutable')
  @ApiFile('image/svg+xml')
  @ApiOkResponse({ description: 'Print-ready QR linking to the verify page' })
  qr(@Param('id', receiptId) id: string): Promise<string> {
    return qrSvg(this.warehouse.verifyUrl(id));
  }
}
