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
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Paginated } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { PhotosService } from '../field-records/photos.service';
import { Role } from '../users/roles';
import { ClaimsService } from './claims.service';
import {
  ApproveClaimDto,
  AssessmentDto,
  ClaimDto,
  CoverageDto,
  InsuredProjectDto,
  InsuredProjectsQueryDto,
  ListClaimsQueryDto,
  ListWeatherEventsQueryDto,
  OpenClaimDto,
  RecordWeatherEventDto,
  SetCoverageDto,
  WeatherEventDto,
} from './dto/insurance.dto';
import { InsuranceService } from './insurance.service';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });
const index = new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });
const STAFF = [
  Role.SuperAdmin,
  Role.Admin,
  Role.Operations,
  Role.Accounts,
  Role.Auditor,
];
const READERS = [...STAFF, Role.Insurer, Role.FieldOfficer, Role.Farmer];

/** Crop insurance (InsuranceRegistry): cover, weather events and claims. */
@ApiTags('Insurance')
@ApiBearerAuth()
@Controller('insurance')
export class InsuranceController {
  constructor(
    private readonly insurance: InsuranceService,
    private readonly claims: ClaimsService,
    private readonly photos: PhotosService,
  ) {}

  // --- Cover ---

  @Get('projects')
  @ApiPaged()
  @Roles(...STAFF, Role.Insurer)
  @ApiOkResponse({
    type: [InsuredProjectDto],
    description: 'Insured projects in the field, with who covers each',
  })
  insuredProjects(
    @Query() query: InsuredProjectsQueryDto,
  ): Promise<Paginated<InsuredProjectDto>> {
    return this.insurance.insuredProjects(query);
  }

  @Get('projects/:projectId/coverage')
  @Roles(...READERS)
  @ApiOkResponse({ type: CoverageDto })
  coverage(
    @CurrentUser() actor: AuthUser,
    @Param('projectId', uuid) projectId: string,
  ): Promise<CoverageDto> {
    return this.insurance.coverage(actor, projectId);
  }

  @Put('projects/:projectId/coverage')
  @Roles(Role.Insurer)
  @ApiOkResponse({
    type: CoverageDto,
    description:
      'The first insurer becomes the project insurer; only they change it',
  })
  setCoverage(
    @CurrentUser() actor: AuthUser,
    @Param('projectId', uuid) projectId: string,
    @Body() dto: SetCoverageDto,
  ): Promise<CoverageDto> {
    return this.insurance.setCoverage(actor, projectId, dto);
  }

  // --- Weather events ---

  @Get('weather-events')
  @ApiPaged()
  @Roles(...READERS)
  @ApiOkResponse({ type: [WeatherEventDto], description: 'Newest first' })
  listWeatherEvents(
    @Query() query: ListWeatherEventsQueryDto,
  ): Promise<Paginated<WeatherEventDto>> {
    return this.insurance.listWeatherEvents(query);
  }

  @Get('weather-events/:id')
  @Roles(...READERS)
  @ApiOkResponse({ type: WeatherEventDto })
  weatherEvent(@Param('id', uuid) id: string): Promise<WeatherEventDto> {
    return this.insurance.weatherEvent(id);
  }

  @Post('weather-events')
  @Roles(Role.Admin, Role.Insurer)
  @ApiCreatedResponse({ type: WeatherEventDto })
  recordWeatherEvent(
    @CurrentUser() actor: AuthUser,
    @Body() dto: RecordWeatherEventDto,
  ): Promise<WeatherEventDto> {
    return this.insurance.recordWeatherEvent(actor, dto);
  }

  // --- Claims ---

  @Post('projects/:projectId/claims')
  @Roles(Role.FieldOfficer, Role.Admin)
  @ApiCreatedResponse({
    type: ClaimDto,
    description: "By the farmer's field officer or an admin, citing an event",
  })
  openClaim(
    @CurrentUser() actor: AuthUser,
    @Param('projectId', uuid) projectId: string,
    @Body() dto: OpenClaimDto,
  ): Promise<ClaimDto> {
    return this.claims.open(actor, projectId, dto);
  }

  @Get('claims')
  @ApiPaged()
  @Roles(...READERS)
  @ApiOkResponse({ type: [ClaimDto] })
  listClaims(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListClaimsQueryDto,
  ): Promise<Paginated<ClaimDto>> {
    return this.claims.list(actor, query);
  }

  @Get('claims/:id')
  @Roles(...READERS)
  @ApiOkResponse({ type: ClaimDto })
  claim(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<ClaimDto> {
    return this.claims.findOne(actor, id);
  }

  @Post('claims/:id/review')
  @Roles(Role.Insurer)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ClaimDto, description: "The project's insurer" })
  startReview(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<ClaimDto> {
    return this.claims.startReview(actor, id);
  }

  @Post('claims/:id/approve')
  @Roles(Role.Insurer)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ClaimDto,
    description: 'Within the remaining cover, with an assessment',
  })
  approve(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ApproveClaimDto,
  ): Promise<ClaimDto> {
    return this.claims.approve(actor, id, dto);
  }

  @Post('claims/:id/reject')
  @Roles(Role.Insurer)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ClaimDto, description: 'With an assessment' })
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: AssessmentDto,
  ): Promise<ClaimDto> {
    return this.claims.reject(actor, id, dto);
  }

  @Get('claims/:id/photos/:n')
  @Roles(...READERS)
  @ApiFile('image/jpeg', 'image/png', 'image/webp')
  async claimPhoto(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Param('n', index) n: number,
    @Res() res: Response,
  ): Promise<void> {
    await this.photos.send(await this.claims.claimPhoto(actor, id, n), res);
  }

  @Get('claims/:id/assessment/photo')
  @Roles(...READERS)
  @ApiFile('image/jpeg', 'image/png', 'image/webp')
  async assessmentPhoto(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.photos.send(await this.claims.assessmentPhoto(actor, id), res);
  }
}
