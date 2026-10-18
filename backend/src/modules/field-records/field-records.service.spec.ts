import { randomUUID } from 'node:crypto';
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
import type { FieldRecord } from './entities/field-record.entity';
import type { Photo } from './entities/photo.entity';
import {
  FieldRecordsService,
  recordFingerprint,
} from './field-records.service';
import { photoHash } from './photos.service';

const NOW = new Date('2026-10-14T06:00:00Z');
const PROJECT = randomUUID();
const FARMER = randomUUID();

describe('FieldRecordsService', () => {
  const officer = actor(Role.FIELD_OFFICER);

  const build = (
    opts: {
      stage?: ProjectStage;
      officerOfFarmer?: string;
      onLedger?: boolean;
      photo?: Partial<Photo> | null;
    } = {},
  ) => {
    const rows: FieldRecord[] = [];
    const records = fakeRepo({
      findOneBy: jest.fn(({ id }: { id: string }) =>
        Promise.resolve(rows.find((r) => r.id === id) ?? null),
      ),
      findOne: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
      ),
      insert: jest.fn(
        (r: FieldRecord) => (rows.push({ ...r }), Promise.resolve({})),
      ),
      delete: jest.fn((where: Record<string, unknown>) => {
        const i = rows.findIndex((r) => matchesWhere(r as never, where));
        if (i >= 0) rows.splice(i, 1);
        return Promise.resolve({ affected: i >= 0 ? 1 : 0 });
      }),
      find: jest.fn(() => Promise.resolve([])),
    });
    const project = {
      id: PROJECT,
      farmerId: FARMER,
      stage: opts.stage ?? ProjectStage.ACTIVE,
    } as Project;
    const users = fakeRepo({
      findOne: jest.fn(() =>
        Promise.resolve({
          id: FARMER,
          fieldOfficerId: opts.officerOfFarmer ?? officer.id,
        }),
      ),
      exists: jest.fn(() => Promise.resolve(false)),
    });
    const photo =
      opts.photo === null
        ? null
        : ({
            id: 'ph1',
            sha256: 'ab'.repeat(32),
            uploadedById: officer.id,
            ...opts.photo,
          } as Photo);
    const photos = {
      find: jest.fn(() =>
        photo ? Promise.resolve(photo) : Promise.reject(new Error('none')),
      ),
      hashOnDisk: jest.fn(() => Promise.resolve(photo?.sha256 ?? null)),
    };
    const chain = fakeTx();
    // Recording on the ledger marks the stored record as recorded.
    const receipts = {
      apply: jest.fn(() => {
        rows.forEach((r) => (r.status = 'recorded'));
        return Promise.resolve();
      }),
    };
    const ledger = {
      verifyEntry: jest.fn(() => Promise.resolve(opts.onLedger ?? false)),
      getEntry: jest.fn(),
    };
    const catalog = fakeCatalog({
      fieldRecordTypes: [
        {
          code: 'SOWING',
          name: 'Sowing',
          requiresPhoto: true,
          requiresLocation: true,
          measurements: [],
        },
        {
          code: 'NOTE',
          name: 'Note',
          requiresPhoto: false,
          requiresLocation: false,
          measurements: [],
        },
      ],
    });
    const service = new FieldRecordsService(
      records as never,
      users as never,
      fakeRepo({ findOneBy: jest.fn(() => Promise.resolve(project)) }) as never,
      catalog as never,
      photos as never,
      { visible: jest.fn(() => Promise.resolve(project)) } as never,
      { names: () => Promise.resolve(new Map()) } as never,
      chain.tx as never,
      receipts as never,
      { get: () => ledger } as never,
      fakeClock(NOW) as never,
    );
    return { service, rows, records, chain, ledger, photos };
  };

  const draft = (
    over: Record<string, unknown> = {},
  ): Record<string, unknown> & { id: string } => ({
    id: randomUUID(),
    projectId: PROJECT,
    entryTypeCode: 'SOWING',
    latitude: '24.846512',
    longitude: '89.377645',
    photoId: 'ph1',
    observedAt: '2026-10-14T05:00:00.900Z',
    ...over,
  });

  it('stores the record as submitted, sends its fingerprints, and reports it recorded', async () => {
    const { service, rows, chain } = build();
    const d = draft();
    const [res] = await service.sync(officer, [d] as never);
    expect(res).toMatchObject({ id: d.id, outcome: 'recorded' });
    const stored = rows[0];
    expect(stored.observedAt).toEqual(new Date('2026-10-14T05:00:00Z')); // whole seconds
    expect(stored.dataHash).toBe(recordFingerprint(stored));
    expect(stored.photoHash).toBe(photoHash('ab'.repeat(32)));
    expect(chain.sent[0]).toMatchObject({
      signer: officer.keyIndex,
      contract: 'FieldRecordLog',
      method: 'addEntry',
    });
  });

  it('answers a resent record "already recorded" without sending it again', async () => {
    const { service, chain } = build();
    const d = draft();
    await service.sync(officer, [d] as never);
    const [again] = await service.sync(officer, [d] as never);
    expect(again.outcome).toBe('already_recorded');
    expect(chain.sent).toHaveLength(1);
  });

  it('refuses the same id with different content', async () => {
    const { service } = build();
    const d = draft();
    await service.sync(officer, [d] as never);
    const [res] = await service.sync(officer, [
      { ...d, notes: 'changed' },
    ] as never);
    expect(res).toMatchObject({ outcome: 'rejected', code: 'ENTRY_ID_REUSED' });
  });

  it('sends a correction after its original, in the same batch', async () => {
    const { service, chain } = build();
    const original = draft();
    const fix = draft({ correctsEntryId: original.id });
    const res = await service.sync(officer, [fix, original] as never);
    expect(res.map((r) => r.outcome)).toEqual(['recorded', 'recorded']);
    expect(
      chain.sent.map((c) => (c.args[0] as { entryId: string }).entryId),
    ).toHaveLength(2);
    // The original went in the first wave.
    expect(chain.sent[0].args[0]).toMatchObject({
      correctsEntryId: '0x' + '0'.repeat(64),
    });
  });

  it('rejects a repeated id and corrections that refer to each other in a circle', async () => {
    const { service } = build();
    const a = draft();
    const b = draft({ correctsEntryId: a.id });
    a.correctsEntryId = b.id;
    const dup = draft();
    const res = await service.sync(officer, [a, b, dup, dup] as never);
    expect(res.map((r) => r.code ?? r.outcome)).toEqual([
      'CORRECTION_CYCLE',
      'CORRECTION_CYCLE',
      'recorded',
      'DUPLICATE_IN_BATCH',
    ]);
  });

  it('lists every problem with a draft at once', async () => {
    const { service, chain } = build({
      photo: { uploadedById: 'someone-else' },
    });
    const [res] = await service.sync(officer, [
      draft({ longitude: undefined, observedAt: '2026-10-15T00:00:00Z' }),
    ] as never);
    expect(res).toMatchObject({ outcome: 'rejected', code: 'INVALID_RECORD' });
    expect(res.message).toContain(
      'Give both latitude and longitude, or neither',
    );
    expect(res.message).toContain('photoId must be a photo you uploaded');
    expect(res.message).toContain(
      "observedAt is in the future: check the phone's clock",
    );
    expect(chain.sent).toEqual([]);
  });

  it('needs the photo and location the record type asks for', async () => {
    const { service } = build();
    const [res] = await service.sync(officer, [
      draft({ photoId: undefined, latitude: undefined, longitude: undefined }),
    ] as never);
    expect(res.message).toContain('A sowing needs the location');
    expect(res.message).toContain('A sowing needs a photo');
    const [note] = await service.sync(officer, [
      draft({
        entryTypeCode: 'NOTE',
        photoId: undefined,
        latitude: undefined,
        longitude: undefined,
      }),
    ] as never);
    expect(note.outcome).toBe('recorded');
  });

  it('only takes updates from the farmer’s own officer, while the project is running', async () => {
    const [notMine] = await build({
      officerOfFarmer: randomUUID(),
    }).service.sync(officer, [draft()] as never);
    expect(notMine.code).toBe('NOT_FARMERS_OFFICER');
    const [tooEarly] = await build({
      stage: ProjectStage.OPEN_FOR_FUNDING,
    }).service.sync(officer, [draft()] as never);
    expect(tooEarly.code).toBe('FARM_UPDATE_WRONG_STAGE');
  });

  it('removes a record the ledger refuses', async () => {
    const { service, rows, chain } = build();
    chain.fail(revert('ProjectNotRunning'));
    const [res] = await service.sync(officer, [draft()] as never);
    expect(res).toMatchObject({
      outcome: 'rejected',
      code: 'ProjectNotRunning',
    });
    expect(rows).toEqual([]);
  });

  it('treats "entry exists" as recorded when the ledger holds exactly this record', async () => {
    const { service, chain } = build({ onLedger: true });
    chain.fail(revert('EntryExists'));
    const [res] = await service.sync(officer, [draft()] as never);
    expect(res.outcome).toBe('already_recorded');
  });

  it('keeps the draft pending when the node fails, so the phone resends it', async () => {
    const { service, rows, chain } = build();
    chain.fail(new Error('timeout'));
    const [res] = await service.sync(officer, [draft()] as never);
    expect(res).toMatchObject({ outcome: 'pending', code: 'NOT_CONFIRMED' });
    expect(rows[0].status).toBe('submitted');
  });

  describe('verifying a record against the ledger', () => {
    const recorded = async (opts: Parameters<typeof build>[0] = {}) => {
      const w = build(opts);
      await w.service.sync(officer, [draft()] as never);
      const r = w.rows[0];
      w.ledger.getEntry.mockResolvedValue({
        recordedAt: 1n,
        dataHash: r.dataHash,
        photoHash: r.photoHash,
      });
      return { ...w, r };
    };

    it('matches when data and photo still produce the ledger’s fingerprints', async () => {
      const { service, r } = await recorded();
      await expect(service.verify(r.id)).resolves.toMatchObject({
        matches: true,
        mismatches: [],
      });
    });

    it('finds edited data, a replaced photo and a missing photo file', async () => {
      const { service, r, photos } = await recorded();
      r.notes = 'edited later';
      photos.hashOnDisk.mockResolvedValueOnce('cd'.repeat(32));
      await expect(service.verify(r.id)).resolves.toMatchObject({
        mismatches: ['data', 'photo'],
      });
      r.notes = null;
      photos.hashOnDisk.mockResolvedValueOnce(null);
      await expect(service.verify(r.id)).resolves.toMatchObject({
        mismatches: ['photoMissing'],
      });
    });
  });

  it('rounds the location for people outside staff, the farmer and their officer', async () => {
    const { service, rows } = build();
    await service.sync(officer, [draft()] as never);
    const seen = await service.findOne(actor(Role.INVESTOR), rows[0].id);
    expect(seen.location).toMatchObject({ exact: false, accuracyMeters: null });
    expect(seen.location!.latitude).not.toBe('24.846512');
    const staff = await service.findOne(actor(Role.ADMIN), rows[0].id);
    expect(staff.location).toMatchObject({
      exact: true,
      latitude: '24.846512',
    });
  });
});
