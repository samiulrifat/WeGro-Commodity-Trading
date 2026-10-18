import { NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import {
  actor,
  fakeQueryBuilder,
  fakeRepo,
  Role,
} from '../../../test/support/unit';
import type { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';

const note = (id: number, over: Partial<Notification> = {}) =>
  ({
    id: String(id),
    userId: 'u',
    category: 'action',
    kind: 'k',
    title: `t${id}`,
    body: null,
    subjectType: 'project',
    subjectId: 'p1',
    createdAt: new Date(),
    readAt: null,
    ...over,
  }) as Notification;

/** Query builder that records its clauses and returns `rows`. */
function builder(rows: Notification[]) {
  const fake = fakeQueryBuilder({ getMany: rows });
  return { qb: fake.qb, clauses: fake.wheres, calls: fake.calls };
}

describe('NotificationsService', () => {
  const me = actor(Role.INVESTOR, { id: 'u' });

  it('pages newest first by id, handing back where the next page starts', async () => {
    const { qb, clauses, calls } = builder([note(9), note(8), note(7)]);
    const service = new NotificationsService(
      fakeRepo({ createQueryBuilder: jest.fn(() => qb) }) as never,
    );
    const page = await service.list(me, {
      limit: 2,
      unread: true,
      before: 10,
    } as never);
    expect(page.items.map((i) => i.id)).toEqual([9, 8]);
    expect(page.nextBefore).toBe(8);
    // One extra row tells whether another page exists.
    expect(calls).toContainEqual(['limit', 3]);
    expect(clauses()).toEqual([
      'n.user_id = :me',
      'n.read_at IS NULL',
      'n.id < :before',
    ]);
    expect(page.items[0].subject).toEqual({ type: 'project', id: 'p1' });
  });

  it('ends paging on the last page', async () => {
    const { qb } = builder([note(2)]);
    const service = new NotificationsService(
      fakeRepo({ createQueryBuilder: jest.fn(() => qb) }) as never,
    );
    await expect(
      service.list(me, { limit: 5 } as never),
    ).resolves.toMatchObject({ nextBefore: null });
  });

  it('marks only the reader’s own notification, once', async () => {
    const notes = fakeRepo({
      findOneBy: jest.fn(() => Promise.resolve(note(4))),
      findOneByOrFail: jest.fn(() =>
        Promise.resolve(note(4, { readAt: new Date() })),
      ),
    });
    const service = new NotificationsService(notes as never);
    const res = await service.markRead(me, 4);
    expect(notes.findOneBy).toHaveBeenCalledWith({ id: '4', userId: 'u' });
    expect(notes.update).toHaveBeenCalledWith(
      { id: '4', readAt: IsNull() },
      expect.anything(),
    );
    expect(res.readAt).toBeInstanceOf(Date);
  });

  it('does not touch a notification already read', async () => {
    const read = note(4, { readAt: new Date() });
    const notes = fakeRepo({
      findOneBy: jest.fn(() => Promise.resolve(read)),
      findOneByOrFail: jest.fn(() => Promise.resolve(read)),
    });
    await new NotificationsService(notes as never).markRead(me, 4);
    expect(notes.update).not.toHaveBeenCalled();
  });

  it('answers 404 for someone else’s notification', async () => {
    const service = new NotificationsService(fakeRepo() as never);
    await expect(service.markRead(me, 4)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('marks all unread and counts what changed', async () => {
    const notes = fakeRepo({
      update: jest.fn(() => Promise.resolve({ affected: 3 })),
    });
    await expect(
      new NotificationsService(notes as never).markAllRead(me),
    ).resolves.toBe(3);
    expect(notes.update).toHaveBeenCalledWith(
      { userId: 'u', readAt: IsNull() },
      expect.anything(),
    );
  });
});
