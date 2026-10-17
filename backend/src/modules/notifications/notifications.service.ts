import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user';
import type {
  ListNotificationsQueryDto,
  NotificationDto,
  NotificationPageDto,
} from './dto/notification.dto';
import { Notification } from './entities/notification.entity';
import { ErrorCode } from '../../common/errors/error-code';

/**
 * A person's own notifications. Pages are by keyset (newest first, "older
 * than id"), so a page costs the same however many have built up; the unread
 * count is served by a partial index on unread rows.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notes: Repository<Notification>,
  ) {}

  async list(
    actor: AuthUser,
    q: ListNotificationsQueryDto,
  ): Promise<NotificationPageDto> {
    const qb = this.notes
      .createQueryBuilder('n')
      .where('n.user_id = :me', { me: actor.id });
    if (q.unread) qb.andWhere('n.read_at IS NULL');
    if (q.before) qb.andWhere('n.id < :before', { before: q.before });
    const rows = await qb
      .orderBy('n.id', 'DESC')
      .limit(q.limit + 1)
      .getMany();
    const page = rows.slice(0, q.limit);
    return {
      items: page.map(view),
      nextBefore:
        rows.length > q.limit ? Number(page[page.length - 1].id) : null,
    };
  }

  async unreadCount(actor: AuthUser): Promise<number> {
    return this.notes.countBy({ userId: actor.id, readAt: IsNull() });
  }

  async markRead(actor: AuthUser, id: number): Promise<NotificationDto> {
    const note = await this.notes.findOneBy({
      id: String(id),
      userId: actor.id,
    });
    if (!note)
      throw new NotFoundException({
        message: 'Notification not found',
        code: ErrorCode.NotificationNotFound,
      });
    if (!note.readAt) {
      await this.notes.update(
        { id: note.id, readAt: IsNull() },
        { readAt: () => 'now()' },
      );
    }
    return view(await this.notes.findOneByOrFail({ id: note.id }));
  }

  async markAllRead(actor: AuthUser): Promise<number> {
    const res = await this.notes.update(
      { userId: actor.id, readAt: IsNull() },
      { readAt: () => 'now()' },
    );
    return res.affected ?? 0;
  }
}

function view(n: Notification): NotificationDto {
  return {
    id: Number(n.id),
    category: n.category,
    kind: n.kind,
    title: n.title,
    body: n.body,
    params: n.params,
    subject:
      n.subjectType && n.subjectId
        ? { type: n.subjectType, id: n.subjectId }
        : null,
    createdAt: n.createdAt,
    readAt: n.readAt,
  };
}
