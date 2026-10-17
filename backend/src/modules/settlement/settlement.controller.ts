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
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { csvFilename } from '../../common/csv';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { Paginated } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { PhotosService } from '../field-records/photos.service';
import { Role } from '../users/roles';
import {
  AddCostDto,
  CostDto,
  ListCostsQueryDto,
  ListRoundsQueryDto,
  PeriodQueryDto,
  PrepareRoundDto,
  RecordPayoutDto,
  RejectRoundDto,
  RoundDto,
  RoundListItemDto,
  SettlementSummaryDto,
  StatementDto,
  StatementQueryDto,
} from './dto/settlement.dto';
import { SettlementReportsService } from './reports.service';
import { SettlementService } from './settlement.service';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });
const ledgerId = new ParseIntPipe({
  errorHttpStatusCode: HttpStatus.NOT_FOUND,
});
const STAFF = [
  Role.SuperAdmin,
  Role.Admin,
  Role.Operations,
  Role.Accounts,
  Role.Auditor,
];
/** Staff and the project's own people; each sees only their projects. */
const PROJECT_READERS = [
  ...STAFF,
  Role.Farmer,
  Role.FieldOfficer,
  Role.Investor,
];
const BOOKS = [Role.SuperAdmin, Role.Admin, Role.Accounts, Role.Auditor];

/** Settlement (SettlementLedger): costs, payout rounds, payments and reports. */
@ApiTags('Settlement')
@ApiBearerAuth()
@Controller()
export class SettlementController {
  constructor(
    private readonly settlement: SettlementService,
    private readonly reports: SettlementReportsService,
    private readonly photos: PhotosService,
  ) {}

  // --- Project ---

  @Get('settlement/projects/:projectId')
  @Roles(...PROJECT_READERS)
  @ApiOkResponse({
    type: SettlementSummaryDto,
    description:
      'Totals so far, whether a round can start and what it would pay',
  })
  summary(
    @CurrentUser() actor: AuthUser,
    @Param('projectId', uuid) projectId: string,
  ): Promise<SettlementSummaryDto> {
    return this.settlement.summary(actor, projectId);
  }

  @Get('settlement/projects/:projectId/report.csv')
  @Roles(...STAFF)
  @RawResponse()
  @ApiFile('text/csv')
  @ApiOkResponse({
    description: 'Income, costs and rounds, with ledger totals',
  })
  async projectReport(
    @Param('projectId', uuid) projectId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    return csv(res, await this.reports.projectReport(projectId));
  }

  // --- Costs ---

  @Get('settlement/projects/:projectId/costs')
  @Roles(...PROJECT_READERS)
  @ApiOkResponse({ type: [CostDto], description: 'Newest first' })
  listCosts(
    @CurrentUser() actor: AuthUser,
    @Param('projectId', uuid) projectId: string,
    @Query() query: ListCostsQueryDto,
  ): Promise<CostDto[]> {
    return this.settlement.listCosts(actor, projectId, query);
  }

  @Post('settlement/projects/:projectId/costs')
  @Roles(Role.Accounts)
  @ApiCreatedResponse({
    type: CostDto,
    description: 'Until a final round is prepared',
  })
  addCost(
    @CurrentUser() actor: AuthUser,
    @Param('projectId', uuid) projectId: string,
    @Body() dto: AddCostDto,
  ): Promise<CostDto> {
    return this.settlement.addCost(actor, projectId, dto);
  }

  @Get('settlement/costs/:id')
  @Roles(...PROJECT_READERS)
  @ApiOkResponse({ type: CostDto })
  cost(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<CostDto> {
    return this.settlement.costOne(actor, id);
  }

  @Post('settlement/costs/:id/void')
  @Roles(Role.Accounts)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CostDto, description: 'Corrections are new entries' })
  voidCost(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<CostDto> {
    return this.settlement.voidCost(actor, id);
  }

  @Get('settlement/costs/:id/photo')
  @Roles(...PROJECT_READERS)
  @ApiFile('image/jpeg', 'image/png', 'image/webp')
  async costPhoto(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.photos.send(await this.settlement.costPhoto(actor, id), res);
  }

  // --- Rounds ---

  @Post('settlement/projects/:projectId/rounds')
  @Roles(Role.Accounts)
  @ApiCreatedResponse({
    type: RoundDto,
    description:
      'The ledger works out every figure; another Accounts person approves',
  })
  prepare(
    @CurrentUser() actor: AuthUser,
    @Param('projectId', uuid) projectId: string,
    @Body() dto: PrepareRoundDto,
  ): Promise<RoundDto> {
    return this.settlement.prepareRound(actor, projectId, dto.final);
  }

  @Get('settlement/rounds')
  @ApiPaged()
  @Roles(...STAFF)
  @ApiOkResponse({ type: [RoundListItemDto], description: 'Newest first' })
  listRounds(
    @Query() query: ListRoundsQueryDto,
  ): Promise<Paginated<RoundListItemDto>> {
    return this.settlement.listRounds(query);
  }

  @Get('settlement/rounds/:id')
  @Roles(...STAFF)
  @ApiOkResponse({ type: RoundDto })
  round(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
  ): Promise<RoundDto> {
    return this.settlement.round(actor, id);
  }

  @Post('settlement/rounds/:id/approve')
  @Roles(Role.Accounts)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RoundDto, description: 'Not by who prepared it' })
  approve(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
  ): Promise<RoundDto> {
    return this.settlement.approveRound(actor, id);
  }

  @Post('settlement/rounds/:id/reject')
  @Roles(Role.Accounts)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: RoundDto,
    description: 'Corrected, then prepared again',
  })
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
    @Body() dto: RejectRoundDto,
  ): Promise<RoundDto> {
    return this.settlement.rejectRound(actor, id, dto.reason);
  }

  @Post('settlement/rounds/:id/payments')
  @Roles(Role.Accounts)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: RoundDto,
    description: 'One line paid outside the platform; all paid = round paid',
  })
  recordPayment(
    @CurrentUser() actor: AuthUser,
    @Param('id', ledgerId) id: number,
    @Body() dto: RecordPayoutDto,
  ): Promise<RoundDto> {
    return this.settlement.recordPayment(actor, id, dto);
  }

  @Get('settlement/rounds/:id/payout-sheet.csv')
  @Roles(Role.SuperAdmin, Role.Accounts)
  @RawResponse()
  @ApiFile('text/csv')
  @ApiOkResponse({
    description: 'Each payee with phone and verified bank account',
  })
  async payoutSheet(
    @Param('id', ledgerId) id: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    return csv(res, await this.reports.payoutSheet(id));
  }

  @Get('settlement/reports/period.csv')
  @Roles(...BOOKS)
  @RawResponse()
  @ApiFile('text/csv')
  @ApiOkResponse({ description: 'Rounds approved in the period' })
  async period(
    @Query() query: PeriodQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    return csv(res, await this.reports.periodReport(query.from, query.to));
  }

  // --- Statements ---

  @Get('me/statement')
  @Roles(Role.Investor, Role.Farmer)
  @ApiOkResponse({ type: StatementDto })
  myStatement(
    @CurrentUser() actor: AuthUser,
    @Query() query: StatementQueryDto,
  ): Promise<StatementDto> {
    return this.reports.statement(actor.id, query);
  }

  @Get('me/statement.csv')
  @Roles(Role.Investor, Role.Farmer)
  @RawResponse()
  @ApiFile('text/csv')
  async myStatementCsv(
    @CurrentUser() actor: AuthUser,
    @Query() query: StatementQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    return csv(res, await this.reports.statementCsv(actor.id, query));
  }

  @Get('settlement/statements/:payeeId')
  @Roles(...BOOKS)
  @ApiOkResponse({ type: StatementDto })
  statement(
    @Param('payeeId', uuid) payeeId: string,
    @Query() query: StatementQueryDto,
  ): Promise<StatementDto> {
    return this.reports.statement(payeeId, query);
  }

  @Get('settlement/statements/:payeeId/statement.csv')
  @Roles(...BOOKS)
  @RawResponse()
  @ApiFile('text/csv')
  async statementCsv(
    @Param('payeeId', uuid) payeeId: string,
    @Query() query: StatementQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    return csv(res, await this.reports.statementCsv(payeeId, query));
  }
}

/** A CSV download that is never cached: it can hold bank details and references. */
function csv(res: Response, report: { name: string; csv: string }): string {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${csvFilename(report.name)}"`,
  );
  res.setHeader('Cache-Control', 'no-store');
  return report.csv;
}
