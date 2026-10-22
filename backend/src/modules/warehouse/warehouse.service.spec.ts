import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  codeToBytes32,
  uuidToBytes32,
  ZERO_BYTES32,
} from '../../blockchain/utils/ids';
import { bdDayEnd } from '../../common/time/bd-dates';
import {
  actor,
  ChainState,
  config,
  fakeCatalog,
  fakeClock,
  fakeQueryBuilder,
  fakeRepo,
  fakeTx,
  ParticipantStatus,
  revert,
  Role,
  uniqueViolation,
} from '../../../test/support/unit';
import type { Project } from '../projects/entities/project.entity';
import { ProjectStage } from '../projects/project.enums';
import type { ReceiptRecheck } from './entities/receipt-recheck.entity';
import type { WarehouseReceipt } from './entities/warehouse-receipt.entity';
import { ReceiptStatus, WEGRO_OWNER } from './warehouse.enums';
import {
  intakeFingerprint,
  recheckFingerprint,
  WarehouseService,
  receiptNumberRange,
} from './warehouse.service';

const NOW = new Date('2026-10-14T06:00:00Z');
const PROJECT = randomUUID();
const FARMER = randomUUID();
const SITE = randomUUID();
const RECEIPT = '0x' + 'ab'.repeat(32);

describe('WarehouseService', () => {
  const operator = actor(Role.WAREHOUSE);
  const officer = actor(Role.FIELD_OFFICER);
  const admin = actor(Role.ADMIN);

  const build = (
    opts: {
      project?: Partial<Project>;
      receipt?: Partial<WarehouseReceipt>;
      parent?: Partial<WarehouseReceipt>;
      site?: string | null;
      officerOf?: boolean;
      ledger?: { status: bigint; detailsHash?: string; quantity?: bigint };
      operatorUser?: object | null;
    } = {},
  ) => {
    const project = {
      id: PROJECT,
      farmerId: FARMER,
      stage: ProjectStage.ACTIVE,
      category: 'grain',
      produceCode: 'MAIZE',
      ...opts.project,
    } as Project;
    const stored: WarehouseReceipt[] = [];
    if (opts.receipt) {
      stored.push({
        id: RECEIPT,
        projectId: PROJECT,
        siteId: SITE,
        ownerId: FARMER,
        ownerIsWegro: false,
        produceCode: 'MAIZE',
        quantity: 500,
        status: ReceiptStatus.ISSUED,
        intakeDate: '2026-10-01',
        expiresOn: '2026-12-31',
        bagCount: 10,
        moisturePercent: '13.5',
        storageBay: 'B2',
        notes: null,
        parentId: null,
        ...opts.receipt,
      } as WarehouseReceipt);
    }
    if (opts.parent)
      stored.push({ ...stored[0], ...opts.parent } as WarehouseReceipt);
    const receipts = fakeRepo({
      create: jest.fn((r: WarehouseReceipt) => ({ ...r })),
      insert: jest.fn(
        (r: WarehouseReceipt) => (stored.push(r), Promise.resolve({})),
      ),
      findOneBy: jest.fn(({ id }: { id: string }) =>
        Promise.resolve(stored.find((r) => r.id === id) ?? null),
      ),
      delete: jest.fn(({ id }: { id: string }) => {
        stored.splice(
          stored.findIndex((r) => r.id === id),
          1,
        );
        return Promise.resolve({ affected: 1 });
      }),
      createQueryBuilder: jest.fn(
        () => fakeQueryBuilder({ getOne: stored[0] ?? null }).qb,
      ),
      find: jest.fn(() => Promise.resolve([])),
    });
    const rechecks: ReceiptRecheck[] = [];
    const rechecksRepo = fakeRepo({
      create: jest.fn((r: ReceiptRecheck) => ({ ...r, id: 'rc1' })),
      insert: jest.fn(
        (r: ReceiptRecheck) => (rechecks.push(r), Promise.resolve({})),
      ),
      delete: jest.fn(() => (rechecks.pop(), Promise.resolve({}))),
    });
    const sites = fakeRepo({
      create: jest.fn((s: object) => ({ ...s })),
      findOneBy: jest.fn(({ id }: { id: string }) =>
        Promise.resolve(
          id === SITE
            ? {
                id: SITE,
                name: 'Hub',
                districtCode: 'BOGURA',
                status: 'registered',
              }
            : null,
        ),
      ),
      find: jest.fn(() => Promise.resolve([])),
    });
    const operators = fakeRepo({
      findOne: jest.fn(() =>
        Promise.resolve(
          opts.site === null
            ? null
            : { operatorId: operator.id, siteId: opts.site ?? SITE },
        ),
      ),
      find: jest.fn(() => Promise.resolve([])),
    });
    const chain = fakeTx();
    const service = new WarehouseService(
      config({ PUBLIC_APP_URL: 'https://app.example' }),
      sites as never,
      operators as never,
      receipts as never,
      rechecksRepo as never,
      fakeRepo({ findOneBy: jest.fn(() => Promise.resolve(project)) }) as never,
      fakeRepo({
        exists: jest.fn(() => Promise.resolve(opts.officerOf ?? false)),
        findOneBy: jest.fn(() =>
          Promise.resolve(
            opts.operatorUser === undefined
              ? {
                  id: operator.id,
                  role: Role.WAREHOUSE,
                  status: ParticipantStatus.VERIFIED,
                  chainState: ChainState.CONFIRMED,
                }
              : opts.operatorUser,
          ),
        ),
      }) as never,
      fakeCatalog() as never,
      { names: () => Promise.resolve(new Map()) } as never,
      chain.tx as never,
      { apply: jest.fn(() => Promise.resolve()) } as never,
      {
        get: () => ({
          getReceipt: jest.fn(() =>
            Promise.resolve({
              status: 0n,
              detailsHash: ZERO_BYTES32,
              quantity: 0n,
              ...opts.ledger,
            }),
          ),
        }),
      } as never,
      fakeClock(NOW) as never,
      { condition: () => null } as never,
    );
    return { service, stored, rechecks, chain, sites };
  };

  describe('sites', () => {
    it('refuses a duplicate name before the ledger, and removes a site the ledger refuses', async () => {
      const dup = build();
      dup.sites.insert.mockRejectedValueOnce(uniqueViolation());
      await expect(
        dup.service.createSite(admin, {
          name: 'Hub',
          districtCode: 'BOGURA',
          address: 'x',
          storageType: 'dry',
        } as never),
      ).rejects.toThrow(ConflictException);
      expect(dup.chain.sent).toEqual([]);
      const refused = build();
      refused.chain.fail(revert('SiteExists'));
      await expect(
        refused.service.createSite(admin, {
          name: 'Hub2',
          districtCode: 'BOGURA',
          address: 'x',
          storageType: 'dry',
        } as never),
      ).rejects.toThrow();
      expect(refused.sites.delete).toHaveBeenCalledTimes(1);
    });

    it('assigns only a verified operator, to a registered site or none', async () => {
      await expect(
        build({ operatorUser: { role: Role.FARMER } }).service.assignOperator(
          admin,
          operator.id,
          SITE,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      await expect(
        build().service.assignOperator(admin, operator.id, randomUUID()),
      ).rejects.toThrow(NotFoundException);
      const { service, chain } = build();
      await service.assignOperator(admin, operator.id, null);
      expect(chain.sent[0].args).toEqual([
        uuidToBytes32(operator.id),
        ZERO_BYTES32,
      ]);
    });
  });

  describe('issuing receipts', () => {
    const dto = {
      projectId: PROJECT,
      quantity: 500,
      intakeDate: '2026-10-14',
      expiresOn: '2027-01-31',
      bagCount: 10,
      moisturePercent: '13.50',
    };

    it('issues to the farmer at the operator’s own site, fingerprinting the intake', async () => {
      const { service, stored, chain } = build();
      await service.issue(operator, dto as never);
      const r = stored[0];
      expect(r).toMatchObject({
        siteId: SITE,
        ownerId: FARMER,
        ownerIsWegro: false,
        moisturePercent: '13.5',
        originalQuantity: 500,
      });
      expect(r.id).toMatch(/^0x[0-9a-f]{64}$/);
      expect(r.detailsHash).toBe(intakeFingerprint(r));
      expect(chain.sent[0]).toMatchObject({
        method: 'issueReceipt',
        args: [
          r.id,
          uuidToBytes32(PROJECT),
          codeToBytes32('MAIZE'),
          500,
          bdDayEnd('2027-01-31'),
          r.detailsHash,
        ],
      });
    });

    it('lists every problem with the dates and moisture together', async () => {
      const err = await build()
        .service.issue(operator, {
          ...dto,
          intakeDate: '2026-10-15',
          expiresOn: '2026-10-13',
          moisturePercent: '101',
        } as never)
        .catch((e: UnprocessableEntityException) => e.getResponse());
      const problems = (err as { details: { problems: object[] } }).details
        .problems;
      expect(problems).toEqual([
        expect.objectContaining({ code: 'INTAKE_IN_FUTURE' }),
        expect.objectContaining({ code: 'EXPIRY_IN_PAST' }),
        expect.objectContaining({ code: 'EXPIRES_BEFORE_INTAKE' }),
        expect.objectContaining({
          code: 'MEASUREMENT_ABOVE_MAX',
          details: {
            key: 'moisturePercent',
            label: 'Moisture',
            labelBn: 'আর্দ্রতা',
            max: 100,
          },
        }),
      ]);
    });

    it.each([
      ['an operator without a site', { site: null }, 'NOT_SITE_OPERATOR'],
      [
        'a project not active',
        { project: { stage: ProjectStage.FUNDED } },
        'PROJECT_NOT_ACTIVE',
      ],
      [
        'fresh produce',
        { project: { category: 'perishable' } },
        'NOT_STORABLE',
      ],
    ])('refuses %s', async (_l, opts, code) => {
      const err = await build(opts as never)
        .service.issue(operator, dto as never)
        .catch((e: UnprocessableEntityException) => e.getResponse());
      expect(err).toMatchObject({ code });
    });

    it('removes a receipt the ledger refuses', async () => {
      const { service, stored, chain } = build();
      chain.fail(revert('ProjectNotActive'));
      await expect(service.issue(operator, dto as never)).rejects.toThrow();
      expect(stored).toEqual([]);
    });
  });

  describe('re-checks and collection', () => {
    it('extends the term only at the issuing site, later than now and than before', async () => {
      await expect(
        build({ receipt: {}, site: randomUUID() }).service.extend(
          operator,
          RECEIPT,
          {
            checkedOn: '2026-10-14',
            newExpiresOn: '2027-03-31',
          } as never,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        build({ receipt: {} }).service.extend(operator, RECEIPT, {
          checkedOn: '2026-10-14',
          newExpiresOn: '2026-12-31',
        } as never),
      ).rejects.toThrow(UnprocessableEntityException);
      const { service, rechecks, chain } = build({ receipt: {} });
      await service.extend(operator, RECEIPT, {
        checkedOn: '2026-10-14',
        newExpiresOn: '2027-03-31',
      } as never);
      expect(rechecks[0].recheckHash).toBe(recheckFingerprint(rechecks[0]));
      expect(chain.sent[0]).toMatchObject({
        method: 'extendExpiry',
        args: [RECEIPT, bdDayEnd('2027-03-31'), rechecks[0].recheckHash],
      });
    });

    it('collects only an issued receipt', async () => {
      await expect(
        build({ receipt: { status: ReceiptStatus.LISTED } }).service.collect(
          operator,
          RECEIPT,
        ),
      ).rejects.toThrow(
        'Only an issued receipt can be collected; this one is listed',
      );
    });
  });

  describe('buy-back handover', () => {
    it('lets only the farmer’s own officer offer an unexpired, issued receipt to WeGro', async () => {
      await expect(
        build({ receipt: {} }).service.offerHandover(officer, RECEIPT),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        build({
          receipt: { expiresOn: '2026-10-13' },
          officerOf: true,
        }).service.offerHandover(officer, RECEIPT),
      ).rejects.toThrow('This receipt has expired');
      const { service, chain } = build({ receipt: {}, officerOf: true });
      await service.offerHandover(officer, RECEIPT);
      expect(chain.sent[0]).toMatchObject({
        method: 'offerHandover',
        args: [RECEIPT, WEGRO_OWNER],
      });
    });

    it('accepts or cancels only a handover that is waiting', async () => {
      await expect(
        build({ receipt: {} }).service.acceptHandover(admin, RECEIPT),
      ).rejects.toThrow('No handover is waiting on this receipt');
      const waiting = { receipt: { status: ReceiptStatus.PENDING_HANDOVER } };
      await expect(
        build(waiting).service.cancelHandover(officer, RECEIPT),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        build(waiting).service.cancelHandover(admin, RECEIPT),
      ).resolves.toBeDefined();
    });
  });

  describe('the public QR check', () => {
    it('is genuine when the intake still produces the ledger’s fingerprint, never naming the owner', async () => {
      const w = build({ receipt: {} });
      const hash = intakeFingerprint(w.stored[0]);
      const res = await build({
        receipt: {},
        ledger: { status: 1n, detailsHash: hash, quantity: 500n },
      }).service.verify(RECEIPT);
      expect(res).toMatchObject({
        genuine: true,
        quantity: 500,
        site: { name: 'Hub', district: 'Bogura' },
      });
      expect(JSON.stringify(res)).not.toContain(FARMER);
    });

    it('checks a sold part against its parent’s intake', async () => {
      const parentId = '0x' + 'cd'.repeat(32);
      const parent = build({ receipt: { id: parentId } }).stored[0];
      const { service } = build({
        receipt: { parentId, quantity: 100 },
        parent: { id: parentId, parentId: null },
        ledger: {
          status: 1n,
          detailsHash: intakeFingerprint(parent),
          quantity: 100n,
        },
      });
      await expect(service.verify(RECEIPT)).resolves.toMatchObject({
        genuine: true,
        partOfLargerReceipt: true,
      });
    });

    it('is not genuine for a bad id, an unknown receipt or an edited intake', async () => {
      await expect(build().service.verify('nope')).resolves.toMatchObject({
        genuine: false,
      });
      await expect(
        build({ receipt: {} }).service.verify(RECEIPT),
      ).resolves.toMatchObject({ genuine: false });
      await expect(
        build({
          receipt: {},
          ledger: { status: 1n, detailsHash: '0x' + '1'.repeat(64) },
        }).service.verify(RECEIPT),
      ).resolves.toMatchObject({ genuine: false, site: null });
    });
  });
});

describe('receipt numbers', () => {
  it('turns what is printed or typed into a range of receipt ids', () => {
    const id = `0x3f9a2c1b${'0'.repeat(56)}`;
    expect(receiptNumberRange('WR-3F9A2C1B')).toEqual({
      idFrom: '0x3f9a2c1b',
      idTo: '0x3f9a2c1bg',
    });
    expect(receiptNumberRange(' 0x3f9a2c ')).toEqual({
      idFrom: '0x3f9a2c',
      idTo: '0x3f9a2cg',
    });
    const exact = receiptNumberRange(id)!;
    expect(exact.idFrom <= id && id < exact.idTo).toBe(true);
    expect(receiptNumberRange('3f9a')).toBeNull(); // too short to mean one
    expect(receiptNumberRange('Maize')).toBeNull();
  });
});
