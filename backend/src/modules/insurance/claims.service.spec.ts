import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { hashPaymentRef } from '../../blockchain/utils/payment-ref';
import {
  actor,
  config,
  fakeCrypto,
  fakeQueryBuilder,
  fakeRepo,
  fakeTx,
  matchesWhere,
  revert,
  Role,
} from '../../../test/support/unit';
import type { Photo } from '../field-records/entities/photo.entity';
import { photoHash } from '../field-records/photos.service';
import type { Project } from '../projects/entities/project.entity';
import { ClaimsService } from './claims.service';
import type { InsuranceClaim } from './entities/insurance-claim.entity';
import type { WeatherEvent } from './entities/weather-event.entity';
import {
  assessmentFingerprint,
  claimFingerprint,
} from './insurance-fingerprints';
import { ClaimStatus } from './insurance.enums';

const PROJECT = randomUUID();
const EVENT = randomUUID();
const SECRET = 'a'.repeat(64);

describe('ClaimsService', () => {
  const officer = actor(Role.FIELD_OFFICER);
  const insurer = actor(Role.INSURER);

  const build = (
    opts: {
      cover?: object | null;
      event?: Partial<WeatherEvent> | null;
      officerOf?: boolean;
      claim?: Partial<InsuranceClaim>;
      ledgerCover?: bigint;
      approved?: bigint;
    } = {},
  ) => {
    const builders: Array<ReturnType<typeof fakeQueryBuilder>> = [];
    const claims: InsuranceClaim[] = opts.claim
      ? [
          {
            id: randomUUID(),
            projectId: PROJECT,
            eventId: EVENT,
            photoIds: [],
            status: ClaimStatus.TRIGGERED,
            assessmentNotes: null,
            approvedAmount: null,
            ...opts.claim,
          } as InsuranceClaim,
        ]
      : [];
    const repo = fakeRepo({
      // Column defaults the database would fill in.
      create: jest.fn((c: InsuranceClaim) =>
        Object.assign(
          { approvedAmount: null, assessmentNotes: null, decidedAt: null },
          c,
        ),
      ),
      insert: jest.fn(
        (c: InsuranceClaim) => (claims.push(c), Promise.resolve({})),
      ),
      findOne: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          claims.find((c) => matchesWhere(c as never, where)) ?? null,
        ),
      ),
      findOneBy: jest.fn((where: Record<string, unknown>) =>
        Promise.resolve(
          claims.find((c) => matchesWhere(c as never, where)) ?? null,
        ),
      ),
      delete: jest.fn((where: Record<string, unknown>) => {
        const i = claims.findIndex((c) => matchesWhere(c as never, where));
        if (i >= 0) claims.splice(i, 1);
        return Promise.resolve({ affected: i >= 0 ? 1 : 0 });
      }),
      update: jest.fn((where: Record<string, unknown>, patch: object) => {
        const hit = claims.filter((c) => matchesWhere(c as never, where));
        hit.forEach((c) => Object.assign(c, patch));
        return Promise.resolve({ affected: hit.length });
      }),
      createQueryBuilder: jest.fn(() => {
        const f = fakeQueryBuilder({ getOne: claims[0] ?? null });
        builders.push(f);
        return f.qb;
      }),
    });
    const event =
      opts.event === null
        ? null
        : ({
            id: EVENT,
            status: 'recorded',
            districtCode: 'BOGURA',
            eventTypeCode: 'FLOOD',
            ...opts.event,
          } as WeatherEvent);
    const photos: Photo[] = [
      {
        id: 'mine',
        sha256: 'ab'.repeat(32),
        uploadedById: officer.id,
      } as Photo,
      { id: 'ins', sha256: 'cd'.repeat(32), uploadedById: insurer.id } as Photo,
    ];
    const photoRows = fakeRepo({
      findBy: jest.fn((where: Record<string, unknown>) =>
        Promise.resolve(photos.filter((p) => matchesWhere(p as never, where))),
      ),
    });
    const chain = fakeTx();
    const registry = {
      getCoverage: jest.fn(() =>
        Promise.resolve({ maxAmount: opts.ledgerCover ?? 10_000_000n }),
      ),
      approvedTotal: jest.fn(() => Promise.resolve(opts.approved ?? 0n)),
    };
    const insurance = {
      requireInsurable: jest.fn(() =>
        Promise.resolve({
          id: PROJECT,
          farmerId: 'f1',
          districtCode: 'BOGURA',
        } as Project),
      ),
      isOfficerOf: jest.fn(() => Promise.resolve(opts.officerOf ?? true)),
      currentAssignment: jest.fn(() =>
        Promise.resolve(opts.cover === null ? null : { insurerId: insurer.id }),
      ),
      currentAssignments: jest.fn(() => Promise.resolve(new Map())),
      eventTypesMatching: jest.fn(() => []),
      currentCover: jest.fn(() =>
        Promise.resolve(
          opts.cover === null
            ? null
            : {
                insurerId: insurer.id,
                coveredEventTypes: ['FLOOD'],
                ...opts.cover,
              },
        ),
      ),
      send: jest.fn((who: { keyIndex: number }, build: never) =>
        chain.tx.send(who.keyIndex, 'InsuranceRegistry', build),
      ),
      registry: () => registry,
      weatherEventDtos: jest.fn((rows: WeatherEvent[]) =>
        Promise.resolve(rows.map((e) => ({ id: e.id }))),
      ),
    };
    const service = new ClaimsService(
      repo as never,
      fakeRepo({
        findOneBy: jest.fn(() => Promise.resolve(event)),
        findBy: jest.fn(() => Promise.resolve(event ? [event] : [])),
      }) as never,
      fakeRepo({
        find: jest.fn(() => Promise.resolve([{ id: PROJECT, title: 'Maize' }])),
      }) as never,
      photoRows as never,
      insurance as never,
      { find: jest.fn() } as never,
      { names: () => Promise.resolve(new Map()) } as never,
      fakeCrypto() as never,
      { condition: () => null } as never,
      config({ PAYMENT_REF_SECRET: SECRET }),
    );
    return { service, claims, chain, repo, builders };
  };

  const openDto = {
    eventId: EVENT,
    damagePercent: '40',
    notes: 'Half the field under water',
    photoIds: ['mine'],
  };

  describe('opening', () => {
    it('fingerprints the evidence, photos included, and opens the claim on the ledger', async () => {
      const { service, claims, chain } = build();
      await service.open(officer, PROJECT, openDto as never);
      const c = claims[0];
      expect(c).toMatchObject({ damagePercent: '40.0', photoIds: ['mine'] });
      expect(c.claimHash).toBe(
        claimFingerprint({
          claimId: c.id,
          projectId: PROJECT,
          eventId: EVENT,
          damagePercent: '40.0',
          notes: openDto.notes,
          photoHashes: [photoHash('ab'.repeat(32))],
        }),
      );
      expect(chain.sent[0]).toMatchObject({
        method: 'openClaim',
        args: [
          uuidToBytes32(c.id),
          uuidToBytes32(PROJECT),
          uuidToBytes32(EVENT),
          c.claimHash,
        ],
      });
    });

    it('lets only the farmer’s officer or an admin claim', async () => {
      await expect(
        build({ officerOf: false }).service.open(
          officer,
          PROJECT,
          openDto as never,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        build({ officerOf: false }).service.open(actor(Role.ADMIN), PROJECT, {
          ...openDto,
          photoIds: [],
        } as never),
      ).resolves.toBeDefined();
    });

    it.each([
      ['no cover yet', { cover: null }, 'NO_COVERAGE'],
      [
        'an event in another district',
        { event: { districtCode: 'DHAKA' } },
        'REGION_MISMATCH',
      ],
      [
        'an event the cover excludes',
        { event: { eventTypeCode: 'HAIL' } },
        'EVENT_NOT_COVERED',
      ],
      [
        'a second claim for the same event',
        { claim: { status: ClaimStatus.APPROVED } },
        'ALREADY_CLAIMED',
      ],
    ])('refuses %s', async (_label, opts, code) => {
      const err = await build(opts as never)
        .service.open(officer, PROJECT, openDto as never)
        .catch((e: ConflictException) => e.getResponse());
      expect(err).toMatchObject({ code });
    });

    it('refuses an unrecorded event, zero damage, and photos the officer did not take', async () => {
      await expect(
        build({ event: { status: 'submitted' } }).service.open(
          officer,
          PROJECT,
          openDto as never,
        ),
      ).rejects.toThrow('eventId must be a recorded weather event');
      await expect(
        build().service.open(officer, PROJECT, {
          ...openDto,
          damagePercent: '0',
        } as never),
      ).rejects.toThrow('damagePercent must be above 0');
      await expect(
        build().service.open(officer, PROJECT, {
          ...openDto,
          photoIds: ['ins'],
        } as never),
      ).rejects.toThrow('Photo ins must be one you uploaded');
    });

    it('replaces an attempt that never reached the ledger, and removes one the ledger refuses', async () => {
      const retry = build({ claim: { status: ClaimStatus.SUBMITTED } });
      const stale = retry.claims[0].id;
      await retry.service.open(officer, PROJECT, openDto as never);
      expect(retry.claims.map((c) => c.id)).not.toContain(stale);
      expect(retry.claims).toHaveLength(1);

      const refused = build();
      refused.chain.fail(revert('EventNotCovered'));
      await expect(
        refused.service.open(officer, PROJECT, openDto as never),
      ).rejects.toThrow();
      expect(refused.claims).toEqual([]);
    });
  });

  describe('deciding', () => {
    it('only the project’s insurer reviews, and only once review has started', async () => {
      const triggered = build({ claim: {} });
      const id = triggered.claims[0].id;
      await expect(
        triggered.service.approve(actor(Role.INSURER), id, {
          amount: '1',
          notes: 'x',
        } as never),
      ).rejects.toThrow(ForbiddenException);
      const err = await triggered.service
        .approve(insurer, id, { amount: '1', notes: 'x' } as never)
        .catch((e: ConflictException) => e.getResponse());
      expect(err).toMatchObject({ code: 'REVIEW_NOT_STARTED' });
      await triggered.service.startReview(insurer, id);
      expect(triggered.chain.methods()).toEqual(['startReview']);
    });

    it('approves within the cover still remaining, with a fingerprinted assessment', async () => {
      const { service, claims, chain } = build({
        claim: { status: ClaimStatus.UNDER_REVIEW },
        approved: 4_000_000n,
      });
      const c = claims[0];
      await expect(
        service.approve(insurer, c.id, {
          amount: '60000.01',
          notes: 'x',
        } as never),
      ).rejects.toThrow(ConflictException);
      await service.approve(insurer, c.id, {
        amount: '60000',
        notes: 'Confirmed on site',
        damagePercent: 35,
        photoId: 'ins',
      } as never);
      const hash = assessmentFingerprint({
        claimId: c.id,
        decision: 'approved',
        approvedAmount: 6_000_000n,
        damagePercent: '35.0',
        notes: 'Confirmed on site',
        photoHash: photoHash('cd'.repeat(32)),
      });
      expect(c.assessmentHash).toBe(hash);
      expect(chain.sent[0]).toMatchObject({
        method: 'approveClaim',
        args: [uuidToBytes32(c.id), 6_000_000n, hash],
      });
    });

    it('clears the saved assessment when the ledger refuses the decision', async () => {
      const { service, claims, chain } = build({
        claim: { status: ClaimStatus.UNDER_REVIEW },
      });
      chain.fail(revert('WrongClaimStatus'));
      await expect(
        service.reject(insurer, claims[0].id, {
          notes: 'Not weather damage',
        } as never),
      ).rejects.toThrow();
      expect(claims[0]).toMatchObject({
        assessmentHash: null,
        assessmentNotes: null,
      });
    });

    it('refuses a decision when the claim changed meanwhile', async () => {
      const { service, claims, repo } = build({
        claim: { status: ClaimStatus.UNDER_REVIEW },
      });
      repo.update.mockResolvedValueOnce({ affected: 0 });
      await expect(
        service.reject(insurer, claims[0].id, { notes: 'x' } as never),
      ).rejects.toThrow('The claim changed meanwhile; try again');
    });

    it('hides claims that never reached the ledger', async () => {
      const { service, claims } = build({
        claim: { status: ClaimStatus.SUBMITTED },
      });
      await expect(service.startReview(insurer, claims[0].id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  it('shows the assessment only once the claim is decided', async () => {
    const { service, claims } = build({
      claim: { status: ClaimStatus.UNDER_REVIEW, assessmentNotes: 'in flight' },
    });
    const pending = await service.findOne(insurer, claims[0].id);
    expect(pending.assessment).toBeNull();
    claims[0].status = ClaimStatus.REJECTED;
    const decided = await service.findOne(insurer, claims[0].id);
    expect(decided.assessment).toMatchObject({ notes: 'in flight' });
  });

  it('caps the photos on a claim', async () => {
    await expect(
      build().service.open(officer, PROJECT, {
        ...openDto,
        photoIds: Array.from({ length: 11 }, () => 'mine'),
      } as never),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  describe('the insurer’s payment', () => {
    const accounts = actor(Role.ACCOUNTS);

    it('records an approved claim as paid, the reference encrypted and hashed', async () => {
      const { service, claims, chain, builders } = build({
        claim: { status: ClaimStatus.APPROVED, approvedAmount: 6_000_000n },
      });
      const id = claims[0].id;
      await service.recordPayment(accounts, id, ' TRX 991 ');
      const hash = hashPaymentRef('TRX 991', SECRET);
      const set = builders
        .flatMap((b) => b.calls)
        .find(([m]) => m === 'set')?.[1];
      expect(set).toEqual({
        paymentRefEnc: `enc[insurance_claims.payment_ref:${id}]TRX 991`,
        paymentRefHash: hash,
        paidById: accounts.id,
      });
      expect(chain.sent[0]).toMatchObject({
        method: 'recordClaimPayment',
        args: [uuidToBytes32(id), hash],
      });
    });

    it('pays only an approved claim, and clears the reference the ledger refuses', async () => {
      const open = build({ claim: { status: ClaimStatus.UNDER_REVIEW } });
      const err = await open.service
        .recordPayment(accounts, open.claims[0].id, 'TRX 1')
        .catch((e: ConflictException) => e.getResponse());
      expect(err).toMatchObject({ code: 'CLAIM_WRONG_STATUS' });

      const refused = build({ claim: { status: ClaimStatus.APPROVED } });
      Object.assign(refused.claims[0], {
        paymentRefHash: hashPaymentRef('TRX 2', SECRET),
        paymentRefEnc: 'x',
      });
      refused.chain.fail(revert('PaymentRefUsed'));
      await expect(
        refused.service.recordPayment(accounts, refused.claims[0].id, 'TRX 2'),
      ).rejects.toThrow();
      expect(refused.claims[0]).toMatchObject({
        paymentRefHash: null,
        paymentRefEnc: null,
      });
    });

    it('shows the reference to Accounts, admins and auditors only', async () => {
      const { service, claims } = build({
        claim: {
          status: ClaimStatus.PAID,
          approvedAmount: 6_000_000n,
          paidAt: new Date(),
        },
      });
      claims[0].paymentRefEnc = `enc[insurance_claims.payment_ref:${claims[0].id}]TRX 7`;
      const seen = await service.findOne(accounts, claims[0].id);
      expect(seen.paymentReference).toBe('TRX 7');
      const hidden = await service.findOne(insurer, claims[0].id);
      expect(hidden.paymentReference).toBeNull();
    });
  });
});
