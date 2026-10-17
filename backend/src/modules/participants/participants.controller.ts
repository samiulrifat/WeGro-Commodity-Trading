import { ApiPaged } from '../../common/swagger/envelope';
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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Paginated } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { Role } from '../users/roles';
import {
  AssignFieldOfficerDto,
  ListParticipantsQueryDto,
  RegisterParticipantDto,
  RejectParticipantDto,
  VerifyParticipantDto,
} from './dto/participant-request.dto';
import {
  IntegrityReportDto,
  ParticipantDetailDto,
  ParticipantSummaryDto,
  RegisteredParticipantDto,
  TemporaryPasswordDto,
} from './dto/participant-response.dto';
import { ParticipantsService } from './participants.service';

const uuid = new ParseUUIDPipe({ version: '4' });

/**
 * The practice ID check and everything AccessRegistry records about people.
 * Roles are checked here and again by the contracts.
 */
@ApiTags('Participants')
@ApiBearerAuth()
@Controller('participants')
export class ParticipantsController {
  constructor(private readonly participants: ParticipantsService) {}

  @Post()
  @Roles(Role.SuperAdmin, Role.Admin, Role.FieldOfficer)
  @ApiCreatedResponse({ type: RegisteredParticipantDto })
  register(
    @CurrentUser() actor: AuthUser,
    @Body() dto: RegisterParticipantDto,
  ): Promise<RegisteredParticipantDto> {
    return this.participants.register(actor, dto);
  }

  @Get()
  @ApiPaged()
  @Roles(Role.SuperAdmin, Role.Admin, Role.FieldOfficer, Role.Auditor)
  @ApiOkResponse({ type: [ParticipantSummaryDto] })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListParticipantsQueryDto,
  ): Promise<Paginated<ParticipantSummaryDto>> {
    return this.participants.list(actor, query);
  }

  @Get(':id')
  @Roles(Role.SuperAdmin, Role.Admin, Role.FieldOfficer, Role.Auditor)
  @ApiOkResponse({ type: ParticipantDetailDto })
  findOne(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<ParticipantDetailDto> {
    return this.participants.findOne(actor, id);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SuperAdmin, Role.Admin)
  @ApiOkResponse({ type: ParticipantDetailDto })
  verify(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: VerifyParticipantDto,
  ): Promise<ParticipantDetailDto> {
    return this.participants.verify(actor, id, dto.acknowledgeFlags);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SuperAdmin, Role.Admin)
  @ApiOkResponse({ type: ParticipantDetailDto })
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: RejectParticipantDto,
  ): Promise<ParticipantDetailDto> {
    return this.participants.reject(actor, id, dto.reason);
  }

  @Put(':id/field-officer')
  @Roles(Role.Admin)
  @ApiOkResponse({ type: ParticipantDetailDto })
  assignFieldOfficer(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: AssignFieldOfficerDto,
  ): Promise<ParticipantDetailDto> {
    return this.participants.assignFieldOfficer(actor, id, dto.officerId);
  }

  @Post(':id/replace-key')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SuperAdmin, Role.Admin)
  @ApiOkResponse({ type: ParticipantDetailDto })
  replaceKey(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<ParticipantDetailDto> {
    return this.participants.replaceKey(actor, id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SuperAdmin, Role.Admin)
  @ApiOkResponse({ type: TemporaryPasswordDto })
  resetPassword(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<TemporaryPasswordDto> {
    return this.participants.resetPassword(actor, id);
  }

  @Post(':id/sync')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SuperAdmin, Role.Admin)
  @ApiOkResponse({ type: ParticipantDetailDto })
  sync(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<ParticipantDetailDto> {
    return this.participants.syncWithLedger(actor, id);
  }

  @Get(':id/integrity')
  @Roles(Role.SuperAdmin, Role.Admin, Role.Auditor)
  @ApiOkResponse({ type: IntegrityReportDto })
  integrity(@Param('id', uuid) id: string): Promise<IntegrityReportDto> {
    return this.participants.integrity(id);
  }
}
