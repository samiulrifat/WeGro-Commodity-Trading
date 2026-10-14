import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import {
  ListNotificationsQueryDto,
  MarkedReadDto,
  NotificationDto,
  NotificationPageDto,
  UnreadCountDto,
} from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

const noteId = new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/** Everyone's own in-app notifications. */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOkResponse({ type: NotificationPageDto })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<NotificationPageDto> {
    return this.notifications.list(actor, query);
  }

  @Get('unread-count')
  @ApiOkResponse({
    type: UnreadCountDto,
    description: 'For the badge; cheap to poll',
  })
  async unread(@CurrentUser() actor: AuthUser): Promise<UnreadCountDto> {
    return { unread: await this.notifications.unreadCount(actor) };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MarkedReadDto })
  async readAll(@CurrentUser() actor: AuthUser): Promise<MarkedReadDto> {
    return { marked: await this.notifications.markAllRead(actor) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: NotificationDto })
  read(
    @CurrentUser() actor: AuthUser,
    @Param('id', noteId) id: number,
  ): Promise<NotificationDto> {
    return this.notifications.markRead(actor, id);
  }
}
