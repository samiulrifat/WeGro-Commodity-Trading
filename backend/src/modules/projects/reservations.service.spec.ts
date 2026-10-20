import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { hashPaymentRef } from '../../blockchain/utils/payment-ref';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import {
  actor,
  config,
  fakeCrypto,
  fakeQueryBuilder,
  fakeRepo,
  fakeTx,
  revert,
  Role,
  uniqueViolation,
} from '../../../test/support/unit';
import type { Project } from './entities/project.entity';
import type { Refund } from './entities/refund.entity';
import type { Reservation } from './entities/reservation.entity';
import { ProjectStage, ReservationStatus } from './project.enums';
import { ReservationsService } from './reservations.service';

const SECRET = 'payment-secret-for-tests-only-32b';
const PROJECT = '3f0c2a7e-8d4b-4e1a-9c6f-1b2d3e4f5a6b';
const INVESTOR = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

describe('ReservationsService', () => {
  const investor = actor(Role.INVESTOR, { id: INVESTOR });
  const accounts = actor(Role.ACCOUNTS);

  const build = (
    opts: {
      project?: Partial<Project>;
      reservation?: Partial<Reservation> | null;
      refund?: Partial<Refund> | null;
      holdings?: Array<{ investor_id: string; slots: string }>;
      saveAffected?: number;
      saveError?: Error;
    } = {},
  ) => {
    const project = {
      id: PROJECT,
      title: 'Maize',
      stage: ProjectStage.OPEN_FOR_FUNDING,
      totalSlots: 10,
      issuedSlots: 4,
      reservedSlots: 3,
      slotPrice: 1_000_000n,
      ...opts.project,
    } as Project;
    const reservation =
      opts.reservation === null
        ? null
        : ({
            id: 12,
            projectId: PROJECT,
            investorId: INVESTOR,
            slots: 2,
            status: ReservationStatus.PENDING,
            project,
            paymentRefEnc: null,
            ...opts.reservation,
          } as Reservation);
    const update = fakeQueryBuilder({
      execute: opts.saveError ?? { affected: opts.saveAffected ?? 1 },
    });
    const reservations = fakeRepo({
      findOneBy: jest.fn(() => Promise.resolve(reservation)),
      findOne: jest.fn(() => Promise.resolve(reservation)),
      createQueryBuilder: jest.fn(() => update.qb),
    });
    const refundRows: Refund[] = opts.refund ? [opts.refund as Refund] : [];
    const refunds = fakeRepo({
      findOneBy: jest.fn(() => Promise.resolve(refundRows[0] ?? null)),
      findBy: jest.fn(() => Promise.resolve(refundRows)),
      insert: jest.fn((r: Refund) => (refundRows.push(r), Promise.resolve({}))),
    });
    const dataSource = {
      query: jest.fn((sql: string) =>
        Promise.resolve(
          // No payment proofs in these tests.
          sql.includes('payment_proofs')
            ? []
            : (opts.holdings ?? [{ investor_id: INVESTOR, slots: '3' }]),
        ),
      ),
    };
    const chain = fakeTx((call) =>
      call.method === 'reserveSlots'
        ? [
            {
              contract: 'ProjectLedger',
              name: 'SlotsReserved',
              args: { reservationId: 12n },
              logIndex: 0,
            },
          ]
        : [],
    );
    const crypto = fakeCrypto();
    const service = new ReservationsService(
      config({ PAYMENT_REF_SECRET: SECRET }),
      dataSource as never,
      reservations as never,
      refunds as never,
      fakeRepo() as never,
      { visible: jest.fn(() => Promise.resolve(project)) } as never,
      { names: () => Promise.resolve(new Map()) } as never,
      crypto as never,
      chain.tx as never,
      { apply: jest.fn(() => Promise.resolve()) } as never,
      { apply: (qb: unknown) => qb } as never,
    );
    return {
      service,
      reservations,
      refunds,
      refundRows,
      update,
      chain,
      crypto,
    };
  };

  describe('reserving', () => {
    it('reserves on the ledger as the investor and returns the new reservation', async () => {
      const { service, chain } = build();
      const res = await service.reserve(investor, PROJECT, 3);
      expect(chain.sent[0]).toMatchObject({
        signer: investor.keyIndex,
        method: 'reserveSlots',
        args: [uuidToBytes32(PROJECT), 3],
      });
      expect(res).toMatchObject({ id: 12, amount: '20000.00' });
    });

    it('refuses more slots than are free, saying how many are', async () => {
      const { service, chain } = build();
      const err = await service
        .reserve(investor, PROJECT, 4)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({
        message: 'Only 3 slots are available',
        details: { available: 3 },
      });
      expect(chain.sent).toEqual([]);
    });

    it('refuses a project that is not open', async () => {
      const { service } = build({ project: { stage: ProjectStage.FUNDED } });
      await expect(service.reserve(investor, PROJECT, 1)).rejects.toThrow(
        'This project is not open for funding',
      );
    });
  });

  it('lets an investor cancel only their own pending reservation', async () => {
    await expect(
      build().service.cancel(actor(Role.INVESTOR), 12),
    ).rejects.toThrow(NotFoundException);
    await expect(
      build({
        reservation: { status: ReservationStatus.CONFIRMED },
      }).service.cancel(investor, 12),
    ).rejects.toThrow('This reservation is confirmed');
    const { service, chain } = build();
    await service.cancel(investor, 12);
    expect(chain.methods()).toEqual(['cancelReservation']);
  });

  describe('confirming payment', () => {
    it('saves the reference encrypted first, then sends only its keyed hash', async () => {
      const { service, update, chain } = build();
      const res = await service.confirm(accounts, 12, '  bkash  trx-77 ');
      const hash = hashPaymentRef('BKASH TRX-77', SECRET);
      const set = update.calls.find(([m]) => m === 'set')![1];
      expect(set).toEqual({
        paymentRefEnc: 'enc[reservations.payment_ref:12]BKASH TRX-77',
        paymentRefHash: hash,
        confirmedById: accounts.id,
      });
      // Only while still pending, and not over a different reference.
      expect(update.wheres()).toEqual([
        'id = :id AND status = :pending',
        '(payment_ref_hash IS NULL OR payment_ref_hash = :hash)',
      ]);
      expect(chain.sent[0]).toMatchObject({
        method: 'confirmPayment',
        args: [12, hash],
      });
      expect(JSON.stringify(chain.sent)).not.toContain('TRX-77');
      expect(res).toBeDefined();
    });

    it('refuses while another confirmation is in flight', async () => {
      const { service, chain } = build({ saveAffected: 0 });
      await expect(service.confirm(accounts, 12, 'REF-1')).rejects.toThrow(
        'This reservation is already being confirmed',
      );
      expect(chain.sent).toEqual([]);
    });

    it('refuses a reference already used for another payment', async () => {
      const { service } = build({ saveError: uniqueViolation() });
      const err = await service
        .confirm(accounts, 12, 'REF-1')
        .catch((e: unknown) => e);
      expect((err as ConflictException).getResponse()).toMatchObject({
        code: 'PAYMENT_REF_ALREADY_USED',
      });
    });

    it('removes the saved reference when the ledger refuses it', async () => {
      const { service, reservations, chain } = build();
      chain.fail(revert('PaymentRefAlreadyUsed'));
      await expect(service.confirm(accounts, 12, 'REF-1')).rejects.toThrow();
      expect(reservations.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 12, status: ReservationStatus.PENDING }),
        { paymentRefEnc: null, paymentRefHash: null, confirmedById: null },
      );
    });

    it('keeps it when the node fails: the payment may still be on the ledger', async () => {
      const { service, reservations, chain } = build();
      chain.fail(new Error('timeout'));
      await expect(service.confirm(accounts, 12, 'REF-1')).rejects.toThrow();
      expect(reservations.update).not.toHaveBeenCalled();
    });

    it('refuses an empty reference with a 422', async () => {
      await expect(
        build().service.confirm(accounts, 12, '   '),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('refunds', () => {
    const cancelled = { project: { stage: ProjectStage.CANCELLED } };

    it('records what the investor paid, then sends the hash', async () => {
      const { service, refundRows, chain } = build(cancelled);
      const lines = await service.recordRefund(
        accounts,
        PROJECT,
        INVESTOR,
        'REF-9',
      );
      expect(refundRows[0]).toMatchObject({
        amount: 3_000_000n,
        confirmed: false,
        paymentRefEnc: `enc[refunds.payment_ref:${PROJECT}:${INVESTOR}]REF-9`,
      });
      expect(chain.sent[0].method).toBe('recordRefund');
      // Accounts reads the reference back; status is submitted until the ledger confirms.
      expect(lines[0]).toMatchObject({
        status: 'submitted',
        paymentReference: 'REF-9',
      });
    });

    it('only for cancelled projects, and only for holders', async () => {
      await expect(
        build().service.recordRefund(accounts, PROJECT, INVESTOR, 'R'),
      ).rejects.toThrow('Refunds are recorded only for cancelled projects');
      await expect(
        build({ ...cancelled, holdings: [] }).service.recordRefund(
          accounts,
          PROJECT,
          INVESTOR,
          'R',
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('retries the same refund, but refuses a second, different one', async () => {
      const hash = hashPaymentRef('REF-9', SECRET);
      const pending = {
        investorId: INVESTOR,
        confirmed: false,
        paymentRefHash: hash,
      };
      const retry = build({ ...cancelled, refund: pending });
      await retry.service.recordRefund(accounts, PROJECT, INVESTOR, 'ref-9');
      expect(retry.refunds.insert).not.toHaveBeenCalled();
      expect(retry.chain.sent).toHaveLength(1);
      await expect(
        build({ ...cancelled, refund: pending }).service.recordRefund(
          accounts,
          PROJECT,
          INVESTOR,
          'OTHER',
        ),
      ).rejects.toThrow(
        'A different refund for this investor is being recorded',
      );
      await expect(
        build({
          ...cancelled,
          refund: { ...pending, confirmed: true },
        }).service.recordRefund(accounts, PROJECT, INVESTOR, 'REF-9'),
      ).rejects.toThrow('Already refunded');
    });

    it('deletes the unconfirmed refund when the ledger refuses it', async () => {
      const { service, refunds, chain } = build(cancelled);
      chain.fail(revert('NotAHolder'));
      await expect(
        service.recordRefund(accounts, PROJECT, INVESTOR, 'REF-9'),
      ).rejects.toThrow();
      expect(refunds.delete).toHaveBeenCalledWith({
        projectId: PROJECT,
        investorId: INVESTOR,
        confirmed: false,
      });
    });

    it('hides payment references from roles that do not handle payments', async () => {
      const { service } = build({
        ...cancelled,
        refund: {
          investorId: INVESTOR,
          confirmed: true,
          paymentRefEnc: `enc[refunds.payment_ref:${PROJECT}:${INVESTOR}]REF-9`,
        },
      });
      const [line] = await service.refundLines(investor, PROJECT);
      expect(line).toMatchObject({
        status: 'refunded',
        paymentReference: null,
      });
    });
  });
});
