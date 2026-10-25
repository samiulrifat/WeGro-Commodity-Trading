import { ApiFile, ApiPaged } from '../../common/swagger/envelope';
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
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
  getSchemaPath,
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
  ImportedProjectDto,
  ListAllConsentsQueryDto,
  ListBankFarmersQueryDto,
  ListTrackRecordFarmersQueryDto,
  TrackRecordFarmerDto,
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
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.AUDITOR,
  Role.FIELD_OFFICER,
  Role.FARMER,
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
  @Roles(Role.ADMIN)
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
  @Roles(Role.ADMIN)
  @ApiExtraModels(BankDto)
  @ApiOkResponse({
    description: 'The bank now, or null when removed',
    schema: { nullable: true, allOf: [{ $ref: getSchemaPath(BankDto) }] },
  })
  assignOfficer(
    @CurrentUser() actor: AuthUser,
    @Param('officerId', uuid) officerId: string,
    @Body() dto: AssignBankOfficerDto,
  ): Promise<BankDto | null> {
    return this.banks.assignOfficer(actor, officerId, dto.bankId);
  }

  // --- Lists across farmers ---

  @Get('track-records/farmers')
  @ApiPaged()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.AUDITOR, Role.FIELD_OFFICER)
  @ApiOkResponse({
    type: [TrackRecordFarmerDto],
    description:
      "Farmers with their latest track record and current bank permissions; an officer's own",
  })
  trackRecordFarmers(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListTrackRecordFarmersQueryDto,
  ): Promise<Paginated<TrackRecordFarmerDto>> {
    return this.records.farmers(actor, query);
  }

  @Get('consents')
  @ApiPaged()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.AUDITOR, Role.FIELD_OFFICER)
  @ApiOkResponse({
    type: [ConsentDto],
    description:
      "Bank permissions across farmers, newest first; an officer's farmers'",
  })
  allConsents(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListAllConsentsQueryDto,
  ): Promise<Paginated<ConsentDto>> {
    return this.records.allConsents(actor, query);
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
  @Roles(Role.FIELD_OFFICER, Role.SUPER_ADMIN)
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

  @Get('farmers/:farmerId/history')
  @Roles(...FARMER_READERS)
  @ApiOkResponse({
    type: [ImportedProjectDto],
    description:
      'Projects finished before the platform, imported from WeGro records; not on the ledger',
  })
  importedHistory(
    @CurrentUser() actor: AuthUser,
    @Param('farmerId', uuid) farmerId: string,
  ): Promise<ImportedProjectDto[]> {
    return this.records.importedHistory(actor, farmerId);
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
  @Roles(Role.FIELD_OFFICER, Role.SUPER_ADMIN)
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
  @Roles(Role.FIELD_OFFICER, Role.SUPER_ADMIN)
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
  @ApiPaged()
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
  @ApiFile('image/jpeg', 'image/png', 'image/webp')
  async evidence(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.photos.send(await this.records.evidencePhoto(actor, id), res);
  }

  // --- Bank officers ---

  @Get('bank/me')
  @Roles(Role.BANK)
  @ApiOkResponse({ type: MyBankDto })
  async myBank(@CurrentUser() actor: AuthUser): Promise<MyBankDto> {
    const bankId = await this.banks.bankOf(actor.id);
    return { bank: bankId ? await this.banks.one(actor, bankId) : null };
  }

  @Get('bank/farmers')
  @ApiPaged()
  @Roles(Role.BANK)
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
  @Roles(Role.BANK)
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
