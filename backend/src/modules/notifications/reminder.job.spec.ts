import { Logger } from '@nestjs/common';
import { fakeClock } from '../../../test/support/unit';
import type { Note } from './notification-writer';
import { NotificationKind } from './notification.enums';
import { ReminderJob } from './reminder.job';

const NOW = new Date('2026-10-14T06:00:00Z');
const HOUR = 3_600_000;
const ADMINS = ['admin-1', 'admin-2'];
const SUPER_ADMINS = ['super-1'];

/**
 * Who is reminded of what, from rows as the database returns them. The
 * queries themselves run against Postgres in the chain suite.
 */
function setup(rows: Partial<Record<string, object[]>>) {
  const sent: Array<{ userId: string; note: Note }> = [];
  const query = jest.fn((sql: string) => {
    const table = Object.keys(rows).find((t) => sql.includes(`FROM ${t}`));
    return Promise.resolve(table ? rows[table] : []);
  });
  const writer = {
    withRole: jest.fn((_m: unknown, roles: string[]) =>
      Promise.resolve(roles.includes('super_admin') ? SUPER_ADMINS : ADMINS),
    ),
    sendMany: jest.fn((_m: unknown, items: typeof sent) => {
      sent.push(...items);
      return Promise.resolve(items.length);
    }),
  };
  const job = new ReminderJob(
    { manager: { query } } as never,
    writer as never,
    fakeClock(NOW) as never,
  );
  const to = (kind: NotificationKind) =>
    sent.filter((s) => s.note.kind === kind).map((s) => s.userId);
  return { job, sent, to, writer };
}

describe('ReminderJob', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("reminds the farmer's officer of a sale to confirm, and nobody if there is none", async () => {
    const { job, to } = setup({
      'voucher_sales s': [
        {
          id: '1',
          officer_id: 'officer-1',
          expires_at: new Date(NOW.getTime() + HOUR),
        },
        {
          id: '2',
          officer_id: null,
          expires_at: new Date(NOW.getTime() + HOUR),
        },
      ],
    });
    await expect(job.run()).resolves.toBe(1);
    expect(to(NotificationKind.SALE_CONFIRM_DUE)).toEqual(['officer-1']);
  });

  it('reminds a buyer of an approved deal’s payment before it lapses', async () => {
    const due = new Date(NOW.getTime() + 2 * HOUR);
    const { job, sent } = setup({
      offers: [
        { id: '9', buyer_id: 'buyer-1', amount: '480000', payment_due_at: due },
      ],
    });
    await expect(job.run()).resolves.toBe(1);
    expect(sent).toEqual([
      {
        userId: 'buyer-1',
        note: expect.objectContaining({
          kind: NotificationKind.DEAL_PAYMENT_DUE,
          title: 'Payment for deal #9 is due soon',
          params: {
            offerId: '9',
            amount: '4800.00',
            paymentDueAt: due.toISOString(),
          },
          subject: { type: 'offer', id: '9' },
        }),
      },
    ]);
  });

  it('warns of a voucher nearing its inactivity limit, then says when it passed', async () => {
    const voucher = (id: string, deadline: Date, officer: string | null) => ({
      id,
      officer_id: officer,
      deadline,
      input_type_code: 'UREA',
      input: 'Urea',
      input_bn: 'ইউরিয়া',
      title: 'Maize in Bogura',
    });
    const soon = new Date(NOW.getTime() + 24 * HOUR);
    const passed = new Date(NOW.getTime() - HOUR);
    const { job, sent, to } = setup({
      'vouchers v': [
        voucher('v1', soon, 'officer-1'),
        // The officer is also an admin here: told once.
        voucher('v2', passed, 'admin-1'),
      ],
    });
    await job.run();
    expect(to(NotificationKind.VOUCHER_INACTIVE_SOON)).toEqual([
      'officer-1',
      ...ADMINS,
    ]);
    expect(to(NotificationKind.VOUCHER_INACTIVE)).toEqual(ADMINS);
    const note = sent.find(
      (s) => s.note.kind === NotificationKind.VOUCHER_INACTIVE,
    )!.note;
    expect(note.key).toBe(`voucher:v2:inactive:${passed.getTime() / 1000}`);
    expect(note.params).toMatchObject({ input: 'Urea', inputBn: 'ইউরিয়া' });
  });

  it('tells whoever holds an expiring receipt, and its warehouse', async () => {
    const receipt = (id: string, over: object) => ({
      id,
      expires_on: '2026-10-20',
      owner_is_wegro: false,
      owner_id: 'farmer-1',
      officer_id: 'officer-1',
      operators: ['operator-1'],
      quantity: '500',
      produce_code: 'MAIZE',
      produce: null,
      produce_bn: null,
      ...over,
    });
    const { job, sent } = setup({
      'warehouse_receipts r': [
        receipt('0xaa  ', {}),
        receipt('0xbb', {
          owner_is_wegro: true,
          owner_id: null,
          operators: null,
        }),
      ],
    });
    await job.run();
    const of = (id: string) =>
      sent.filter((s) => s.note.subject?.id === id).map((s) => s.userId);
    expect(of('0xaa')).toEqual(['farmer-1', 'officer-1', 'operator-1']);
    expect(of('0xbb')).toEqual(ADMINS);
    // Without its name in the catalog, the produce is named by its code.
    expect(sent[0].note.key).toBe('receipt:0xaa:expiring:2026-10-20');
  });

  it("tells the farmer and their officer a bank's permission ends soon, or the super admin standing in", async () => {
    const consent = (id: string, officer: string | null) => ({
      id,
      farmer_id: 'farmer-1',
      officer_id: officer,
      expires_at: new Date(NOW.getTime() + 5 * 24 * HOUR),
      bank: 'Sonali Bank, Bogura',
    });
    const { job, sent } = setup({
      'bank_consents c': [consent('c1', 'officer-1'), consent('c2', null)],
    });
    await job.run();
    const of = (id: string) =>
      sent.filter((s) => s.note.subject?.id === id).map((s) => s.userId);
    expect(of('c1')).toEqual(['farmer-1', 'officer-1']);
    expect(of('c2')).toEqual(['farmer-1', ...SUPER_ADMINS]);
    expect(sent[0].note.title).toBe(
      'Permission for Sonali Bank, Bogura ends soon',
    );
  });

  it('runs one sweep at a time, sharing it with whoever asks meanwhile', async () => {
    const { job, writer } = setup({});
    const [a, b] = await Promise.all([job.run(), job.run()]);
    expect(a).toBe(b);
    expect(writer.sendMany).toHaveBeenCalledTimes(1);
    await job.run();
    expect(writer.sendMany).toHaveBeenCalledTimes(2);
  });
});
