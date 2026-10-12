import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Paginated } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { Role } from '../users/roles';
import {
  CreateProjectDto,
  ListProjectsQueryDto,
  ListReservationsQueryDto,
  PaymentReferenceDto,
  RecordRefundDto,
  ReserveSlotsDto,
  UpdateProjectDto,
} from './dto/project-request.dto';
import {
  HoldingDto,
  InvestmentDto,
  ProjectDto,
  ProjectIntegrityDto,
  RefundLineDto,
  ReservationDto,
  TimelineEntryDto,
} from './dto/project-response.dto';
import { ProjectsService } from './projects.service';
import { ReservationsService } from './reservations.service';

const uuid = new ParseUUIDPipe({ version: '4' });
const reservationId = new ParseIntPipe({
  errorHttpStatusCode: HttpStatus.NOT_FOUND,
});

/** Projects and their stages. Every change is checked here and again by ProjectLedger. */
@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly reservations: ReservationsService,
  ) {}

  @Post()
  @Roles(Role.Admin)
  @ApiCreatedResponse({
    type: ProjectDto,
    description: 'A draft, editable until published',
  })
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectDto> {
    return this.projects.create(actor, dto);
  }

  @Get()
  @ApiOkResponse({ type: [ProjectDto] })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListProjectsQueryDto,
  ): Promise<Paginated<ProjectDto>> {
    return this.projects.list(actor, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProjectDto })
  findOne(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<ProjectDto> {
    return this.projects.findOne(actor, id);
  }

  @Patch(':id')
  @Roles(Role.Admin)
  @ApiOkResponse({ type: ProjectDto, description: 'Drafts only' })
  update(
    @Param('id', uuid) id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectDto> {
    return this.projects.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Drafts only' })
  remove(@Param('id', uuid) id: string): Promise<void> {
    return this.projects.remove(id);
  }

  @Post(':id/publish')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ProjectDto,
    description: 'Fixes the terms on the ledger and opens funding',
  })
  publish(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<ProjectDto> {
    return this.projects.publish(actor, id);
  }

  @Post(':id/activate')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ProjectDto,
    description:
      'Funded to Active (normally done by the first approved voucher)',
  })
  activate(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<ProjectDto> {
    return this.projects.advance(actor, id, 'activate');
  }

  @Post(':id/ready-for-sale')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ProjectDto })
  readyForSale(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<ProjectDto> {
    return this.projects.advance(actor, id, 'markReadyForSale');
  }

  @Post(':id/close')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ProjectDto })
  close(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<ProjectDto> {
    return this.projects.advance(actor, id, 'close');
  }

  @Post(':id/cancel')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ProjectDto,
    description: 'Before Active; investors who paid are owed refunds',
  })
  cancel(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<ProjectDto> {
    return this.projects.advance(actor, id, 'cancelProject');
  }

  @Get(':id/timeline')
  @ApiOkResponse({ type: [TimelineEntryDto] })
  timeline(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<TimelineEntryDto[]> {
    return this.projects.timeline(actor, id);
  }

  @Get(':id/integrity')
  @Roles(Role.SuperAdmin, Role.Admin, Role.Auditor)
  @ApiOkResponse({ type: ProjectIntegrityDto })
  integrity(@Param('id', uuid) id: string): Promise<ProjectIntegrityDto> {
    return this.projects.integrity(id);
  }

  @Post(':id/reservations')
  @Roles(Role.Investor)
  @ApiCreatedResponse({
    type: ReservationDto,
    description: 'Expires if unpaid',
  })
  reserve(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ReserveSlotsDto,
  ): Promise<ReservationDto> {
    return this.reservations.reserve(actor, id, dto.slots);
  }

  @Get(':id/holders')
  @Roles(Role.SuperAdmin, Role.Admin, Role.Accounts, Role.Auditor)
  @ApiOkResponse({ type: [HoldingDto] })
  holders(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<HoldingDto[]> {
    return this.reservations.holders(actor, id);
  }

  @Get(':id/refunds')
  @Roles(Role.SuperAdmin, Role.Admin, Role.Accounts, Role.Auditor)
  @ApiOkResponse({ type: [RefundLineDto] })
  refunds(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<RefundLineDto[]> {
    return this.reservations.refundLines(actor, id);
  }

  @Post(':id/refunds')
  @Roles(Role.Accounts)
  @ApiCreatedResponse({ type: [RefundLineDto] })
  recordRefund(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: RecordRefundDto,
  ): Promise<RefundLineDto[]> {
    return this.reservations.recordRefund(
      actor,
      id,
      dto.investorId,
      dto.paymentReference,
    );
  }
}

/** Reservations across projects: investors see their own, Accounts confirm payments. */
@ApiTags('Projects')
@ApiBearerAuth()
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @Roles(
    Role.Investor,
    Role.Accounts,
    Role.Admin,
    Role.SuperAdmin,
    Role.Auditor,
  )
  @ApiOkResponse({ type: [ReservationDto] })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListReservationsQueryDto,
  ): Promise<Paginated<ReservationDto>> {
    return this.reservations.list(actor, query);
  }

  @Get(':id')
  @Roles(
    Role.Investor,
    Role.Accounts,
    Role.Admin,
    Role.SuperAdmin,
    Role.Auditor,
  )
  @ApiOkResponse({ type: ReservationDto })
  findOne(
    @CurrentUser() actor: AuthUser,
    @Param('id', reservationId) id: number,
  ): Promise<ReservationDto> {
    return this.reservations.findOne(actor, id);
  }

  @Post(':id/confirm')
  @Roles(Role.Accounts)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ReservationDto, description: 'Issues the slots' })
  confirm(
    @CurrentUser() actor: AuthUser,
    @Param('id', reservationId) id: number,
    @Body() dto: PaymentReferenceDto,
  ): Promise<ReservationDto> {
    return this.reservations.confirm(actor, id, dto.paymentReference);
  }

  @Post(':id/cancel')
  @Roles(Role.Investor, Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ReservationDto })
  cancel(
    @CurrentUser() actor: AuthUser,
    @Param('id', reservationId) id: number,
  ): Promise<ReservationDto> {
    return this.reservations.cancel(actor, id);
  }
}

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('investments')
export class InvestmentsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @Roles(Role.Investor)
  @ApiOkResponse({
    type: [InvestmentDto],
    description: 'Your holdings, with the estimated return range',
  })
  mine(@CurrentUser() actor: AuthUser): Promise<InvestmentDto[]> {
    return this.reservations.investments(actor);
  }
}
