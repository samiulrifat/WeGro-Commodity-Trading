import { ApiPaged } from '../../common/swagger/envelope';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  type PipeTransform,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Paginated } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../auth/auth-user';
import { AuditAction, CurrentUser, Roles } from '../auth/decorators';
import { Role } from '../users/roles';
import {
  ActivityEntryDto,
  ActivityQueryDto,
  AuditLogEntryDto,
  AuditLogQueryDto,
  HistoryEntryDto,
  HistoryQueryDto,
  SweepDto,
  SweepFindingDto,
  SweepFindingsQueryDto,
  VerificationDto,
} from './dto/audit.dto';
import {
  HISTORY_TYPE_NAMES,
  type HistoryTypeName,
} from './history/history-types';
import { HistoryService } from './history/history.service';
import { AuditLogService } from './log/audit-log.service';
import { SweepService } from './verify/sweep.service';
import {
  VERIFY_TYPES,
  VerifyService,
  type VerifyType,
} from './verify/verify.service';
import { ErrorCode } from '../../common/errors/error-code';

const STAFF = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPERATIONS,
  Role.ACCOUNTS,
  Role.AUDITOR,
];
const AUDITORS = [Role.SUPER_ADMIN, Role.ADMIN, Role.AUDITOR];
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/** An unknown record type is a missing page, not a bad request. */
const oneOf = <T extends string>(
  allowed: readonly T[],
): PipeTransform<string, T> => ({
  transform(value: string): T {
    if (!(allowed as readonly string[]).includes(value))
      throw new NotFoundException({
        message: 'Unknown record type',
        code: ErrorCode.UNKNOWN_RECORD_TYPE,
      });
    return value as T;
  },
});

/** History, verification against the ledger, and the write-request log. */
@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(
    private readonly history: HistoryService,
    private readonly verifier: VerifyService,
    private readonly sweeps: SweepService,
    private readonly log: AuditLogService,
  ) {}

  @Get('events')
  @ApiPaged()
  @Roles(...STAFF)
  @ApiOkResponse({
    type: [ActivityEntryDto],
    description:
      'Ledger events newest first, by kind of record or one record, with the records each names',
  })
  activity(
    @Query() query: ActivityQueryDto,
  ): Promise<Paginated<ActivityEntryDto>> {
    return this.history.activity(query);
  }

  @Get('history/:type/:id')
  @ApiPaged()
  @Roles(...STAFF)
  @ApiParam({ name: 'type', enum: HISTORY_TYPE_NAMES })
  @ApiOkResponse({
    type: [HistoryEntryDto],
    description: 'Every ledger event naming the record, with who sent it',
  })
  recordHistory(
    @Param('type', oneOf(HISTORY_TYPE_NAMES)) type: HistoryTypeName,
    @Param('id') id: string,
    @Query() query: HistoryQueryDto,
  ): Promise<Paginated<HistoryEntryDto>> {
    return this.history.history(type, id, query);
  }

  @Get('verify/:type/:id')
  @Roles(...AUDITORS)
  @ApiParam({ name: 'type', enum: VERIFY_TYPES })
  @ApiOkResponse({
    type: VerificationDto,
    description:
      'Recomputes the fingerprint from the database and compares it, with the figures and status, to the ledger',
  })
  async verify(
    @Param('type', oneOf(VERIFY_TYPES)) type: VerifyType,
    @Param('id') id: string,
  ): Promise<VerificationDto> {
    const r = await this.verifier.verify(type, id);
    return {
      type,
      id,
      onLedger: r.onLedger,
      matches: r.mismatches.length === 0,
      mismatches: r.mismatches,
      checkedAt: new Date(),
    };
  }

  @Post('sweeps')
  @Roles(Role.SUPER_ADMIN, Role.AUDITOR)
  @AuditAction()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({
    type: SweepDto,
    description: 'Checks every ledger record in the background',
  })
  startSweep(@CurrentUser() actor: AuthUser): Promise<SweepDto> {
    return this.sweeps.start(actor);
  }

  @Get('sweeps')
  @Roles(...AUDITORS)
  @ApiOkResponse({
    type: [SweepDto],
    description: 'The latest 50, newest first',
  })
  listSweeps(): Promise<SweepDto[]> {
    return this.sweeps.list();
  }

  @Get('sweeps/:id')
  @Roles(...AUDITORS)
  @ApiOkResponse({ type: SweepDto })
  sweep(@Param('id', uuid) id: string): Promise<SweepDto> {
    return this.sweeps.one(id);
  }

  @Get('sweeps/:id/findings')
  @ApiPaged()
  @Roles(...AUDITORS)
  @ApiOkResponse({
    type: [SweepFindingDto],
    description: 'Records that differ',
  })
  findings(
    @Param('id', uuid) id: string,
    @Query() query: SweepFindingsQueryDto,
  ): Promise<Paginated<SweepFindingDto>> {
    return this.sweeps.findingsOf(id, query);
  }

  @Get('log')
  @ApiPaged()
  @Roles(Role.SUPER_ADMIN, Role.AUDITOR)
  @ApiOkResponse({
    type: [AuditLogEntryDto],
    description: 'Write requests, newest first',
  })
  auditLog(
    @Query() query: AuditLogQueryDto,
  ): Promise<Paginated<AuditLogEntryDto>> {
    return this.log.search(query);
  }
}
