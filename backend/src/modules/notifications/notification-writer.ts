import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { Role } from '../users/roles';
import {
  NotificationCategory,
  NotificationKind,
  type NotificationParams,
} from './notification.enums';

/** One notification, before it is addressed. */
export interface Note {
  category: NotificationCategory;
  kind: NotificationKind;
  /** English wording; the app words it from kind and params. */
  title: string;
  body?: string | null;
  /** The values in the wording; {} when it has none. */
  params: NotificationParams;
  subject?: { type: string; id: string | number } | null;
  /** The occasion; the recipient is appended to make the dedupe key. */
  key: string;
}

/**
 * Writes notifications. Every batch is one INSERT over parallel arrays,
 * and a notification already sent (same occasion, same person) is skipped
 * by the unique dedupe key, so producing it again is harmless.
 */
@Injectable()
export class NotificationWriter {
  /** Returns how many were new (not sent before). */
  async send(
    m: EntityManager,
    recipients: Iterable<string | null | undefined>,
    note: Note,
  ): Promise<number> {
    return this.sendMany(
      m,
      [...new Set([...recipients].filter((r): r is string => !!r))].map(
        (userId) => ({ userId, note }),
      ),
    );
  }

  async sendMany(
    m: EntityManager,
    items: Array<{ userId: string; note: Note }>,
  ): Promise<number> {
    if (items.length === 0) return 0;
    const col = <T>(f: (x: { userId: string; note: Note }) => T) =>
      items.map(f);
    const inserted: unknown[] = await m.query(
      `INSERT INTO notifications
         (user_id, category, kind, title, body, subject_type, subject_id, dedupe_key, params)
       SELECT * FROM unnest($1::uuid[], $2::varchar[], $3::varchar[], $4::varchar[], $5::varchar[],
                            $6::varchar[], $7::varchar[], $8::varchar[], $9::jsonb[])
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING 1`,
      [
        col((x) => x.userId),
        col((x) => x.note.category),
        col((x) => x.note.kind),
        col((x) => x.note.title.slice(0, 200)),
        col((x) => x.note.body?.slice(0, 500) ?? null),
        col((x) => x.note.subject?.type ?? null),
        col((x) => (x.note.subject ? String(x.note.subject.id) : null)),
        col((x) => `${x.note.key}:${x.userId}`.slice(0, 200)),
        col((x) => JSON.stringify(x.note.params)),
      ],
    );
    return inserted.length;
  }

  /** Verified people in these roles, the super admin among them (staff queues are small). */
  async withRole(
    m: EntityManager,
    roles: readonly Role[],
    except: Array<string | null> = [],
  ): Promise<string[]> {
    const rows: Array<{ id: string }> = await m.query(
      `SELECT id FROM users
        WHERE role = ANY($1) AND status = 'verified'
          AND chain_state IN ('confirmed', 'operator')
          AND NOT (id = ANY($2::uuid[]))`,
      [roles, except.filter((x): x is string => !!x)],
    );
    return rows.map((r) => r.id);
  }
}
