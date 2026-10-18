import { ApiPaged } from '../../common/swagger/envelope';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Paginated } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { Role } from '../users/roles';
import { JobHistoryQueryDto, JobRunDto, JobStatusDto } from './dto/job.dto';
import { JobScheduler } from './job-scheduler';

const READERS = [Role.SUPER_ADMIN, Role.ADMIN, Role.AUDITOR];

/** The scheduled jobs: their status, history, and running one now. */
@ApiTags('Jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private readonly scheduler: JobScheduler) {}

  @Get()
  @Roles(...READERS)
  @ApiOkResponse({ type: [JobStatusDto] })
  status(): Promise<JobStatusDto[]> {
    return this.scheduler.status();
  }

  @Get(':name/runs')
  @ApiPaged()
  @Roles(...READERS)
  @ApiOkResponse({
    type: [JobRunDto],
    description:
      'Runs that did something, failed, or were started by hand; newest first',
  })
  history(
    @Param('name') name: string,
    @Query() query: JobHistoryQueryDto,
  ): Promise<Paginated<JobRunDto>> {
    return this.scheduler.history(name, query);
  }

  @Post(':name/run')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: JobRunDto,
    description: 'Runs it now and waits for the result',
  })
  runNow(
    @CurrentUser() actor: AuthUser,
    @Param('name') name: string,
  ): Promise<JobRunDto> {
    return this.scheduler.runNow(name, actor);
  }
}
