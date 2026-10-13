import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Paginated } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { PhotosService } from '../field-records/photos.service';
import { Role } from '../users/roles';
import { BanksService } from './banks.service';
import {
  AssignBankOfficerDto,
  BankDto,
  BankFarmerDto,
  BankViewDto,
  ConsentDto,
  GrantConsentDto,
  ListBankFarmersQueryDto,
  ListBanksQueryDto,
  ListViewsQueryDto,
  MyBankDto,
  RegisterBankDto,
  SummaryViewDto,
  TrackRecordDto,
  TrackRecordPreviewDto,
  TrackRecordVersionDto,
} from './dto/track-record.dto';
import { TrackRecordsService } from './track-records.service';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });
const version = new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });
/** Each sees only their own (farmer) or their farmers' (officer) records. */
const FARMER_READERS = [
  Role.SuperAdmin,
  Role.Admin,
  Role.Auditor,
  Role.FieldOfficer,
  Role.Farmer,
];

/** Farmer track records and bank permission (ConsentRegistry). */
@ApiTags('Track record')
@ApiBearerAuth()
@Controller()
export class TrackRecordController {
  constructor(
    private readonly banks: BanksService,
    private readonly records: TrackRecordsService,
    private readonly photos: PhotosService,
  ) {}

  // --- Banks ---

  @Post('banks')
  @Roles(Role.Admin)
  @ApiCreatedResponse({ type: BankDto })
  registerBank(
    @CurrentUser() actor: AuthUser,
    @Body() dto: RegisterBankDto,
  ): Promise<BankDto> {
    return this.banks.register(actor, dto);
  }

  @Get('banks')
  @Roles(...FARMER_READERS)
  @ApiOkResponse({ type: [BankDto] })
  listBanks(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListBanksQueryDto,
  ): Promise<BankDto[]> {
    return this.banks.list(actor, query);
  }

  @Get('banks/:id')
  @Roles(...FARMER_READERS)
  @ApiOkResponse({ type: BankDto })
  bank(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<BankDto> {
    return this.banks.one(actor, id);
  }

  @Put('bank-officers/:officerId')
  @Roles(Role.Admin)
  @ApiOkResponse({
    type: BankDto,
    description: 'The bank now, or null when removed',
  })
  assignOfficer(
    @CurrentUser() actor: AuthUser,
    @Param('officerId', uuid) officerId: string,
    @Body() dto: AssignBankOfficerDto,
  ): Promise<BankDto | null> {
    return this.banks.assignOfficer(actor, officerId, dto.bankId);
  }

  // --- Track records ---

  @Get('farmers/:farmerId/track-record/preview')
  @Roles(...FARMER_READERS)
  @ApiOkResponse({ type: TrackRecordPreviewDto })
  preview(
    @CurrentUser() actor: AuthUser,
    @Param('farmerId', uuid) farmerId: string,
  ): Promise<TrackRecordPreviewDto> {
    return this.records.preview(actor, farmerId);
  }

  @Post('farmers/:farmerId/track-records')
  @Roles(Role.FieldOfficer)
  @ApiCreatedResponse({
    type: TrackRecordDto,
    description:
      "Built from the farmer's finished projects; its hash goes on the ledger",
  })
  publish(
    @CurrentUser() actor: AuthUser,
    @Param('farmerId', uuid) farmerId: string,
  ): Promise<TrackRecordDto> {
    return this.records.publish(actor, farmerId);
  }

  @Get('farmers/:farmerId/track-records')
  @Roles(...FARMER_READERS)
  @ApiOkResponse({ type: [TrackRecordVersionDto], description: 'Newest first' })
  versions(
    @CurrentUser() actor: AuthUser,
    @Param('farmerId', uuid) farmerId: string,
  ): Promise<TrackRecordVersionDto[]> {
    return this.records.versions(actor, farmerId);
  }

  @Get('farmers/:farmerId/track-records/:version')
  @Roles(...FARMER_READERS)
  @ApiOkResponse({ type: TrackRecordDto })
  record(
    @CurrentUser() actor: AuthUser,
    @Param('farmerId', uuid) farmerId: string,
    @Param('version', version) v: number,
  ): Promise<TrackRecordDto> {
    return this.records.record(actor, farmerId, v);
  }

  // --- Consent ---

  @Get('farmers/:farmerId/consents')
  @Roles(...FARMER_READERS)
  @ApiOkResponse({
    type: [ConsentDto],
    description: 'Every grant, newest first',
  })
  consents(
    @CurrentUser() actor: AuthUser,
    @Param('farmerId', uuid) farmerId: string,
  ): Promise<ConsentDto[]> {
    return this.records.listConsents(actor, farmerId);
  }

  @Post('farmers/:farmerId/consents')
  @Roles(Role.FieldOfficer)
  @ApiCreatedResponse({
    type: ConsentDto,
    description:
      'With the signed form; at most a year; renews an earlier grant',
  })
  grant(
    @CurrentUser() actor: AuthUser,
    @Param('farmerId', uuid) farmerId: string,
    @Body() dto: GrantConsentDto,
  ): Promise<ConsentDto> {
    return this.records.grant(actor, farmerId, dto);
  }

  @Post('farmers/:farmerId/consents/:bankId/revoke')
  @Roles(Role.FieldOfficer)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ConsentDto,
    description: "The bank's access ends at once",
  })
  revoke(
    @CurrentUser() actor: AuthUser,
    @Param('farmerId', uuid) farmerId: string,
    @Param('bankId', uuid) bankId: string,
  ): Promise<ConsentDto> {
    return this.records.revoke(actor, farmerId, bankId);
  }

  @Get('farmers/:farmerId/consents/views')
  @Roles(...FARMER_READERS)
  @ApiOkResponse({
    type: [SummaryViewDto],
    description: 'Who looked, newest first',
  })
  viewHistory(
    @CurrentUser() actor: AuthUser,
    @Param('farmerId', uuid) farmerId: string,
    @Query() query: ListViewsQueryDto,
  ): Promise<Paginated<SummaryViewDto>> {
    return this.records.viewHistory(actor, farmerId, query);
  }

  @Get('consents/:id/evidence-photo')
  @Roles(...FARMER_READERS)
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  async evidence(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.photos.send(await this.records.evidencePhoto(actor, id), res);
  }

  // --- Bank officers ---

  @Get('bank/me')
  @Roles(Role.Bank)
  @ApiOkResponse({ type: MyBankDto })
  async myBank(@CurrentUser() actor: AuthUser): Promise<MyBankDto> {
    const bankId = await this.banks.bankOf(actor.id);
    return { bank: bankId ? await this.banks.one(actor, bankId) : null };
  }

  @Get('bank/farmers')
  @Roles(Role.Bank)
  @ApiOkResponse({
    type: [BankFarmerDto],
    description: 'Farmers whose permission for your bank is current',
  })
  bankFarmers(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListBankFarmersQueryDto,
  ): Promise<Paginated<BankFarmerDto>> {
    return this.records.bankFarmers(actor, query);
  }

  @Post('bank/farmers/:farmerId/track-record/view')
  @Roles(Role.Bank)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: BankViewDto,
    description: 'Logged on the ledger; checked against its fingerprint',
  })
  bankView(
    @CurrentUser() actor: AuthUser,
    @Param('farmerId', uuid) farmerId: string,
  ): Promise<BankViewDto> {
    return this.records.bankView(actor, farmerId);
  }
}
