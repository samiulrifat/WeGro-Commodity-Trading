import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { bdDayEnd } from '../../common/time/bd-dates';
import {
  actor,
  fakeClock,
  fakeRepo,
  fakeTx,
  revert,
  Role,
} from '../../../test/support/unit';
import { photoHash } from '../field-records/photos.service';
import type { BankConsent } from './entities/bank-consent.entity';
import type { TrackRecord } from './entities/track-record.entity';
import { consentFingerprint } from './track-record-fingerprints';
import { summaryFingerprint } from './track-record-summary';
import { ConsentStatus } from './track-record.enums';
import { TrackRecordsService } from './track-records.service';

const NOW = new Date('2026-10-14T06:00:00Z');
const FARMER = randomUUID();
const BANK = randomUUID();
const P1 = randomUUID();
const P2 = randomUUID();
const PX = randomUUID();

describe('TrackRecordsService', () => {
  const officer = actor(Role.FIELD_OFFICER);
  const bankOfficer = actor(Role.BANK);

  const summary = (projects: string[]) =>
    ({
      v: 2,
      farmer: { id: FARMER, name: 'Rahim', district: 'Bogura' },
      projects: projects.map((id) => ({ id })),
      totals: { projects: projects.length },
      importedHistory: [],
    }) as never;

  const build = (
    opts: {
      officerOf?: boolean;
      farmer?: object | null;
      projects?: string[];
      latest?: Partial<TrackRecord> | null;
      consent?: Partial<BankConsent> | null;
      bankOf?: string | null;
      photo?: object | null;
    } = {},
  ) => {
    const farmer =
      opts.farmer === undefined
        ? {
            id: FARMER,
            role: Role.FARMER,
            fieldOfficerId: opts.officerOf === false ? 'other' : officer.id,
          }
        : opts.farmer;
    const records: TrackRecord[] = [];
    const latest =
      opts.latest === undefined || opts.latest === null
        ? null
        : ({
            farmerId: FARMER,
            version: 1,
            status: 'recorded',
            projectIds: [],
            publishedById: officer.id,
            ...opts.latest,
          } as TrackRecord);
    const recordsRepo = fakeRepo({
      insert: jest.fn(
        (r: TrackRecord) => (records.push(r), Promise.resolve({})),
      ),
      delete: jest.fn(() => (records.pop(), Promise.resolve({}))),
      findOne: jest.fn(() => Promise.resolve(latest)),
      findOneBy: jest.fn(() => Promise.resolve(latest)),
      findOneByOrFail: jest.fn(() => Promise.resolve(latest)),
    });
    const consents: BankConsent[] = [];
    const current =
      opts.consent === undefined || opts.consent === null
        ? null
        : ({
            id: 'c1',
            farmerId: FARMER,
            bankId: BANK,
            status: ConsentStatus.ACTIVE,
            expiresAt: new Date('2027-01-31T17:59:59Z'),
            ...opts.consent,
          } as BankConsent);
    const consentsRepo = fakeRepo({
      insert: jest.fn(
        (c: BankConsent) => (consents.push(c), Promise.resolve({})),
      ),
      delete: jest.fn(() => (consents.pop(), Promise.resolve({}))),
      findOneBy: jest.fn(() => Promise.resolve(current)),
      findOneByOrFail: jest.fn(({ id }: { id: string }) =>
        Promise.resolve(consents.find((c) => c.id === id) ?? current),
      ),
    });
    const chain = fakeTx((call) =>
      call.method === 'publishTrackRecord'
        ? [
            {
              contract: 'ConsentRegistry',
              name: 'TrackRecordPublished',
              args: { version: 2n },
              logIndex: 0,
            },
          ]
        : call.method === 'viewSummary'
          ? [
              {
                contract: 'ConsentRegistry',
                name: 'SummaryViewed',
                args: { version: 1n },
                logIndex: 0,
              },
            ]
          : [],
    );
    const banks = {
      send: jest.fn((who: { keyIndex: number }, build: never) =>
        chain.tx.send(who.keyIndex, 'ConsentRegistry', build),
      ),
      bankOf: jest.fn(() =>
        Promise.resolve(opts.bankOf === undefined ? BANK : opts.bankOf),
      ),
      names: jest.fn(() =>
        Promise.resolve(new Map([[BANK, 'Krishi, Bogura']])),
      ),
    };
    const ledgerHash = jest.fn(() =>
      Promise.resolve({ summaryHash: latest?.summaryHash ?? null }),
    );
    const builder = {
      build: jest.fn(() =>
        Promise.resolve({
          summary: summary(opts.projects ?? [P1]),
          projectIds: opts.projects ?? [P1],
        }),
      ),
      importedHistory: jest.fn(() => Promise.resolve([])),
    };
    const service = new TrackRecordsService(
      { query: jest.fn(() => Promise.resolve([])) } as never,
      recordsRepo as never,
      consentsRepo as never,
      fakeRepo() as never,
      fakeRepo({
        findOneBy: jest.fn(() =>
          Promise.resolve({ id: BANK, status: 'registered' }),
        ),
      }) as never,
      fakeRepo({
        findOne: jest.fn(() => Promise.resolve(farmer)),
        exists: jest.fn(() => Promise.resolve(opts.officerOf !== false)),
      }) as never,
      fakeRepo() as never,
      fakeRepo({
        findOneBy: jest.fn(() =>
          Promise.resolve(
            opts.photo === undefined
              ? { id: 'ph', sha256: 'ab'.repeat(32) }
              : opts.photo,
          ),
        ),
      }) as never,
      builder as never,
      banks as never,
      { find: jest.fn() } as never,
      { names: () => Promise.resolve(new Map()) } as never,
      { get: () => ({ getTrackRecord: ledgerHash }) } as never,
      fakeClock(NOW) as never,
      { condition: () => null, apply: (qb: unknown) => qb } as never,
    );
    return { service, records, consents, chain, ledgerHash };
  };

  describe('who sees a farmer', () => {
    it('staff, the farmer and their own officer', async () => {
      await expect(
        build().service.versions(actor(Role.AUDITOR), FARMER),
      ).resolves.toEqual([]);
      await expect(
        build().service.versions(actor(Role.FARMER, { id: FARMER }), FARMER),
      ).resolves.toEqual([]);
      await expect(build().service.versions(officer, FARMER)).resolves.toEqual(
        [],
      );
      await expect(
        build({ officerOf: false }).service.versions(officer, FARMER),
      ).rejects.toThrow(NotFoundException);
      await expect(
        build().service.versions(actor(Role.INVESTOR), FARMER),
      ).rejects.toThrow(NotFoundException);
      await expect(
        build({ farmer: { id: FARMER, role: Role.INVESTOR } }).service.versions(
          actor(Role.ADMIN),
          FARMER,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('publishing', () => {
    it('builds the summary itself, stores it, and publishes its fingerprint', async () => {
      const { service, records, chain } = build({
        projects: [P1, P2],
        latest: { summaryHash: '0xold', summary: summary([P1]) },
      });
      await service.publish(officer, FARMER);
      const r = records[0];
      expect(r).toMatchObject({
        status: 'submitted',
        projectIds: [P1, P2],
      });
      expect(r.summaryHash).toBe(summaryFingerprint(r.summary));
      expect(chain.sent[0]).toMatchObject({
        method: 'publishTrackRecord',
        args: [
          uuidToBytes32(FARMER),
          [P1, P2].map(uuidToBytes32),
          r.summaryHash,
        ],
      });
    });

    it('needs the farmer’s own officer, finished projects, and something new', async () => {
      await expect(
        build().service.publish(actor(Role.ADMIN), FARMER),
      ).rejects.toThrow(ForbiddenException);
      const none = await build({ projects: [] })
        .service.publish(officer, FARMER)
        .catch((e: ConflictException) => e.getResponse());
      expect(none).toMatchObject({ code: 'NO_FINISHED_PROJECTS' });
      const same = await build({ latest: { summary: summary([P1]) } })
        .service.publish(officer, FARMER)
        .catch((e: ConflictException) => e.getResponse());
      expect(same).toMatchObject({
        code: 'UNCHANGED',
        message: 'Nothing changed since version 1',
      });
    });

    it('lets the super admin act for a farmer whose officer is gone', async () => {
      const superAdmin = actor(Role.SUPER_ADMIN);
      const orphan = { id: FARMER, role: Role.FARMER, fieldOfficerId: null };
      const { service, chain } = build({
        farmer: orphan,
        officerOf: false,
        latest: { summaryHash: '0xold', summary: summary([PX]) },
      });
      await service.publish(superAdmin, FARMER);
      await service.grant(superAdmin, FARMER, {
        bankId: BANK,
        expiresOn: '2027-01-01',
        evidencePhotoId: 'ph',
      });
      expect(chain.methods()).toEqual(['publishTrackRecord', 'grantConsent']);
      const withConsent = build({
        farmer: orphan,
        officerOf: false,
        consent: {},
      });
      await withConsent.service.revoke(superAdmin, FARMER, BANK);
      expect(withConsent.chain.methods()).toEqual(['revokeConsent']);
      // Admins still may not.
      await expect(
        build({ farmer: orphan }).service.publish(actor(Role.ADMIN), FARMER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('previews with the officer and the finished projects the latest version lacks', async () => {
      const behind = await build({
        projects: [P1, P2],
        latest: { projectIds: [P1], summary: summary([P1]) },
      }).service.preview(actor(Role.SUPER_ADMIN), FARMER);
      expect(behind).toMatchObject({
        latestVersion: 1,
        pendingProjects: 1,
        officer: { id: officer.id },
      });
      const first = await build({
        projects: [P1],
        farmer: { id: FARMER, role: Role.FARMER, fieldOfficerId: null },
      }).service.preview(actor(Role.ADMIN), FARMER);
      expect(first).toMatchObject({
        latestVersion: null,
        pendingProjects: 0,
        officer: null,
      });
    });

    it('removes a version the ledger refuses', async () => {
      const { service, records, chain } = build();
      chain.fail(revert('NotFarmersOfficer'));
      await expect(service.publish(officer, FARMER)).rejects.toThrow();
      expect(records).toEqual([]);
    });

    it('marks a version verified only when the stored summary still gives the ledger’s hash', async () => {
      const s = summary([P1]);
      const hash = summaryFingerprint(s);
      const good = build({ latest: { summary: s, summaryHash: hash } });
      await expect(
        good.service.record(officer, FARMER, 1),
      ).resolves.toMatchObject({ verified: true });
      const edited = build({
        latest: { summary: summary([P1, PX]), summaryHash: hash },
      });
      await expect(
        edited.service.record(officer, FARMER, 1),
      ).resolves.toMatchObject({ verified: false });
    });
  });

  describe('bank permission', () => {
    const until = (date: string) => ({
      bankId: BANK,
      expiresOn: date,
      evidencePhotoId: 'ph',
    });

    it('records the signed form’s fingerprint with the expiry, then grants on the ledger', async () => {
      const { service, consents, chain } = build();
      await service.grant(officer, FARMER, until('2027-04-30') as never);
      const c = consents[0];
      const expiresAt = bdDayEnd('2027-04-30');
      expect(c.evidenceHash).toBe(
        consentFingerprint({
          consentId: c.id,
          farmerId: FARMER,
          bankId: BANK,
          expiresAt,
          photoHash: photoHash('ab'.repeat(32)),
        }),
      );
      expect(chain.sent[0]).toMatchObject({
        method: 'grantConsent',
        args: [
          uuidToBytes32(FARMER),
          uuidToBytes32(BANK),
          expiresAt,
          c.evidenceHash,
        ],
      });
    });

    it('lasts at most a year, ends today at the earliest, and needs the officer’s own photo', async () => {
      const late = await build()
        .service.grant(officer, FARMER, until('2027-10-15') as never)
        .catch((e: UnprocessableEntityException) => e.getResponse());
      expect(late).toMatchObject({
        code: 'EXPIRY_TOO_LATE',
        details: { latest: '2027-10-13' },
      });
      // That suggested day is accepted; the day after is refused.
      await expect(
        build().service.grant(officer, FARMER, until('2027-10-13') as never),
      ).resolves.toBeDefined();
      await expect(
        build().service.grant(officer, FARMER, until('2027-10-14') as never),
      ).rejects.toThrow('Permission lasts at most a year');
      await expect(
        build().service.grant(officer, FARMER, until('2026-10-13') as never),
      ).rejects.toThrow('expiresOn must be today or later');
      await expect(
        build({ photo: null }).service.grant(
          officer,
          FARMER,
          until('2027-01-01') as never,
        ),
      ).rejects.toThrow('evidencePhotoId must be a photo you uploaded');
    });

    it('withdraws only a current permission', async () => {
      const err = await build()
        .service.revoke(officer, FARMER, BANK)
        .catch((e: ConflictException) => e.getResponse());
      expect(err).toMatchObject({ code: 'NO_CONSENT_TO_WITHDRAW' });
      const { service, chain } = build({ consent: {} });
      await service.revoke(officer, FARMER, BANK);
      expect(chain.methods()).toEqual(['revokeConsent']);
    });
  });

  describe('a bank officer’s view', () => {
    it('is a logged ledger call from the officer’s key, checked against the ledger’s hash', async () => {
      const s = summary([P1]);
      const { service, chain } = build({
        consent: {},
        latest: {
          summary: s,
          summaryHash: summaryFingerprint(s),
          publishedAt: NOW,
        },
      });
      const view = await service.bankView(bankOfficer, FARMER);
      expect(chain.sent[0]).toMatchObject({
        signer: bankOfficer.keyIndex,
        method: 'viewSummary',
        args: [uuidToBytes32(FARMER)],
      });
      expect(view).toMatchObject({
        version: 1,
        verified: true,
        txHash: expect.any(String),
      });
    });

    it('needs a bank, the farmer’s permission and a published record', async () => {
      const unassigned = await build({ bankOf: null })
        .service.bankView(bankOfficer, FARMER)
        .catch((e: ForbiddenException) => e.getResponse());
      expect(unassigned).toMatchObject({ code: 'NOT_ASSIGNED_TO_BANK' });
      const noConsent = await build()
        .service.bankView(bankOfficer, FARMER)
        .catch((e: ForbiddenException) => e.getResponse());
      expect(noConsent).toMatchObject({ code: 'NO_ACTIVE_CONSENT' });
      await expect(
        build({ consent: {} }).service.bankView(bankOfficer, FARMER),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
