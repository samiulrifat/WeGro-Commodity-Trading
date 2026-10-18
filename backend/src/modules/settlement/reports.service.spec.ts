import { randomUUID } from 'node:crypto';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { readCsv } from '../../data/csv-read';
import {
  fakeCrypto,
  fakeQueryBuilder,
  fakeRepo,
  Role,
} from '../../../test/support/unit';
import type { PayoutLine } from './entities/payout-line.entity';
import type { SettlementRound } from './entities/settlement-round.entity';
import { SettlementReportsService } from './reports.service';
import { lineContext } from './settlement.service';
import { PayeeRole, RoundStatus } from './settlement.enums';

const PROJECT = randomUUID();
const A = randomUUID();
const B = randomUUID();
const C = randomUUID();

const round = (over: Partial<SettlementRound> = {}) =>
  ({
    id: 5,
    projectId: PROJECT,
    isFinal: true,
    status: RoundStatus.APPROVED,
    income: 10_000_000n,
    costs: 3_000_000n,
    profit: 7_000_000n,
    farmerShare: 2_800_000n,
    investorShare: 2_800_000n,
    wegroShare: 1_400_000n,
    capitalReturn: 5_000_000n,
    leftover: 1n,
    approvedAt: new Date('2026-10-01T06:00:00Z'),
    preparedAt: new Date('2026-09-30T06:00:00Z'),
    paidAt: null,
    payeeCount: 3,
    paidCount: 1,
    verified: true,
    fingerprint: '0xf',
    ...over,
  }) as SettlementRound;

const line = (payeeId: string, over: Partial<PayoutLine> = {}) =>
  ({
    roundId: 5,
    payeeId,
    payeeRole: PayeeRole.INVESTOR,
    slots: 2,
    amount: 1_234_550n,
    verified: true,
    paidAt: null,
    paymentRefEnc: null,
    ...over,
  }) as PayoutLine;

/** A query routed by the table it reads. */
function queries(byTable: Record<string, unknown[]>) {
  return jest.fn((sql: string) => {
    for (const [table, rows] of Object.entries(byTable)) {
      if (sql.includes(table)) return Promise.resolve(rows);
    }
    return Promise.resolve([]);
  });
}

describe('SettlementReportsService', () => {
  const build = (
    opts: {
      round?: SettlementRound | null;
      rounds?: SettlementRound[];
      lines?: PayoutLine[];
      user?: object | null;
      sql?: Record<string, unknown[]>;
      projects?: object[];
    } = {},
  ) => {
    const crypto = fakeCrypto();
    const bank = {
      forPayout: jest.fn(() =>
        Promise.resolve({
          verified: new Map([
            [
              A,
              {
                holderName: 'Investor A',
                bankName: 'Krishi',
                branchName: 'Bogura',
                accountNumber: '0012',
                routingNumber: '035',
              },
            ],
            [
              B,
              {
                holderName: 'Investor B',
                bankName: 'Sonali',
                branchName: 'Rangpur',
                accountNumber: '0099',
                routingNumber: '200',
              },
            ],
          ]),
          pendingChange: new Set([B, C]),
        }),
      ),
    };
    const service = new SettlementReportsService(
      { query: queries(opts.sql ?? {}) } as never,
      fakeRepo({
        findOneBy: jest.fn(() =>
          Promise.resolve(opts.round === undefined ? round() : opts.round),
        ),
        find: jest.fn(() => Promise.resolve(opts.rounds ?? [])),
        createQueryBuilder: jest.fn(
          () => fakeQueryBuilder({ getMany: opts.rounds ?? [] }).qb,
        ),
      }) as never,
      fakeRepo({
        find: jest.fn(() => Promise.resolve(opts.lines ?? [])),
      }) as never,
      fakeRepo({
        findOne: jest.fn(() =>
          Promise.resolve({ id: PROJECT, title: 'Potato' }),
        ),
        findOneBy: jest.fn(() =>
          Promise.resolve({ id: PROJECT, title: 'Potato' }),
        ),
        find: jest.fn(() =>
          Promise.resolve(opts.projects ?? [{ id: PROJECT, title: 'Potato' }]),
        ),
      }) as never,
      fakeRepo({
        findOne: jest.fn(() =>
          Promise.resolve(
            opts.user === undefined
              ? { id: A, role: Role.INVESTOR }
              : opts.user,
          ),
        ),
      }) as never,
      fakeRepo({
        find: jest.fn(() =>
          Promise.resolve([A, B, C].map((userId) => ({ userId }))),
        ),
      }) as never,
      {
        openName: (r: { userId: string }) => `name-${r.userId.slice(0, 4)}`,
        openPhone: () => '+8801711000000',
      } as never,
      crypto as never,
      bank as never,
      {
        get: () => ({
          currentTotals: () => Promise.resolve([10_000_000n, 3_000_000n]),
          distributedProfit: () => Promise.resolve(7_000_000n),
        }),
      } as never,
    );
    return { service };
  };

  describe('payout sheet', () => {
    it('gives each line its bank details and says when they are missing or changing', async () => {
      const lines = [
        line(A, {
          paidAt: new Date('2026-10-02T00:00:00Z'),
          paymentRefEnc: `enc[${lineContext(5, A)}]NPSB-1`,
        }),
        line(B),
        line(C, { payeeRole: PayeeRole.FARMER, slots: null }),
      ];
      const { name, csv } = await build({ lines }).service.payoutSheet(5);
      expect(name).toBe('payout-round-5');
      const { rows } = readCsv(csv);
      const byPayee = new Map(rows.map((r) => [r.values.payee_id, r.values]));
      expect(byPayee.get(A)).toMatchObject({
        amount_taka: '12345.50',
        bank_details: 'verified',
        account_number: '0012',
        paid: 'yes', // the CSV writes yes/no
        payment_reference: 'NPSB-1',
      });
      expect(byPayee.get(B)).toMatchObject({
        bank_details: 'verified (a change is waiting for verification)',
        payment_reference: '',
      });
      expect(byPayee.get(C)).toMatchObject({
        bank_details: 'missing (details waiting for verification)',
        account_number: '',
      });
    });

    it('answers 404 for an unknown round', async () => {
      await expect(
        build({ round: null }).service.payoutSheet(5),
      ).rejects.toThrow(NotFoundException);
    });
  });

  it('lists a project’s income and cost items next to the ledger’s totals', async () => {
    const { csv } = await build({
      sql: {
        'FROM offers': [
          {
            id: '1',
            at: new Date('2026-09-01'),
            quantity: '100',
            amount: '6000000',
            produce_code: 'POTATO',
          },
        ],
        'FROM insurance_claims': [
          { id: 'c1', at: new Date('2026-09-02'), amount: '4000000' },
        ],
        'FROM voucher_sales': [
          {
            id: '3',
            at: new Date('2026-08-01'),
            input_type_code: 'UREA',
            quantity: '10',
            amount: '2000000',
          },
        ],
        'FROM project_costs': [
          {
            cost_id: '4',
            incurred_on: '2026-08-10',
            category: 'labour',
            note: 'Crew',
            amount: '1000000',
          },
        ],
      },
      rounds: [round()],
    }).service.projectReport(PROJECT);
    const rows = readCsv(csv).rows.map((r) => r.values);
    const total = (item: string) =>
      rows.find((r) => r.item === item)?.amount_taka;
    expect(total('Income (items above)')).toBe('100000.00');
    expect(total('Income (ledger)')).toBe('100000.00');
    expect(total('Costs (items above)')).toBe('30000.00');
    expect(total('Net (ledger)')).toBe('70000.00');
    expect(rows.find((r) => r.item === 'labour: Crew')).toMatchObject({
      section: 'cost',
      reference: 'cost 4',
    });
    expect(total('Round 5 (final, approved): rounding kept by WeGro')).toBe(
      '0.01',
    );
  });

  describe('period report', () => {
    it('refuses a period backwards or longer than a year', async () => {
      await expect(
        build().service.periodReport('2026-10-02', '2026-10-01'),
      ).rejects.toThrow('to must not be before from');
      await expect(
        build().service.periodReport('2025-01-01', '2026-06-01'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('has one row per approved round, with every figure', async () => {
      const { name, csv } = await build({
        rounds: [round(), round({ id: 6, isFinal: false })],
      }).service.periodReport('2026-10-01', '2026-10-31');
      expect(name).toBe('settlement-2026-10-01-to-2026-10-31');
      const rows = readCsv(csv).rows.map((r) => r.values);
      expect(rows.map((r) => r.round_id)).toEqual(['5', '6']);
      expect(rows[0]).toMatchObject({
        project: 'Potato',
        profit_taka: '70000.00',
        checked_against_ledger: 'yes',
      });
    });
  });

  describe('statements', () => {
    const payouts = [
      {
        round_id: '7',
        project_id: PROJECT,
        is_final: false,
        approved_at: new Date('2026-06-01'),
        amount: '500000',
        paid_at: new Date('2026-06-02'),
        line_hash: '0xa ',
        verified: true,
      },
      {
        round_id: '9',
        project_id: PROJECT,
        is_final: true,
        approved_at: new Date('2026-10-01'),
        amount: '1500000',
        paid_at: null,
        line_hash: '0xb',
        verified: true,
      },
    ];

    it('adds up what an investor put in, received, is due and got back', async () => {
      const s = await build({
        sql: {
          'FROM payout_lines': payouts,
          'FROM reservations': [
            { project_id: PROJECT, slots: '3', refunded: null },
          ],
        },
        projects: [
          {
            id: PROJECT,
            title: 'Potato',
            stage: 'paid_out',
            slotPrice: 1_000_000n,
          },
        ],
      }).service.statement(A, {} as never);
      expect(s.totals).toEqual({
        invested: '30000.00',
        received: '5000.00',
        due: '15000.00',
        refunded: '0.00',
      });
      expect(s.projects[0]).toMatchObject({ slots: 3, role: 'investor' });
      expect(
        s.projects[0].payouts.map((p) => [p.roundId, p.paid, p.lineHash]),
      ).toEqual([
        [7, true, '0xa'],
        [9, false, '0xb'],
      ]);
    });

    it('exists only for investors and farmers, and refuses a backwards range', async () => {
      await expect(
        build({ user: { id: A, role: Role.BUYER } }).service.statement(
          A,
          {} as never,
        ),
      ).rejects.toThrow(NotFoundException);
      await expect(
        build().service.statement(A, {
          from: '2026-10-02',
          to: '2026-10-01',
        } as never),
      ).rejects.toThrow('to must not be before from');
    });

    it('as CSV: a row per payout, then the totals', async () => {
      const { csv } = await build({
        sql: {
          'FROM payout_lines': payouts,
          'FROM reservations': [
            { project_id: PROJECT, slots: '3', refunded: '0' },
          ],
        },
        projects: [
          {
            id: PROJECT,
            title: 'Potato',
            stage: 'paid_out',
            slotPrice: 1_000_000n,
          },
        ],
      }).service.statementCsv(A, {} as never);
      const rows = readCsv(csv).rows.map((r) => r.values);
      expect(rows.map((r) => r.project)).toEqual([
        'Potato',
        'Potato',
        'TOTAL',
        'TOTAL received',
        'TOTAL due',
      ]);
      expect(rows[3].amount_taka).toBe('5000.00');
      expect(rows[4].amount_taka).toBe('15000.00');
    });
  });
});
