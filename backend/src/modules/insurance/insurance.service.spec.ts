import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { codeToBytes32, uuidToBytes32 } from '../../blockchain/utils/ids';
import {
  actor,
  fakeCatalog,
  fakeClock,
  fakeRepo,
  fakeTx,
  matchesWhere,
  revert,
  Role,
} from '../../../test/support/unit';
import type { Project } from '../projects/entities/project.entity';
import { ProjectStage } from '../projects/project.enums';
import type { CoverageTerms } from './entities/coverage-terms.entity';
import type { WeatherEvent } from './entities/weather-event.entity';
import {
  coverageFingerprint,
  weatherEventFingerprint,
} from './insurance-fingerprints';
import { InsuranceService } from './insurance.service';

const PROJECT = randomUUID();
const FARMER = randomUUID();

describe('InsuranceService', () => {
  const insurer = actor(Role.Insurer);

  const build = (
    opts: {
      project?: Partial<Project> | null;
      approved?: bigint;
      cover?: Partial<CoverageTerms>;
      officerOf?: boolean;
    } = {},
  ) => {
    const project =
      opts.project === null
        ? null
        : ({
            id: PROJECT,
            farmerId: FARMER,
            insured: true,
            stage: ProjectStage.Active,
            ...opts.project,
          } as Project);
    const terms: CoverageTerms[] = opts.cover
      ? [
          {
            id: randomUUID(),
            projectId: PROJECT,
            insurerId: insurer.id,
            maxAmount: 10_000_000n,
            coveredEventTypes: ['FLOOD'],
            notes: null,
            termsHash: '0xcurrent',
            status: 'recorded',
            ...opts.cover,
          } as CoverageTerms,
        ]
      : [];
    const termsRepo = fakeRepo({
      create: jest.fn((t: CoverageTerms) => ({ ...t })),
      findOne: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          terms.find((t) => matchesWhere(t as never, where)) ?? null,
        ),
      ),
      findOneBy: jest.fn((where: Record<string, unknown>) =>
        Promise.resolve(
          terms.find((t) => matchesWhere(t as never, where)) ?? null,
        ),
      ),
      find: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          terms.filter((t) => matchesWhere(t as never, where)).reverse(),
        ),
      ),
      insert: jest.fn(
        (t: CoverageTerms) => (terms.push(t), Promise.resolve({})),
      ),
      delete: jest.fn((where: Record<string, unknown>) => {
        const i = terms.findIndex((t) => matchesWhere(t as never, where));
        if (i >= 0) terms.splice(i, 1);
        return Promise.resolve({ affected: 1 });
      }),
      exists: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(terms.some((t) => matchesWhere(t as never, where))),
      ),
    });
    const events: WeatherEvent[] = [];
    const eventsRepo = fakeRepo({
      create: jest.fn((e: WeatherEvent) => ({ ...e })),
      insert: jest.fn(
        (e: WeatherEvent) => (events.push(e), Promise.resolve({})),
      ),
      findOneBy: jest.fn(({ id }: { id: string }) =>
        Promise.resolve(events.find((e) => e.id === id) ?? null),
      ),
      delete: jest.fn(({ id }: { id: string }) => {
        events.splice(
          events.findIndex((e) => e.id === id),
          1,
        );
        return Promise.resolve({ affected: 1 });
      }),
    });
    // The ledger records a cover version when setCoverage lands.
    const chain = fakeTx((call) => {
      if (call.method === 'setCoverage') {
        const hash = call.args[2];
        for (const t of terms) {
          if (t.termsHash === hash) t.status = 'recorded';
          else if (t.status === 'recorded') t.status = 'superseded' as never;
        }
      }
      return [];
    });
    const registry = {
      approvedTotal: jest.fn(() => Promise.resolve(opts.approved ?? 0n)),
      openClaims: jest.fn(() => Promise.resolve(0n)),
    };
    const service = new InsuranceService(
      termsRepo as never,
      eventsRepo as never,
      fakeRepo({ findOneBy: jest.fn(() => Promise.resolve(project)) }) as never,
      fakeRepo({
        exists: jest.fn(() => Promise.resolve(opts.officerOf ?? false)),
      }) as never,
      fakeCatalog({
        weatherEventTypes: [{ code: 'FLOOD' }, { code: 'DROUGHT' }],
      }) as never,
      { names: () => Promise.resolve(new Map()) } as never,
      { get: () => registry } as never,
      chain.tx as never,
      { apply: jest.fn(() => Promise.resolve()) } as never,
      fakeClock() as never,
    );
    return { service, terms, events, chain, termsRepo };
  };

  describe('cover', () => {
    const dto = { maxAmount: '100000', coveredEventTypes: ['FLOOD'] };

    it('records the first cover with its fingerprint, the insurer becoming the project’s insurer', async () => {
      const { service, terms, chain } = build();
      const res = await service.setCoverage(insurer, PROJECT, dto as never);
      const version = terms[0];
      expect(version).toMatchObject({
        insurerId: insurer.id,
        maxAmount: 10_000_000n,
        previousTermsHash: null,
        status: 'recorded',
      });
      expect(version.termsHash).toBe(coverageFingerprint(version));
      expect(chain.sent[0]).toMatchObject({
        method: 'setCoverage',
        args: [uuidToBytes32(PROJECT), 10_000_000n, version.termsHash],
      });
      expect(res).toMatchObject({ remaining: '100000.00', history: [] });
    });

    it('chains a new version to the previous one, sorted event types and all', async () => {
      const { service, terms } = build({ cover: {} });
      await service.setCoverage(insurer, PROJECT, {
        maxAmount: '150000',
        coveredEventTypes: ['FLOOD', 'DROUGHT'],
      } as never);
      expect(terms[1]).toMatchObject({
        previousTermsHash: '0xcurrent',
        coveredEventTypes: ['DROUGHT', 'FLOOD'],
      });
    });

    it('refuses unchanged terms, another insurer, and cover below what is approved', async () => {
      await expect(
        build({ cover: {} }).service.setCoverage(
          insurer,
          PROJECT,
          dto as never,
        ),
      ).rejects.toThrow('These are already the current terms');
      await expect(
        build({ cover: {} }).service.setCoverage(
          actor(Role.Insurer),
          PROJECT,
          dto as never,
        ),
      ).rejects.toThrow(ForbiddenException);
      const err = await build({ approved: 12_000_000n })
        .service.setCoverage(insurer, PROJECT, dto as never)
        .catch((e: ConflictException) => e.getResponse());
      expect(err).toMatchObject({
        code: 'COVERAGE_BELOW_APPROVED',
        details: { approvedTotal: '120000.00' },
      });
    });

    it('only covers insured projects with the crop in the field', async () => {
      await expect(
        build({ project: { insured: false } }).service.setCoverage(
          insurer,
          PROJECT,
          dto as never,
        ),
      ).rejects.toThrow('This project is not insured');
      await expect(
        build({
          project: { stage: ProjectStage.ReadyForSale },
        }).service.setCoverage(insurer, PROJECT, dto as never),
      ).rejects.toThrow(ConflictException);
      await expect(
        build({ project: null }).service.setCoverage(
          insurer,
          PROJECT,
          dto as never,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('removes a version the ledger refuses, but reuses one left from an attempt that never landed', async () => {
      const refused = build();
      refused.chain.fail(revert('NotInsured'));
      await expect(
        refused.service.setCoverage(insurer, PROJECT, dto as never),
      ).rejects.toThrow();
      expect(refused.terms).toEqual([]);

      const retried = build();
      retried.chain.fail(new Error('timeout'));
      await expect(
        retried.service.setCoverage(insurer, PROJECT, dto as never),
      ).rejects.toThrow('timeout');
      await retried.service.setCoverage(insurer, PROJECT, dto as never);
      expect(retried.terms).toHaveLength(1);
      expect(retried.termsRepo.insert).toHaveBeenCalledTimes(1);
    });
  });

  describe('who sees a cover', () => {
    it('staff, the project’s insurer, the farmer and their officer only', async () => {
      const covered = build({ cover: {} });
      await expect(
        covered.service.coverage(actor(Role.Admin), PROJECT),
      ).resolves.toBeDefined();
      await expect(
        covered.service.coverage(insurer, PROJECT),
      ).resolves.toBeDefined();
      await expect(
        covered.service.coverage(actor(Role.Farmer, { id: FARMER }), PROJECT),
      ).resolves.toBeDefined();
      await expect(
        covered.service.coverage(actor(Role.Insurer), PROJECT),
      ).rejects.toThrow(NotFoundException);
      await expect(
        covered.service.coverage(actor(Role.Investor), PROJECT),
      ).rejects.toThrow(NotFoundException);
      await expect(
        build({ cover: {}, officerOf: true }).service.coverage(
          actor(Role.FieldOfficer),
          PROJECT,
        ),
      ).resolves.toBeDefined();
    });

    it('never shows a negative remainder', async () => {
      const res = await build({
        cover: {},
        approved: 11_000_000n,
      }).service.coverage(insurer, PROJECT);
      expect(res).toMatchObject({
        approvedTotal: '110000.00',
        remaining: '0.00',
      });
    });
  });

  describe('weather events', () => {
    const event = {
      districtCode: 'BOGURA',
      eventTypeCode: 'FLOOD',
      occurredOn: '2026-10-10',
      severity: 'severe',
    };

    it('records the event with its fingerprint on the ledger', async () => {
      const { service, events, chain } = build();
      await service.recordWeatherEvent(insurer, event as never);
      expect(events[0].detailsHash).toBe(weatherEventFingerprint(events[0]));
      expect(chain.sent[0]).toMatchObject({
        method: 'recordWeatherEvent',
        args: [
          uuidToBytes32(events[0].id),
          codeToBytes32('BOGURA'),
          codeToBytes32('FLOOD'),
          events[0].detailsHash,
        ],
      });
    });

    it('refuses a future date and removes an event the ledger refuses', async () => {
      await expect(
        build().service.recordWeatherEvent(insurer, {
          ...event,
          occurredOn: '2026-10-15',
        } as never),
      ).rejects.toThrow(UnprocessableEntityException);
      const { service, events, chain } = build();
      chain.fail(revert('EventExists'));
      await expect(
        service.recordWeatherEvent(insurer, event as never),
      ).rejects.toThrow();
      expect(events).toEqual([]);
    });
  });
});
