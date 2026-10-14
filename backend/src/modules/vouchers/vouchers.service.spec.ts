import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { codeToBytes32, uuidToBytes32 } from '../../blockchain/utils/ids';
import {
  actor,
  ChainState,
  fakeCatalog,
  fakeClock,
  fakeQueryBuilder,
  fakeRepo,
  fakeTx,
  ParticipantStatus,
  revert,
  Role,
} from '../../../test/support/unit';
import type { Project } from '../projects/entities/project.entity';
import { ProjectStage } from '../projects/project.enums';
import { Voucher } from './entities/voucher.entity';
import type { VoucherSale } from './entities/voucher-sale.entity';
import { VoucherSupplier } from './entities/voucher-supplier.entity';
import { BatchStatus, SaleStatus, VoucherStatus } from './voucher.enums';
import { VouchersService } from './vouchers.service';

const NOW = new Date('2026-10-14T06:00:00Z');
const PROJECT = randomUUID();
const FARMER = randomUUID();
const VOUCHER = randomUUID();

describe('VouchersService', () => {
  const operations = actor(Role.Operations);
  const supplier = actor(Role.Supplier);
  const officer = actor(Role.FieldOfficer);

  const build = (
    opts: {
      project?: Partial<Project>;
      voucher?: Partial<Voucher>;
      sale?: Partial<VoucherSale>;
      committed?: bigint;
      suppliers?: object[];
      batches?: object[];
      officerOf?: boolean;
      onLedger?: bigint;
    } = {},
  ) => {
    const project = {
      id: PROJECT,
      farmerId: FARMER,
      stage: ProjectStage.Active,
      fundingTarget: 5_000_000n,
      title: 'Maize',
      ...opts.project,
    } as Project;
    const voucher = {
      id: VOUCHER,
      projectId: PROJECT,
      farmerId: FARMER,
      inputTypeCode: 'UREA',
      quantity: 100,
      spentQuantity: 30,
      heldQuantity: 20,
      unitPrice: 5000n,
      value: 500_000n,
      status: VoucherStatus.Active,
      voidedAmount: null,
      ...opts.voucher,
    } as Voucher;
    const sale = {
      id: 4,
      voucherId: VOUCHER,
      supplierId: supplier.id,
      quantity: 10,
      amount: 50_000n,
      status: SaleStatus.Pending,
      ...opts.sale,
    } as VoucherSale;
    const inserted: Array<[unknown, unknown]> = [];
    const deleted: unknown[] = [];
    const manager = fakeRepo({
      insert: jest.fn(
        (e: unknown, row: unknown) => (
          inserted.push([e, row]),
          Promise.resolve({})
        ),
      ),
      delete: jest.fn((e: unknown) => (deleted.push(e), Promise.resolve({}))),
    });
    const repos = new Map<unknown, object>([[VoucherSupplier, fakeRepo()]]);
    const dataSource = {
      transaction: jest.fn((work: (m: unknown) => unknown) => work(manager)),
      getRepository: jest.fn(
        (entity: unknown) =>
          repos.get(entity) ??
          fakeRepo({
            findBy: jest.fn(() => Promise.resolve(opts.batches ?? [])),
            createQueryBuilder: jest.fn(() => fakeQueryBuilder().qb),
          }),
      ),
    };
    const chain = fakeTx((call) =>
      call.method === 'recordSale'
        ? [
            {
              contract: 'VoucherRegistry',
              name: 'SaleRecorded',
              args: { saleId: 4n },
              logIndex: 0,
            },
          ]
        : [],
    );
    const registry = {
      committedValue: jest.fn(() => Promise.resolve(opts.committed ?? 0n)),
      getVoucher: jest.fn(() =>
        Promise.resolve({ status: opts.onLedger ?? 0n }),
      ),
    };
    const vouchers = fakeRepo({
      findOneBy: jest.fn(() => Promise.resolve(voucher)),
      findOneByOrFail: jest.fn(() => Promise.resolve(voucher)),
      createQueryBuilder: jest.fn(
        () => fakeQueryBuilder({ getOne: voucher }).qb,
      ),
    });
    const service = new VouchersService(
      dataSource as never,
      vouchers as never,
      fakeRepo({
        findOneBy: jest.fn(() => Promise.resolve(sale)),
        findOneByOrFail: jest.fn(() => Promise.resolve(sale)),
        find: jest.fn(() => Promise.resolve([])),
      }) as never,
      fakeRepo({
        findOneBy: jest.fn(() => Promise.resolve(project)),
        findOneByOrFail: jest.fn(() => Promise.resolve(project)),
        find: jest.fn(() => Promise.resolve([project])),
      }) as never,
      fakeRepo({
        find: jest.fn(() =>
          Promise.resolve(
            opts.suppliers ?? [
              {
                id: supplier.id,
                role: Role.Supplier,
                status: ParticipantStatus.Verified,
                chainState: ChainState.Confirmed,
              },
            ],
          ),
        ),
        exists: jest.fn(() => Promise.resolve(opts.officerOf ?? false)),
      }) as never,
      fakeCatalog() as never,
      { names: () => Promise.resolve(new Map()) } as never,
      { inputRef: (code: string) => ({ code }) } as never,
      chain.tx as never,
      { apply: jest.fn(() => Promise.resolve()) } as never,
      { get: () => registry } as never,
      fakeClock(NOW) as never,
    );
    return { service, chain, inserted, deleted, vouchers };
  };

  describe('proposing', () => {
    const dto = {
      inputTypeCode: 'UREA',
      quantity: 100,
      unitPrice: '50',
      supplierIds: [supplier.id],
    };

    it('stores the proposal with its suppliers in order, then proposes it on the ledger', async () => {
      const { service, inserted, chain } = build();
      await service.propose(operations, PROJECT, dto as never);
      const [[, voucher], [, links]] = inserted as [
        [unknown, Voucher],
        [unknown, unknown[]],
      ];
      expect(voucher).toMatchObject({
        farmerId: FARMER,
        unitPrice: 5000n,
        value: 500_000n,
        status: VoucherStatus.Submitted,
      });
      expect(links).toEqual([
        { voucherId: voucher.id, supplierId: supplier.id, position: 0 },
      ]);
      expect(chain.sent[0]).toMatchObject({
        method: 'proposeVoucher',
        args: [
          uuidToBytes32(voucher.id),
          uuidToBytes32(PROJECT),
          codeToBytes32('UREA'),
          100,
          5000n,
          [uuidToBytes32(supplier.id)],
        ],
      });
    });

    it('keeps vouchers within the funding left for inputs', async () => {
      const err = await build({ committed: 4_600_000n })
        .service.propose(operations, PROJECT, dto as never)
        .catch((e: UnprocessableEntityException) => e.getResponse());
      expect(err).toMatchObject({
        code: 'EXCEEDS_FUNDING_TARGET',
        details: { value: '5000.00', room: '4000.00' },
      });
    });

    it('needs a funded or active project and verified suppliers', async () => {
      await expect(
        build({
          project: { stage: ProjectStage.OpenForFunding },
        }).service.propose(operations, PROJECT, dto as never),
      ).rejects.toThrow(ConflictException);
      const err = await build({ suppliers: [] })
        .service.propose(operations, PROJECT, dto as never)
        .catch((e: UnprocessableEntityException) => e.getResponse());
      expect(err).toMatchObject({
        code: 'SUPPLIER_NOT_VERIFIED',
        details: { supplierIds: [supplier.id] },
      });
    });

    it('removes the proposal and its suppliers when the ledger refuses it', async () => {
      const { service, chain, deleted } = build();
      chain.fail(revert('NotEnoughFunding'));
      await expect(
        service.propose(operations, PROJECT, dto as never),
      ).rejects.toThrow();
      expect(deleted).toEqual([VoucherSupplier, Voucher]);
    });
  });

  it('discards an unconfirmed proposal only when the ledger never got it', async () => {
    await expect(
      build({ voucher: { status: VoucherStatus.Active } }).service.discard(
        VOUCHER,
      ),
    ).rejects.toThrow('Only unconfirmed proposals can be discarded');
    await expect(
      build({
        voucher: { status: VoucherStatus.Submitted },
        onLedger: 1n,
      }).service.discard(VOUCHER),
    ).rejects.toThrow('The ledger has this voucher; it will appear shortly');
    const { service, deleted } = build({
      voucher: { status: VoucherStatus.Submitted },
    });
    await service.discard(VOUCHER);
    expect(deleted).toEqual([VoucherSupplier, Voucher]);
  });

  describe('sales', () => {
    it('records a sale within what is left on the voucher', async () => {
      const err = await build()
        .service.recordSale(supplier, VOUCHER, { quantity: 51 } as never)
        .catch((e: ConflictException) => e.getResponse());
      expect(err).toMatchObject({
        code: 'EXCEEDS_VOUCHER_QUANTITY',
        details: { available: 50 },
      });
      const { service, chain } = build();
      await service.recordSale(supplier, VOUCHER, { quantity: 50 } as never);
      expect(chain.sent[0]).toMatchObject({
        method: 'recordSale',
        args: [uuidToBytes32(VOUCHER), 50, []],
      });
    });

    it('checks each batch: the supplier’s own, registered, the same input, not expired', async () => {
      const mine = (over: object) => ({
        id: randomUUID(),
        supplierId: supplier.id,
        status: BatchStatus.Registered,
        inputTypeCode: 'UREA',
        expiresOn: null,
        ...over,
      });
      const batches = [
        mine({ supplierId: 'someone-else' }),
        mine({ status: BatchStatus.Submitted }),
        mine({ inputTypeCode: 'SEED_MAIZE' }),
        mine({ expiresOn: '2026-10-13' }),
        mine({}),
      ];
      const err = await build({ batches })
        .service.recordSale(supplier, VOUCHER, {
          quantity: 1,
          batchIds: batches.map((b) => b.id),
        } as never)
        .catch((e: UnprocessableEntityException) => e.getResponse());
      expect(err).toMatchObject({ code: 'INVALID_BATCHES' });
      expect(
        (err as { details: { problems: string[] } }).details.problems,
      ).toEqual([
        `${batches[0].id}: not one of your batches`,
        `${batches[1].id}: not registered yet`,
        `${batches[2].id}: a batch of SEED_MAIZE, not UREA`,
        `${batches[3].id}: expired`,
      ]);
    });

    it('needs an active voucher on an active project', async () => {
      await expect(
        build({
          voucher: { status: VoucherStatus.Cancelled },
        }).service.recordSale(supplier, VOUCHER, {
          quantity: 1,
        } as never),
      ).rejects.toThrow('This voucher is not active');
      await expect(
        build({ project: { stage: ProjectStage.Funded } }).service.recordSale(
          supplier,
          VOUCHER,
          {
            quantity: 1,
          } as never,
        ),
      ).rejects.toThrow('Sales are recorded only while the project is active');
    });

    it('lets only the farmer’s own officer confirm a sale', async () => {
      await expect(build().service.confirmSale(officer, 4)).rejects.toThrow(
        ForbiddenException,
      );
      const { service, chain } = build({ officerOf: true });
      await service.confirmSale(officer, 4);
      expect(chain.methods()).toEqual(['confirmSale']);
    });

    it('lets the supplier who recorded it, the farmer, their officer or an admin cancel a sale', async () => {
      await expect(
        build().service.cancelSale(supplier, 4),
      ).resolves.toBeDefined();
      await expect(
        build().service.cancelSale(actor(Role.Farmer, { id: FARMER }), 4),
      ).resolves.toBeDefined();
      await expect(
        build().service.cancelSale(actor(Role.Supplier), 4),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        build().service.cancelSale(actor(Role.Farmer), 4),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        build({ sale: { status: SaleStatus.Confirmed } }).service.cancelSale(
          supplier,
          4,
        ),
      ).rejects.toThrow('This sale is confirmed');
    });
  });

  it('flags an active voucher idle past its limit, by the ledger’s clock', async () => {
    const idle = await build({
      voucher: {
        inactivityLimitDays: 7,
        lastActivityAt: new Date(NOW.getTime() - 8 * 86_400_000),
      },
    }).service.findOne(operations, VOUCHER);
    expect(idle.inactiveSince).toEqual(new Date(NOW.getTime() - 86_400_000));
    expect(idle).toMatchObject({
      availableQuantity: 50,
      availableBalance: '2500.00',
    });
  });

  it('sets an inactivity limit only on proposed or active vouchers', async () => {
    const { service, vouchers } = build({
      voucher: { status: VoucherStatus.Cancelled },
    });
    vouchers.update.mockResolvedValueOnce({ affected: 0 });
    await expect(
      service.setInactivityLimit(operations, VOUCHER, 7),
    ).rejects.toThrow('Limits apply only to proposed or active vouchers');
  });
});
