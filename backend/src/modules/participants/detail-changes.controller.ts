import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Paginated } from '../../common/dto/pagination.dto';
import { ApiPaged } from '../../common/swagger/envelope';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { PasswordResetRequestedDto } from '../auth/dto/auth-response.dto';
import type { CodeIssued } from '../auth/sms-code.service';
import { Role } from '../users/roles';
import { DetailChangesService } from './detail-changes.service';
import {
  ApproveDetailChangeDto,
  DetailChangeRequestDto,
  DetailChangeReviewDto,
  DetailChangesQueryDto,
  DetailChangeSummaryDto,
  MyDetailsDto,
  PhoneCodeRequestDto,
  RejectDetailChangeDto,
} from './dto/detail-change.dto';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/** People changing their own details, and the admins who approve the changes. */
@ApiTags('Participants')
@ApiBearerAuth()
@Controller()
export class DetailChangesController {
  constructor(private readonly changes: DetailChangesService) {}

  @Get('me/details')
  @ApiOkResponse({ type: MyDetailsDto })
  mine(@CurrentUser() actor: AuthUser): Promise<MyDetailsDto> {
    return this.changes.mine(actor);
  }

  @Post('me/details/phone-code')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: PasswordResetRequestedDto,
    description: 'Texts a 6-digit code to the new number',
  })
  phoneCode(
    @CurrentUser() actor: AuthUser,
    @Body() dto: PhoneCodeRequestDto,
  ): Promise<CodeIssued> {
    return this.changes.phoneCode(actor, dto.phone);
  }

  @Post('me/details/change')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: MyDetailsDto,
    description:
      'Asks for the details to be as given; an admin approves (the super admin for staff). The super admin’s apply at once.',
  })
  submit(
    @CurrentUser() actor: AuthUser,
    @Body() dto: DetailChangeRequestDto,
  ): Promise<MyDetailsDto> {
    return this.changes.submit(actor, dto);
  }

  @Delete('me/details/change')
  @ApiOkResponse({
    type: MyDetailsDto,
    description: 'Takes back a change still waiting',
  })
  withdraw(@CurrentUser() actor: AuthUser): Promise<MyDetailsDto> {
    return this.changes.withdraw(actor);
  }

  @Get('detail-changes')
  @ApiPaged()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOkResponse({
    type: [DetailChangeSummaryDto],
    description: 'Oldest first',
  })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() q: DetailChangesQueryDto,
  ): Promise<Paginated<DetailChangeSummaryDto>> {
    return this.changes.list(actor, q);
  }

  @Get('detail-changes/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOkResponse({ type: DetailChangeReviewDto })
  review(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<DetailChangeReviewDto> {
    return this.changes.review(actor, id);
  }

  @Post('detail-changes/:id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOkResponse({ type: DetailChangeReviewDto })
  approve(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: ApproveDetailChangeDto,
  ): Promise<DetailChangeReviewDto> {
    return this.changes.approve(actor, id, dto.acknowledgeFlags);
  }

  @Post('detail-changes/:id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOkResponse({ type: DetailChangeReviewDto })
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: RejectDetailChangeDto,
  ): Promise<DetailChangeReviewDto> {
    return this.changes.reject(actor, id, dto.reason);
  }
}
