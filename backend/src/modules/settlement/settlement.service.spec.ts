import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { hashPaymentRef } from '../../blockchain/utils/payment-ref';
import { codeToBytes32, uuidToBytes32 } from '../../blockchain/utils/ids';
import {
  actor,
  config,
  fakeClock,
  fakeCrypto,
  fakeQueryBuilder,
  fakeRepo,
  fakeTx,
  matchesWhere,
  revert,
  Role,
} from '../../../test/support/unit';
import { photoHash } from '../field-records/photos.service';
import type { Project } from '../projects/entities/project.entity';
import { ProjectStage } from '../projects/project.enums';
import type { PayoutLine } from './entities/payout-line.entity';
import type { ProjectCost } from './entities/project-cost.entity';
import type { SettlementRound } from './entities/settlement-round.entity';
import {
  costFingerprint,
  MONTH_SECONDS,
  rejectFingerprint,
} from './settlement-math';
import { CATEGORY_CODE, CostStatus, RoundStatus } from './settlement.enums';
import { SettlementService } from './settlement.service';

const SECRET = 'payment-secret-for-tests-only-32b';
const NOW = new Date('2026-10-14T06:00:00Z');
const NOW_S = Math.floor(NOW.getTime() / 1000);
const PROJECT = randomUUID();
const FARMER = randomUUID();
const PAYEE = randomUUID();

/** What the ledgers say; numbers as the contracts return them. */
interface Ledger {
  stage: number;
  createdAt: number;
  interval: number;
  sales: bigint;
  insurance: bigint;
  inputs: bigint;
  other: bigint;
  distributed: bigint;
  openRound: number;
  lastRoundAt: number;
  settled: boolean;
  openReceipts: bigint;
  openTrades: bigint;
  pendingInputs: bigint;
  openClaims: bigint;
  unpaidClaims: bigint;
}

describe('SettlementService', () => {
  const accounts = actor(Role.ACCOUNTS);
  const second = actor(Role.ACCOUNTS);

  const build = (
    opts: {
      /** The round's lines, for an uploaded payout sheet. */
      sheetLines?: Partial<PayoutLine>[];
      project?: Partial<Project>;
      ledger?: Partial<Ledger>;
      cost?: Partial<ProjectCost>;
      blocking?: Partial<SettlementRound> | null;
      round?: Partial<SettlementRound>;
      line?: Partial<PayoutLine> | null;
      photo?: object | null;
      holds?: boolean;
      saveAffected?: number;
    } = {},
  ) => {
    const project = {
      id: PROJECT,
      farmerId: FARMER,
      title: 'Potato',
      stage: ProjectStage.ACTIVE,
      ...opts.project,
    } as Project;
    const l: Ledger = {
      stage: 4, // active
      createdAt: NOW_S - 4 * MONTH_SECONDS,
      interval: 3,
      sales: 10_000_000n,
      insurance: 0n,
      inputs: 2_000_000n,
      other: 1_000_000n,
      distributed: 0n,
      openRound: 0,
      lastRoundAt: 0,
      settled: false,
      openReceipts: 0n,
      openTrades: 0n,
      pendingInputs: 0n,
      openClaims: 0n,
      unpaidClaims: 0n,
      ...opts.ledger,
    };
    const contracts = {
      get: (name: string) =>
        ({
          ProjectLedger: {
            getProject: () =>
              Promise.resolve({
                stage: BigInt(l.stage),
                createdAt: BigInt(l.createdAt),
                issuedSlots: 5n,
                terms: {
                  payoutIntervalMonths: BigInt(l.interval),
                  farmerBps: 4000n,
                  investorBps: 4000n,
                  wegroBps: 2000n,
                  slotPrice: 1_000_000n,
                },
              }),
          },
          TradeLedger: {
            saleIncome: () => Promise.resolve(l.sales),
            openTrades: () => Promise.resolve(l.openTrades),
          },
          InsuranceRegistry: {
            paidTotal: () => Promise.resolve(l.insurance),
            openClaims: () => Promise.resolve(l.openClaims),
            unpaidClaims: () => Promise.resolve(l.unpaidClaims),
          },
          VoucherRegistry: {
            spentValue: () => Promise.resolve(l.inputs),
            pendingSaleValue: () => Promise.resolve(l.pendingInputs),
          },
          WarehouseReceipt: {
            openReceipts: () => Promise.resolve(l.openReceipts),
          },
          SettlementLedger: {
            otherCosts: () => Promise.resolve(l.other),
            distributedProfit: () => Promise.resolve(l.distributed),
            openRound: () => Promise.resolve(BigInt(l.openRound)),
            lastRoundAt: () => Promise.resolve(BigInt(l.lastRoundAt)),
            finalApproved: () => Promise.resolve(l.settled),
          },
        })[name],
    };
    const costs: ProjectCost[] = opts.cost
      ? [
          {
            id: randomUUID(),
            projectId: PROJECT,
            costId: 7,
            status: CostStatus.RECORDED,
            amount: 150_000n,
            voidedById: null,
            ...opts.cost,
          } as ProjectCost,
        ]
      : [];
    const costsRepo = fakeRepo({
      create: jest.fn((c: ProjectCost) => ({ ...c })),
      insert: jest.fn((c: ProjectCost) => (costs.push(c), Promise.resolve({}))),
      delete: jest.fn((where: Record<string, unknown>) => {
        const i = costs.findIndex((c) => matchesWhere(c as never, where));
        if (i >= 0) costs.splice(i, 1);
        return Promise.resolve({ affected: 1 });
      }),
      update: jest.fn((where: Record<string, unknown>, patch: object) => {
        const hit = costs.filter((c) => matchesWhere(c as never, where));
        hit.forEach((c) => Object.assign(c, patch));
        return Promise.resolve({ affected: hit.length });
      }),
      findOneBy: jest.fn(({ id }: { id: string }) =>
        Promise.resolve(costs.find((c) => c.id === id) ?? null),
      ),
    });
    const round = {
      id: 5,
      projectId: PROJECT,
      isFinal: false,
      status: RoundStatus.PREPARED,
      preparedById: accounts.id,
      verified: true,
      income: 0n,
      costs: 0n,
      profit: 0n,
      farmerShare: 0n,
      investorShare: 0n,
      wegroShare: 0n,
      capitalReturn: 0n,
      leftover: 0n,
      rejectReason: null,
      rejectReasonHash: null,
      ...opts.round,
    } as SettlementRound;
    const roundsRepo = fakeRepo({
      findOne: jest.fn(() => Promise.resolve(opts.blocking ?? null)),
      findOneBy: jest.fn(() => Promise.resolve(round)),
      find: jest.fn(() => Promise.resolve([])),
      update: jest.fn((where: Record<string, unknown>, patch: object) => {
        if (!matchesWhere(round as never, where))
          return Promise.resolve({ affected: 0 });
        Object.assign(round, patch);
        return Promise.resolve({ affected: 1 });
      }),
    });
    const line =
      opts.line === null
        ? null
        : ({
            roundId: 5,
            payeeId: PAYEE,
            amount: 1_200_000n,
            verified: true,
            paidAt: null,
            ...opts.line,
          } as PayoutLine);
    const update = fakeQueryBuilder({
      execute: { affected: opts.saveAffected ?? 1 },
    });
    const linesRepo = fakeRepo({
      findOneBy: jest.fn(() => Promise.resolve(line)),
      find: jest.fn(() => Promise.resolve(opts.sheetLines ?? [])),
      createQueryBuilder: jest.fn(() => update.qb),
    });
    const chain = fakeTx((call) =>
      call.method === 'prepareRound'
        ? [
            {
              contract: 'SettlementLedger',
              name: 'RoundPrepared',
              args: { roundId: 5n },
              logIndex: 0,
            },
          ]
        : [],
    );
    const dataSource = {
      // Holdings for previews, and whether an investor holds slots.
      query: jest.fn((sql: string) =>
        Promise.resolve(
          sql.includes('LIMIT 1')
            ? opts.holds
              ? [{ '?column?': 1 }]
              : []
            : [{ investor_id: PAYEE, slots: '5' }],
        ),
      ),
    };
    const service = new SettlementService(
      config({ PAYMENT_REF_SECRET: SECRET }),
      dataSource as never,
      costsRepo as never,
      roundsRepo as never,
      linesRepo as never,
      fakeRepo({ findOneBy: jest.fn(() => Promise.resolve(project)) }) as never,
      fakeRepo({ exists: jest.fn(() => Promise.resolve(false)) }) as never,
      fakeRepo({
        findOneBy: jest.fn(() =>
          Promise.resolve(
            opts.photo === undefined
              ? { id: 'bill', sha256: 'ab'.repeat(32) }
              : opts.photo,
          ),
        ),
      }) as never,
      { find: jest.fn() } as never,
      { names: () => Promise.resolve(new Map()) } as never,
      fakeCrypto() as never,
      contracts as never,
      chain.tx as never,
      // The ledger's events mark a stored cost recorded.
      {
        apply: jest.fn(() => {
          costs.forEach((c) => {
            if (c.status === CostStatus.SUBMITTED)
              c.status = CostStatus.RECORDED;
          });
          return Promise.resolve();
        }),
      } as never,
      fakeClock(NOW) as never,
    );
    return { service, costs, round, chain, update, roundsRepo };
  };

  describe('costs', () => {
    const dto = {
      category: 'labour',
      amount: '1500',
      incurredOn: '2026-10-10',
      note: 'Harvest crew',
      photoId: 'bill',
    };

    it('stores the cost with a fingerprint of its bill, then adds it on the ledger', async () => {
      const { service, costs, chain } = build();
      await service.addCost(accounts, PROJECT, dto as never);
      const c = costs[0];
      expect(c.detailsHash).toBe(
        costFingerprint({
          id: c.id,
          projectId: PROJECT,
          category: 'labour' as never,
          amount: 150_000n,
          incurredOn: '2026-10-10',
          note: 'Harvest crew',
          photoHash: photoHash('ab'.repeat(32)),
        }),
      );
      expect(chain.sent[0]).toMatchObject({
        method: 'addCost',
        args: [
          uuidToBytes32(PROJECT),
          codeToBytes32(CATEGORY_CODE('labour' as never)),
          150_000n,
          c.detailsHash,
        ],
      });
    });

    it('freezes costs once a final round is prepared or approved', async () => {
      const open = await build({ blocking: { status: RoundStatus.PREPARED } })
        .service.addCost(accounts, PROJECT, dto as never)
        .catch((e: ConflictException) => e.getResponse());
      expect(open).toMatchObject({ code: 'FINAL_ROUND_OPEN' });
      const settled = await build({ blocking: { status: RoundStatus.PAID } })
        .service.addCost(accounts, PROJECT, dto as never)
        .catch((e: ConflictException) => e.getResponse());
      expect(settled).toMatchObject({ code: 'ALREADY_SETTLED' });
    });

    it('refuses the wrong stage, a future date, a zero amount and someone else’s bill', async () => {
      await expect(
        build({
          project: { stage: ProjectStage.OPEN_FOR_FUNDING },
        }).service.addCost(accounts, PROJECT, dto as never),
      ).rejects.toThrow(ConflictException);
      await expect(
        build().service.addCost(accounts, PROJECT, {
          ...dto,
          incurredOn: '2026-10-15',
        } as never),
      ).rejects.toThrow('incurredOn cannot be in the future');
      await expect(
        build().service.addCost(accounts, PROJECT, {
          ...dto,
          amount: '0',
        } as never),
      ).rejects.toThrow('amount must be above zero');
      await expect(
        build({ photo: null }).service.addCost(accounts, PROJECT, dto as never),
      ).rejects.toThrow('photoId must be a photo you uploaded');
    });

    it('removes a cost the ledger refuses', async () => {
      const { service, costs, chain } = build();
      chain.fail(revert('ProjectSettled'));
      await expect(
        service.addCost(accounts, PROJECT, dto as never),
      ).rejects.toThrow();
      expect(costs).toEqual([]);
    });

    it('voids a recorded cost by its ledger id, undoing the mark if the ledger refuses', async () => {
      const { service, costs, chain } = build({ cost: {} });
      chain.fail(revert('CostAlreadyVoided'));
      await expect(service.voidCost(accounts, costs[0].id)).rejects.toThrow();
      expect(costs[0].voidedById).toBeNull();
      await service.voidCost(accounts, costs[0].id);
      expect(chain.sent[0]).toMatchObject({ method: 'voidCost', args: [7] });
      const voided = build({ cost: { status: CostStatus.VOIDED } });
      await expect(
        voided.service.voidCost(accounts, voided.costs[0].id),
      ).rejects.toThrow('This cost is already voided');
      const unconfirmed = build({ cost: { status: CostStatus.SUBMITTED } });
      await expect(
        unconfirmed.service.voidCost(accounts, unconfirmed.costs[0].id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('when a round may be prepared', () => {
    const staged = async (ledger: Partial<Ledger>) =>
      build({ ledger })
        .service.prepareRound(accounts, PROJECT, false)
        .then(
          () => 'allowed',
          (e: ConflictException) => (e.getResponse() as { code: string }).code,
        );

    it('a staged round: in the ledger’s order of checks', async () => {
      expect(await staged({ openRound: 3 })).toBe('ROUND_OPEN');
      expect(await staged({ settled: true })).toBe('ALREADY_SETTLED');
      expect(await staged({ stage: 5 })).toBe('ROUND_WRONG_STAGE');
      expect(await staged({ interval: 0 })).toBe('NOT_STAGED');
      expect(await staged({ createdAt: NOW_S - 2 * MONTH_SECONDS })).toBe(
        'TOO_EARLY',
      );
      expect(await staged({ sales: 3_000_000n })).toBe('NOTHING_TO_DISTRIBUTE');
      expect(await staged({})).toBe('allowed');
    });

    it('says when a staged round becomes possible', async () => {
      const created = NOW_S - 2 * MONTH_SECONDS;
      const err = await build({ ledger: { createdAt: created } })
        .service.prepareRound(accounts, PROJECT, false)
        .catch((e: ConflictException) => e.getResponse());
      expect(err).toMatchObject({
        details: {
          nextAllowedAt: new Date((created + 3 * MONTH_SECONDS) * 1000),
        },
      });
    });

    it('the final round: only when ready for sale with nothing outstanding, listing what is', async () => {
      const err = await build({
        ledger: { stage: 5, openTrades: 1n, openClaims: 2n },
      })
        .service.prepareRound(accounts, PROJECT, true)
        .catch((e: ConflictException) => e.getResponse());
      expect(err).toMatchObject({
        code: 'STILL_OUTSTANDING',
        details: { outstanding: ['TRADES', 'CLAIMS'] },
      });
      // An approved claim the insurer has not paid yet holds the final round too.
      const unpaid = await build({ ledger: { stage: 5, unpaidClaims: 1n } })
        .service.prepareRound(accounts, PROJECT, true)
        .catch((e: ConflictException) => e.getResponse());
      expect(unpaid).toMatchObject({ details: { outstanding: ['CLAIMS'] } });
      const { service, chain } = build({ ledger: { stage: 5 } });
      await service.prepareRound(accounts, PROJECT, true);
      expect(chain.sent[0]).toMatchObject({
        method: 'prepareRound',
        args: [uuidToBytes32(PROJECT), true],
      });
    });
  });

  describe('approving and rejecting', () => {
    it('needs a second accountant, and figures that match the ledger', async () => {
      const same = await build()
        .service.approveRound(accounts, 5)
        .catch((e: ForbiddenException) => e.getResponse());
      expect(same).toMatchObject({ code: 'SAME_ACCOUNTANT' });
      const unverified = await build({ round: { verified: false } })
        .service.approveRound(second, 5)
        .catch((e: ConflictException) => e.getResponse());
      expect(unverified).toMatchObject({ code: 'ROUND_NOT_VERIFIED' });
      const { service, chain } = build();
      await service.approveRound(second, 5);
      expect(chain.methods()).toEqual(['approveRound']);
    });

    it('saves the reason with its fingerprint, and clears it if the ledger refuses', async () => {
      const { service, round, chain } = build();
      await service.rejectRound(second, 5, 'Bill missing');
      expect(round).toMatchObject({
        rejectReason: 'Bill missing',
        rejectReasonHash: rejectFingerprint(5, 'Bill missing'),
      });
      expect(chain.sent[0].args).toEqual([
        5,
        rejectFingerprint(5, 'Bill missing'),
      ]);

      const refused = build();
      refused.chain.fail(revert('WrongRoundStatus'));
      await expect(
        refused.service.rejectRound(second, 5, 'x'),
      ).rejects.toThrow();
      expect(refused.round).toMatchObject({
        rejectReason: null,
        rejectReasonHash: null,
      });
    });
  });

  describe('recording a payment', () => {
    const approved = { round: { status: RoundStatus.APPROVED } };

    it('saves the reference encrypted, then sends its keyed hash for that payee', async () => {
      const { service, update, chain } = build(approved);
      await service.recordPayment(accounts, 5, {
        payeeId: PAYEE,
        paymentReference: 'npsb 77',
      } as never);
      const hash = hashPaymentRef('NPSB 77', SECRET);
      expect(update.calls.find(([m]) => m === 'set')![1]).toMatchObject({
        paymentRefEnc: `enc[payout_lines.payment_ref:5:${PAYEE}]NPSB 77`,
        paymentRefHash: hash,
      });
      expect(chain.sent[0]).toMatchObject({
        method: 'recordPayment',
        args: [5, uuidToBytes32(PAYEE), hash],
      });
    });

    it('refuses a payee not in the round, a line already paid, and an unverified amount', async () => {
      await expect(
        build({ ...approved, line: null }).service.recordPayment(accounts, 5, {
          payeeId: PAYEE,
          paymentReference: 'R',
        } as never),
      ).rejects.toThrow(NotFoundException);
      const paid = await build({ ...approved, line: { paidAt: NOW } })
        .service.recordPayment(accounts, 5, {
          payeeId: PAYEE,
          paymentReference: 'R',
        } as never)
        .catch((e: ConflictException) => e.getResponse());
      expect(paid).toMatchObject({ code: 'ALREADY_PAID' });
      const unverified = await build({ ...approved, line: { verified: false } })
        .service.recordPayment(accounts, 5, {
          payeeId: PAYEE,
          paymentReference: 'R',
        } as never)
        .catch((e: ConflictException) => e.getResponse());
      expect(unverified).toMatchObject({ code: 'LINE_NOT_VERIFIED' });
    });

    it('refuses before approval, and while a different payment is being recorded', async () => {
      await expect(
        build().service.recordPayment(accounts, 5, {
          payeeId: PAYEE,
          paymentReference: 'R',
        } as never),
      ).rejects.toThrow('This round is prepared');
      await expect(
        build({ ...approved, saveAffected: 0 }).service.recordPayment(
          accounts,
          5,
          {
            payeeId: PAYEE,
            paymentReference: 'R',
          } as never,
        ),
      ).rejects.toThrow('A different payment for this line is being recorded');
    });

    it('checks an uploaded sheet whole and names each problem row', async () => {
      const [P2, P3, NOBODY] = [randomUUID(), randomUUID(), randomUUID()];
      const lines = [
        {
          roundId: 5,
          payeeId: PAYEE,
          verified: true,
          amount: 1n,
          paidAt: null,
        },
        { roundId: 5, payeeId: P2, verified: true, amount: 1n, paidAt: NOW },
        {
          roundId: 5,
          payeeId: P3,
          verified: false,
          amount: null,
          paidAt: null,
        },
      ];
      const sheet = [
        'round_id,payee_id,amount_taka,payment_reference',
        `5,${PAYEE},0.01,npsb 1`,
        `5,${P2},0.01,already paid`,
        `5,${P3},,npsb 3`,
        `5,${NOBODY},1,npsb 4`,
        `5,${PAYEE},0.01,npsb 5`,
      ].join('\n');
      const { service, chain } = build({ ...approved, sheetLines: lines });
      const err = await service
        .uploadPayments(accounts, 5, Buffer.from(sheet))
        .catch((e: UnprocessableEntityException) => e.getResponse());
      expect(err).toMatchObject({
        code: 'PAYMENT_SHEET_INVALID',
        details: {
          problems: [
            { line: 4, problem: 'not_verified' },
            { line: 5, problem: 'unknown_payee' },
            { line: 6, problem: 'duplicate_payee' },
          ],
        },
      });
      expect(chain.sent).toEqual([]);
      const columns = await build({ ...approved, sheetLines: lines })
        .service.uploadPayments(accounts, 5, Buffer.from('payee_id\nx'))
        .catch((e: UnprocessableEntityException) => e.getResponse());
      expect(columns).toMatchObject({
        details: { problems: [{ line: 1, problem: 'missing_columns' }] },
      });
    });

    it('rejects an empty reference with a 422', async () => {
      await expect(
        build(approved).service.recordPayment(accounts, 5, {
          payeeId: PAYEE,
          paymentReference: ' ',
        } as never),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('the summary', () => {
    it('shows income, costs and net, and previews both kinds of round', async () => {
      const s = await build().service.summary(accounts, PROJECT);
      expect(s).toMatchObject({
        income: { total: '100000.00' },
        costs: { inputs: '20000.00', other: '10000.00', total: '30000.00' },
        net: '70000.00',
        staged: { allowed: true },
        final: { allowed: false, reason: 'ROUND_WRONG_STAGE' },
      });
      expect(s.staged.preview?.payees).toBeGreaterThan(0);
    });

    it('shows a loss as a negative net', async () => {
      const s = await build({ ledger: { sales: 1_000_000n } }).service.summary(
        accounts,
        PROJECT,
      );
      expect(s.net).toBe('-20000.00');
    });

    it('is visible to an investor only if they hold slots in the project', async () => {
      await expect(
        build().service.summary(actor(Role.INVESTOR), PROJECT),
      ).rejects.toThrow(NotFoundException);
      await expect(
        build({ holds: true }).service.summary(actor(Role.INVESTOR), PROJECT),
      ).resolves.toBeDefined();
      await expect(
        build().service.summary(actor(Role.FARMER, { id: FARMER }), PROJECT),
      ).resolves.toBeDefined();
    });
  });
});
