import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import {
  codeToBytes32,
  uuidToBytes32,
  ZERO_BYTES32,
} from '../../../blockchain/utils/ids';
import { matchesWhere } from '../../../../test/support/unit';
import { Photo } from '../../field-records/entities/photo.entity';
import { photoHash } from '../../field-records/photos.service';
import { Reservation } from '../../projects/entities/reservation.entity';
import { PayoutLine } from '../../settlement/entities/payout-line.entity';
import { ProjectCost } from '../../settlement/entities/project-cost.entity';
import { SettlementRound } from '../../settlement/entities/settlement-round.entity';
import { costFingerprint, lineHash } from '../../settlement/settlement-math';
import { BankConsent } from '../../track-record/entities/bank-consent.entity';
import { consentFingerprint } from '../../track-record/track-record-fingerprints';
import { ConsentStatus } from '../../track-record/track-record.enums';
import { batchFingerprint } from '../../vouchers/batches.service';
import { InputBatch } from '../../vouchers/entities/input-batch.entity';
import { WarehouseReceipt } from '../../warehouse/entities/warehouse-receipt.entity';
import { intakeFingerprint } from '../../warehouse/warehouse.service';
import { VerifyService } from './verify.service';

const PROJECT = randomUUID();
const INVESTOR = randomUUID();
const FARMER = randomUUID();
const BANK = randomUUID();

/** Rows by entity, and per-contract fakes. */
function build(
  rows: Map<unknown, object[]>,
  contracts: Record<string, Record<string, unknown>>,
) {
  const dataSource = {
    getRepository: (entity: unknown) => ({
      findOneBy: (where: Record<string, unknown>) =>
        Promise.resolve(
          (rows.get(entity) ?? []).find((r) =>
            matchesWhere(r as never, where),
          ) ?? null,
        ),
      findBy: (where: Record<string, unknown>) =>
        Promise.resolve(
          (rows.get(entity) ?? []).filter((r) =>
            matchesWhere(r as never, where),
          ),
        ),
      find: () => Promise.resolve([]),
    }),
  };
  const delegated = {
    integrity: jest.fn(() => Promise.resolve({ mismatches: ['notOnLedger'] })),
    verify: jest.fn(() => Promise.resolve({ mismatches: [] })),
  };
  const service = new VerifyService(
    dataSource as never,
    { get: (name: string) => contracts[name] } as never,
    {
      hashOnDisk: (p: Photo) =>
        Promise.resolve(p.sha256 === 'gone' ? null : p.sha256),
    } as never,
    delegated as never,
    {
      integrity: jest.fn(() =>
        Promise.resolve({ mismatches: ['notPublished'] }),
      ),
    } as never,
    delegated as never,
  );
  return { service };
}

describe('VerifyService', () => {
  it('passes participants, projects and field records to their own checks', async () => {
    const { service } = build(new Map(), {});
    await expect(service.verify('participant', INVESTOR)).resolves.toEqual({
      onLedger: false,
      mismatches: ['notOnLedger'],
    });
    await expect(service.verify('project', PROJECT)).resolves.toMatchObject({
      onLedger: false,
    });
    await expect(service.verify('field-record', PROJECT)).resolves.toEqual({
      onLedger: true,
      mismatches: [],
    });
  });

  it('answers 404 for an id that cannot be the record, or a record that does not exist', async () => {
    const { service } = build(new Map(), {
      ProjectLedger: { getReservation: jest.fn() },
    });
    await expect(service.verify('voucher', 'nope')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.verify('reservation', '1e5')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.verify('receipt', '0x12')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.verify('reservation', '7')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('reservations', () => {
    const reservation = (over: object = {}) => ({
      id: 7,
      projectId: PROJECT,
      investorId: INVESTOR,
      slots: 3,
      status: 'confirmed',
      paymentRefHash: '0x' + 'AB'.repeat(32) + '  ', // char(66): padded, any case
      ...over,
    });
    const ledger = (over: object = {}) => ({
      ProjectLedger: {
        getReservation: () =>
          Promise.resolve({
            status: 2n,
            projectId: uuidToBytes32(PROJECT),
            investorId: uuidToBytes32(INVESTOR),
            slots: 3n,
            paymentRefHash: '0x' + 'ab'.repeat(32),
            ...over,
          }),
      },
    });

    it('agree when every field matches, however the database pads or cases it', async () => {
      const { service } = build(
        new Map([[Reservation, [reservation()]]]),
        ledger(),
      );
      await expect(service.verify('reservation', '7')).resolves.toEqual({
        onLedger: true,
        mismatches: [],
      });
    });

    it('names each field that differs, and checks the payment only once confirmed', async () => {
      const { service } = build(
        new Map([[Reservation, [reservation({ slots: 4 })]]]),
        ledger({ paymentRefHash: ZERO_BYTES32 }),
      );
      await expect(service.verify('reservation', '7')).resolves.toMatchObject({
        mismatches: ['slots', 'paymentRef'],
      });
      const pending = build(
        new Map([
          [
            Reservation,
            [reservation({ status: 'pending', paymentRefHash: null })],
          ],
        ]),
        ledger({ status: 1n, paymentRefHash: ZERO_BYTES32 }),
      );
      await expect(
        pending.service.verify('reservation', '7'),
      ).resolves.toMatchObject({ mismatches: [] });
    });

    it('is not on the ledger when the ledger has no such reservation', async () => {
      const { service } = build(
        new Map([[Reservation, [reservation()]]]),
        ledger({ status: 0n }),
      );
      await expect(service.verify('reservation', '7')).resolves.toEqual({
        onLedger: false,
        mismatches: ['notOnLedger'],
      });
    });
  });

  it('tells an edited record from an edited stored fingerprint', async () => {
    const batch = {
      id: randomUUID(),
      supplierId: INVESTOR,
      inputTypeCode: 'UREA',
      lotNumber: 'L1',
      quantity: 1,
      manufacturer: null,
      producedOn: '2026-10-01',
      expiresOn: null,
      notes: null,
      detailsHash: '',
    };
    const genuine = batchFingerprint(batch);
    const contracts = (detailsHash: string) => ({
      VoucherRegistry: {
        getBatch: () =>
          Promise.resolve({
            registeredAt: 1n,
            detailsHash,
            supplierId: uuidToBytes32(INVESTOR),
            productCode: codeToBytes32('UREA'),
          }),
      },
    });
    const storedEdited = build(
      new Map([[InputBatch, [{ ...batch, detailsHash: '0x1' }]]]),
      contracts(genuine),
    );
    await expect(
      storedEdited.service.verify('batch', batch.id),
    ).resolves.toMatchObject({ mismatches: ['fingerprintStored'] });
    const dataEdited = build(
      new Map([
        [InputBatch, [{ ...batch, lotNumber: 'L2', detailsHash: genuine }]],
      ]),
      contracts(genuine),
    );
    await expect(
      dataEdited.service.verify('batch', batch.id),
    ).resolves.toMatchObject({ mismatches: ['fingerprint'] });
  });

  it('checks a receipt split off for a buyer against its original intake', async () => {
    const parentId = '0x' + 'cd'.repeat(32);
    const childId = '0x' + 'ef'.repeat(32);
    const base = {
      projectId: PROJECT,
      siteId: PROJECT,
      produceCode: 'MAIZE',
      intakeDate: '2026-10-01',
      expiresOn: '2027-01-31',
      bagCount: 10,
      moisturePercent: '13.5',
      storageBay: null,
      notes: null,
      ownerIsWegro: false,
    };
    const parent = {
      ...base,
      id: parentId,
      parentId: null,
      quantity: 400,
      originalQuantity: 500,
      ownerId: FARMER,
      status: 'issued',
      detailsHash: '',
    };
    parent.detailsHash = intakeFingerprint(parent as never);
    const child = {
      ...base,
      id: childId,
      parentId,
      quantity: 100,
      ownerId: INVESTOR,
      status: 'issued',
      detailsHash: parent.detailsHash,
    };
    const { service } = build(new Map([[WarehouseReceipt, [parent, child]]]), {
      WarehouseReceipt: {
        getReceipt: () =>
          Promise.resolve({
            status: 1n,
            detailsHash: parent.detailsHash,
            quantity: 100n,
            owner: uuidToBytes32(INVESTOR),
            projectId: uuidToBytes32(PROJECT),
            siteId: uuidToBytes32(PROJECT),
            parentId,
          }),
      },
    });
    await expect(service.verify('receipt', childId)).resolves.toEqual({
      onLedger: true,
      mismatches: [],
    });
  });

  it('checks every payout line of a round: its hash, its amount and whether it is paid', async () => {
    const round = {
      id: 5,
      status: 'approved',
      fingerprint: '0xf',
      verified: true,
      income: 1n,
      costs: 1n,
      profit: 1n,
      farmerShare: 1n,
      investorShare: 1n,
      wegroShare: 1n,
      capitalReturn: 1n,
      leftover: 0n,
      payeeCount: 2,
      paidCount: 1,
    };
    const good = lineHash(5, uuidToBytes32(INVESTOR), 1000n);
    const lines = [
      {
        roundId: 5,
        payeeId: INVESTOR,
        amount: 1000n,
        lineHash: good,
        paidAt: new Date(),
      },
      {
        roundId: 5,
        payeeId: FARMER,
        amount: 999n,
        lineHash: '0xstale',
        paidAt: null,
      },
    ];
    const ledgerHashes: Record<string, string> = {
      [uuidToBytes32(INVESTOR)]: good,
      [uuidToBytes32(FARMER)]: lineHash(5, uuidToBytes32(FARMER), 2000n),
    };
    const { service } = build(
      new Map<unknown, object[]>([
        [SettlementRound, [round]],
        [PayoutLine, lines],
      ]),
      {
        SettlementLedger: {
          getRound: () =>
            Promise.resolve({
              ...round,
              status: 2n,
              payeeCount: 2n,
              paidCount: 1n,
            }),
          payoutLineHash: (_id: number, payee: string) =>
            Promise.resolve(ledgerHashes[payee]),
          // Both paid on the ledger; the database has the farmer unpaid.
          linePaid: () => Promise.resolve(true),
        },
      },
    );
    const res = await service.verify('round', '5');
    expect(res.mismatches).toEqual([
      `line:${FARMER}:hash`,
      `line:${FARMER}:amount`,
      `line:${FARMER}:paid`,
    ]);
  });

  it('flags a cost whose bill photo is gone from disk', async () => {
    const cost = {
      id: randomUUID(),
      costId: 3,
      projectId: PROJECT,
      category: 'labour',
      amount: 500n,
      incurredOn: '2026-10-01',
      note: 'n',
      photoId: 'p',
      status: 'recorded',
      detailsHash: '',
    };
    cost.detailsHash = costFingerprint({
      ...cost,
      category: cost.category as never,
      photoHash: photoHash('aa'),
    });
    const ledger = {
      getCost: () =>
        Promise.resolve({
          projectId: uuidToBytes32(PROJECT),
          detailsHash: cost.detailsHash,
          amount: 500n,
          voided: false,
        }),
    };
    const gone = build(
      new Map<unknown, object[]>([
        [ProjectCost, [cost]],
        [Photo, [{ id: 'p', sha256: 'gone' }]],
      ]),
      { SettlementLedger: ledger },
    );
    await expect(gone.service.verify('cost', cost.id)).resolves.toMatchObject({
      mismatches: ['photoMissing', 'fingerprint'],
    });
    const here = build(
      new Map<unknown, object[]>([
        [ProjectCost, [cost]],
        [Photo, [{ id: 'p', sha256: 'aa' }]],
      ]),
      { SettlementLedger: ledger },
    );
    await expect(here.service.verify('cost', cost.id)).resolves.toMatchObject({
      mismatches: [],
    });
    const unsent = build(
      new Map([[ProjectCost, [{ ...cost, costId: null }]]]),
      {},
    );
    await expect(unsent.service.verify('cost', cost.id)).resolves.toMatchObject(
      { onLedger: false },
    );
  });

  it('checks an earlier bank permission against its own grant on the ledger', async () => {
    const consent = {
      id: randomUUID(),
      farmerId: FARMER,
      bankId: BANK,
      expiresAt: new Date('2027-01-31T17:59:59Z'),
      evidencePhotoId: 'p',
      status: ConsentStatus.Replaced,
      evidenceHash: '',
    };
    consent.evidenceHash = consentFingerprint({
      consentId: consent.id,
      farmerId: FARMER,
      bankId: BANK,
      expiresAt: consent.expiresAt.getTime() / 1000,
      photoHash: photoHash('aa'),
    });
    const registry = {
      getConsent: () =>
        Promise.resolve({
          grantedAt: 1n,
          evidenceHash: '0xlater',
          expiresAt: 0n,
          revoked: false,
        }),
      filters: { ConsentGranted: () => 'filter' },
      queryFilter: () =>
        Promise.resolve([
          { args: { evidenceHash: '0xother', expiresAt: 1n } },
          {
            args: {
              evidenceHash: consent.evidenceHash,
              expiresAt: BigInt(consent.expiresAt.getTime() / 1000),
            },
          },
        ]),
    };
    const { service } = build(
      new Map<unknown, object[]>([
        [BankConsent, [consent]],
        [Photo, [{ id: 'p', sha256: 'aa' }]],
      ]),
      {
        ConsentRegistry: registry,
      },
    );
    await expect(service.verify('consent', consent.id)).resolves.toEqual({
      onLedger: true,
      mismatches: [],
    });
  });
});
