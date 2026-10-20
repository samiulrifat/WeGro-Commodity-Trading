import { ApiPaged } from '../../common/swagger/envelope';
import {
  BadRequestException,
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
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ErrorCode } from '../../common/errors/error-code';
import { MAX_PHOTO_BYTES } from '../field-records/photos.service';
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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
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
  @ApiPaged()
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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOkResponse({ type: ProjectDto, description: 'Drafts only' })
  update(
    @Param('id', uuid) id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectDto> {
    return this.projects.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Drafts only' })
  remove(@Param('id', uuid) id: string): Promise<void> {
    return this.projects.remove(id);
  }

  @Post(':id/publish')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ProjectDto })
  readyForSale(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<ProjectDto> {
    return this.projects.advance(actor, id, 'markReadyForSale');
  }

  @Post(':id/close')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ProjectDto })
  close(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<ProjectDto> {
    return this.projects.advance(actor, id, 'close');
  }

  @Post(':id/cancel')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
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

  @Post(':id/cover')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({
    type: ProjectDto,
    description: 'JPEG, PNG or WebP up to 10 MB; drafts only',
  })
  setCover(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ProjectDto> {
    if (!file)
      throw new BadRequestException({
        message: 'Send the photo as the "file" field',
        code: ErrorCode.PHOTO_FIELD_MISSING,
      });
    return this.projects.setCover(actor, id, file.buffer);
  }

  @Get(':id/cover')
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @ApiOkResponse({ description: 'The cover photo' })
  cover(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Res() res: Response,
  ): Promise<void> {
    return this.projects.sendCover(actor, id, res);
  }

  @Put(':id/favourite')
  @Roles(Role.INVESTOR)
  @ApiOkResponse({ type: ProjectDto, description: 'Saved to your favourites' })
  addFavourite(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<ProjectDto> {
    return this.projects.setFavourite(actor, id, true);
  }

  @Delete(':id/favourite')
  @Roles(Role.INVESTOR)
  @ApiOkResponse({ type: ProjectDto, description: 'Taken off your favourites' })
  removeFavourite(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<ProjectDto> {
    return this.projects.setFavourite(actor, id, false);
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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.AUDITOR)
  @ApiOkResponse({ type: ProjectIntegrityDto })
  integrity(@Param('id', uuid) id: string): Promise<ProjectIntegrityDto> {
    return this.projects.integrity(id);
  }

  @Post(':id/reservations')
  @Roles(Role.INVESTOR)
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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTS, Role.AUDITOR)
  @ApiOkResponse({ type: [HoldingDto] })
  holders(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<HoldingDto[]> {
    return this.reservations.holders(actor, id);
  }

  @Get(':id/refunds')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTS, Role.AUDITOR)
  @ApiOkResponse({ type: [RefundLineDto] })
  refunds(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<RefundLineDto[]> {
    return this.reservations.refundLines(actor, id);
  }

  @Post(':id/refunds')
  @Roles(Role.ACCOUNTS)
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
  @ApiPaged()
  @Roles(
    Role.INVESTOR,
    Role.ACCOUNTS,
    Role.ADMIN,
    Role.SUPER_ADMIN,
    Role.AUDITOR,
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
    Role.INVESTOR,
    Role.ACCOUNTS,
    Role.ADMIN,
    Role.SUPER_ADMIN,
    Role.AUDITOR,
  )
  @ApiOkResponse({ type: ReservationDto })
  findOne(
    @CurrentUser() actor: AuthUser,
    @Param('id', reservationId) id: number,
  ): Promise<ReservationDto> {
    return this.reservations.findOne(actor, id);
  }

  @Post(':id/confirm')
  @Roles(Role.ACCOUNTS)
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
  @Roles(Role.INVESTOR, Role.SUPER_ADMIN, Role.ADMIN)
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
  @Roles(Role.INVESTOR)
  @ApiOkResponse({
    type: [InvestmentDto],
    description: 'Your holdings, with the estimated return range',
  })
  mine(@CurrentUser() actor: AuthUser): Promise<InvestmentDto[]> {
    return this.reservations.investments(actor);
  }
}
