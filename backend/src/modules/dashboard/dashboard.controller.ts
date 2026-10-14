import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { DASHBOARD_ROLES } from './dashboard-queues';
import { DashboardService } from './dashboard.service';
import { DashboardDto } from './dto/dashboard.dto';

/** The staff dashboard, tailored to the caller's role. */
@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Roles(...DASHBOARD_ROLES)
  @ApiOkResponse({
    type: DashboardDto,
    description:
      'Funding progress, active projects, stages, the queues your role acts on, figures and trends',
  })
  get(@CurrentUser() actor: AuthUser): Promise<DashboardDto> {
    return this.dashboard.dashboard(actor);
  }
}
