import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { codeToBytes32, uuidToBytes32 } from '../../blockchain/utils/ids';
import {
  actor,
  config,
  fakeCatalog,
  fakeClock,
  fakeRepo,
  fakeTx,
  revert,
  Role,
  uniqueViolation,
} from '../../../test/support/unit';
import { expiresAtSeconds, producedAtSeconds } from './batch-dates';
import { batchFingerprint, BatchesService } from './batches.service';
import type { InputBatch } from './entities/input-batch.entity';

const NOW = new Date('2026-10-14T06:00:00Z');

describe('BatchesService', () => {
  const supplier = actor(Role.SUPPLIER);
  const dto = {
    inputTypeCode: 'UREA',
    lotNumber: 'LOT-1',
    quantity: 100,
    manufacturer: 'ACME',
    producedOn: '2026-10-01',
    expiresOn: '2027-10-01',
  };

  const build = (
    opts: {
      stored?: InputBatch | null;
      onChain?: Record<string, unknown>;
      insert?: jest.Mock;
    } = {},
  ) => {
    const rows: InputBatch[] = [];
    const batches = fakeRepo({
      insert:
        opts.insert ??
        jest.fn((b: InputBatch) => (rows.push(b), Promise.resolve({}))),
      findOneBy: jest.fn(({ id }: { id: string }) =>
        Promise.resolve(
          opts.stored !== undefined
            ? opts.stored
            : (rows.find((b) => b.id === id) ?? null),
        ),
      ),
    });
    const chain = fakeTx();
    const contracts = {
      get: () => ({
        getBatch: jest.fn(() =>
          Promise.resolve({ registeredAt: 0n, ...opts.onChain }),
        ),
      }),
    };
    const service = new BatchesService(
      config({ PUBLIC_APP_URL: 'https://app.example/' }),
      batches as never,
      fakeCatalog() as never,
      {
        names: () => Promise.resolve(new Map([[supplier.id, 'Supplier']])),
      } as never,
      chain.tx as never,
      { apply: jest.fn(() => Promise.resolve()) } as never,
      contracts as never,
      fakeClock(NOW) as never,
    );
    return { service, batches, rows, chain };
  };

  it('stores the batch, then registers its fingerprint with production and expiry times', async () => {
    const { service, rows, chain } = build();
    const res = await service.register(supplier, dto as never);
    const batch = rows[0];
    expect(batch).toMatchObject({
      supplierId: supplier.id,
      status: 'submitted',
    });
    expect(batch.detailsHash).toBe(batchFingerprint(batch));
    expect(chain.sent[0]).toMatchObject({
      contract: 'VoucherRegistry',
      method: 'registerBatch',
      args: [
        uuidToBytes32(batch.id),
        codeToBytes32('UREA'),
        producedAtSeconds('2026-10-01'),
        expiresAtSeconds('2027-10-01'),
        batch.detailsHash,
      ],
    });
    expect(res.verifyUrl).toBe(`https://app.example/verify/batch/${batch.id}`);
  });

  it('refuses dates that cannot be right', async () => {
    const { service } = build();
    await expect(
      service.register(supplier, { ...dto, producedOn: '2026-10-15' } as never),
    ).rejects.toThrow('producedOn cannot be in the future');
    await expect(
      service.register(supplier, {
        ...dto,
        expiresOn: '2026-09-30',
      } as never),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('refuses a lot number the supplier already registered', async () => {
    const { service, chain } = build({
      insert: jest.fn(() => Promise.reject(uniqueViolation())),
    });
    await expect(service.register(supplier, dto as never)).rejects.toThrow(
      ConflictException,
    );
    expect(chain.sent).toEqual([]);
  });

  it('removes the batch when the ledger refuses it', async () => {
    const { service, batches, chain } = build();
    chain.fail(revert('BatchExists'));
    await expect(service.register(supplier, dto as never)).rejects.toThrow();
    expect(batches.delete).toHaveBeenCalledTimes(1);
  });

  it('keeps one supplier out of another’s batches', async () => {
    const { service } = build({
      stored: { id: 'x', supplierId: 'someone-else' } as InputBatch,
    });
    await expect(service.findOne(supplier, 'x')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('the public QR check', () => {
    const batch = {
      id: '0b8a3f1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
      supplierId: supplier.id,
      inputTypeCode: 'UREA',
      lotNumber: 'LOT-1',
      quantity: 100,
      manufacturer: 'ACME',
      producedOn: '2026-10-01',
      expiresOn: '2026-10-10',
      notes: null,
    } as InputBatch;
    const ledger = (over: Record<string, unknown> = {}) => ({
      registeredAt: 1_790_000_000n,
      supplierId: uuidToBytes32(supplier.id),
      productCode: codeToBytes32('UREA'),
      detailsHash: batchFingerprint(batch),
      ...over,
    });

    it('calls a batch genuine only when the ledger and the record agree', async () => {
      const res = await build({
        stored: batch,
        onChain: ledger(),
      }).service.verify(batch.id);
      expect(res).toMatchObject({
        genuine: true,
        lotNumber: 'LOT-1',
        supplierName: 'Supplier',
        expired: true, // expired on 10 October
      });
    });

    it.each([
      ['a malformed id', 'not-a-uuid', ledger()],
      ['a batch the ledger never saw', batch.id, { registeredAt: 0n }],
      [
        'an edited record',
        batch.id,
        ledger({ detailsHash: '0x' + '1'.repeat(64) }),
      ],
      [
        'another supplier’s registration',
        batch.id,
        ledger({ supplierId: uuidToBytes32(actor(Role.SUPPLIER).id) }),
      ],
    ])(
      'says not genuine for %s, revealing nothing',
      async (_l, id, onChain) => {
        const res = await build({ stored: batch, onChain }).service.verify(id);
        expect(res).toEqual(
          expect.objectContaining({
            genuine: false,
            lotNumber: null,
            product: null,
          }),
        );
      },
    );
  });
});
