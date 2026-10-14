import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { uuidToBytes32 } from '../../../blockchain/utils/ids';
import { fakeRepo, matchesWhere, Role } from '../../../../test/support/unit';
import { HistoryService } from './history.service';

const PROJECT = randomUUID();
const INVESTOR = randomUUID();
const OPERATOR = '0x' + '0f'.repeat(20);
const CURRENT_KEY = '0x' + '11'.repeat(20);
const OLD_KEY = '0x' + '22'.repeat(20);
const STRANGER = '0x' + '33'.repeat(20);

const event = (over: Record<string, unknown>) => ({
  block_number: '10',
  log_index: 0,
  block_time: new Date('2026-10-01T00:00:00Z'),
  tx_hash: '0xabc   ', // char(66) padding from the database
  tx_from: CURRENT_KEY,
  contract: 'ProjectLedger',
  event_name: 'SlotsReserved',
  args: {
    projectId: uuidToBytes32(PROJECT),
    investorId: uuidToBytes32(INVESTOR),
    reservationId: '4',
  },
  ...over,
});

describe('HistoryService', () => {
  const build = (rows: object[]) => {
    const query = jest.fn((sql: string, params: unknown[] = []) => {
      if (sql.includes('COUNT(*)'))
        return Promise.resolve([{ total: String(rows.length) }]);
      if (sql.includes('CROSS JOIN LATERAL')) {
        // Keys since replaced: only what the users table no longer has.
        const asked = params[0] as string[];
        return Promise.resolve(
          asked.includes(OLD_KEY)
            ? [
                {
                  address: OLD_KEY,
                  participant: uuidToBytes32(INVESTOR),
                  role: 'investor',
                },
              ]
            : [],
        );
      }
      return Promise.resolve(rows);
    });
    const users = fakeRepo({
      find: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          [{ id: INVESTOR, account: CURRENT_KEY, role: Role.Investor }].filter(
            (u) => matchesWhere(u, where),
          ),
        ),
      ),
    });
    const service = new HistoryService(
      { query } as never,
      users as never,
      { operatorAddress: () => OPERATOR } as never,
      {
        names: jest.fn((ids: string[]) =>
          Promise.resolve(
            new Map(ids.map((id) => [id, `name-${id.slice(0, 4)}`])),
          ),
        ),
      } as never,
    );
    return { service, query, users };
  };

  it('finds every event naming the record, across the contracts its type lists', async () => {
    const { service, query } = build([event({})]);
    await service.history('project', PROJECT, { limit: 20, skip: 0 } as never);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain(
      'WHERE args @> $1::jsonb OR (contract = $3 AND args @> $2::jsonb)',
    );
    expect(sql).toContain('ORDER BY block_number ASC, log_index ASC');
    expect(params).toEqual([
      JSON.stringify({ projectId: uuidToBytes32(PROJECT) }),
      // Array arguments are matched by containment.
      JSON.stringify({ projectIds: [uuidToBytes32(PROJECT)] }),
      'ConsentRegistry',
    ]);
  });

  it('turns each id kind into its ledger form, and 404s an id that cannot be one', async () => {
    const { service, query } = build([]);
    await service.history('reservation', '0004', {
      limit: 5,
      skip: 0,
    } as never);
    expect(query.mock.calls[0][1]).toEqual([
      JSON.stringify({ reservationId: '4' }),
      'ProjectLedger',
    ]);
    await expect(
      service.history('project', 'nope', { limit: 5, skip: 0 } as never),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.history('reservation', '-1', { limit: 5, skip: 0 } as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('names the sender by their current key, or by a key they had before', async () => {
    const { service } = build([
      event({}),
      event({ tx_from: OLD_KEY, log_index: 1 }),
    ]);
    const page = await service.history('project', PROJECT, {
      limit: 20,
      skip: 0,
    } as never);
    const [now, before] = page.items;
    expect(now.actor).toEqual({
      kind: 'participant',
      address: CURRENT_KEY,
      id: INVESTOR,
      name: `name-${INVESTOR.slice(0, 4)}`,
      role: Role.Investor,
    });
    expect(before.actor).toMatchObject({ kind: 'participant', id: INVESTOR });
    expect(now.txHash).toBe('0xabc');
  });

  it('calls the operator’s expiries the system, and leaves unknown senders unnamed', async () => {
    const { service } = build([
      event({ tx_from: OPERATOR, event_name: 'ReservationExpired' }),
      event({ tx_from: STRANGER }),
      event({ tx_from: null }),
    ]);
    const page = await service.history('project', PROJECT, {
      limit: 20,
      skip: 0,
    } as never);
    expect(page.items.map((e) => e.actor)).toEqual([
      { kind: 'system', address: OPERATOR, name: 'System' },
      { kind: 'unknown', address: STRANGER },
      { kind: 'unknown', address: null },
    ]);
  });

  it('shows the people an event names, with readable arguments', async () => {
    const { service } = build([event({})]);
    const [entry] = (
      await service.history('project', PROJECT, { limit: 20, skip: 0 } as never)
    ).items;
    expect(entry.parties).toEqual({
      [INVESTOR]: `name-${INVESTOR.slice(0, 4)}`,
    });
    expect(entry.details).toMatchObject({
      projectId: PROJECT,
      investorId: INVESTOR,
    });
    expect(entry.title).toEqual(expect.any(String));
  });

  it('looks up past keys only for addresses the users table does not know', async () => {
    const { service, query } = build([event({})]);
    await service.history('project', PROJECT, { limit: 20, skip: 0 } as never);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('CROSS JOIN LATERAL'),
      ),
    ).toBe(false);
  });
});
