// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogDto } from '@/api/generated/catalog';
import type { FieldRecordDto } from '@/api/generated/field-records';
import { drafts } from '@/lib/drafts';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
import {
  draftProblems,
  type FarmUpdateData,
  type FarmUpdateDraft,
  measurementProblem,
  toSyncRecord,
} from './draft';
import { DraftsPage } from './drafts-page';
import { NewUpdatePage } from './new-update-page';
import { fitScale } from './photo';
import { fromLocalInput, parseNewUpdateSearch, toLocalInput } from './search';
import { sendDrafts } from './sender';
import { toAccuracy, toDegrees } from './use-location';

const PROJECT = '11111111-1111-4111-8111-111111111111';

const growth = {
  code: 'GROWTH_CHECK',
  name: 'Growth Check',
  nameBn: 'বৃদ্ধি পর্যবেক্ষণ',
  active: true,
  sortOrder: 0,
  requiresPhoto: true,
  requiresLocation: true,
  measurements: [
    {
      key: 'plant_height',
      label: 'Plant Height',
      labelBn: 'গাছের উচ্চতা',
      unit: 'cm',
      min: 0,
      max: 1000,
      decimals: 0,
      required: true,
    },
    {
      key: 'crop_cover',
      label: 'Crop Cover',
      labelBn: 'ফসলের আচ্ছাদন',
      unit: '%',
      min: 0,
      max: 100,
      decimals: 0,
      required: false,
    },
  ],
};

const catalog: CatalogDto = {
  version: '1',
  units: [],
  produceTypes: [],
  inputTypes: [],
  fieldRecordTypes: [growth],
  weatherEventTypes: [],
  districts: [],
};

const data = (over: Partial<FarmUpdateData> = {}): FarmUpdateData => ({
  projectId: PROJECT,
  projectTitle: 'Maize in Bogura',
  farmerName: 'Rahim Uddin',
  entryTypeCode: 'GROWTH_CHECK',
  measurements: { plant_height: '৪২', crop_cover: '' },
  notes: '  Leaves healthy  ',
  location: {
    latitude: '24.846512',
    longitude: '89.377621',
    accuracyMeters: 6,
  },
  observedAt: '2026-10-20T03:30:00.000Z',
  correctsEntryId: null,
  correcting: null,
  photoId: null,
  ...over,
});

const save = (over: Partial<FarmUpdateDraft> = {}, owner = 'me') =>
  drafts.save<FarmUpdateData>({
    id: crypto.randomUUID(),
    ownerId: owner,
    kind: 'farm-update',
    data: data(),
    photos: [new Blob(['jpeg-bytes'], { type: 'image/jpeg' })],
    rejection: null,
    ...over,
  });

async function clearDrafts() {
  for (const owner of ['me', 'other']) {
    for (const d of await drafts.list(owner)) await drafts.remove(d.id);
  }
}

beforeEach(async () => {
  await clearDrafts();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * jsdom's FormData refuses the Blobs fake-indexeddb gives back (another
 * realm's); browsers do not. The fields are kept for the assertions.
 */
class TestForm {
  fields: [string, unknown][] = [];
  append(name: string, value: unknown) {
    this.fields.push([name, value]);
  }
}
beforeEach(() => {
  vi.stubGlobal('FormData', TestForm);
});

describe('farm update drafts', () => {
  it('sends readings in plain digits, without empty ones, with the location', () => {
    const id = crypto.randomUUID();
    const record = toSyncRecord({
      id,
      ownerId: 'me',
      kind: 'farm-update',
      data: data({ photoId: 'p1' }),
      photos: [],
      createdAt: 0,
      updatedAt: 0,
      rejection: null,
    });
    expect(record).toEqual({
      id,
      projectId: PROJECT,
      entryTypeCode: 'GROWTH_CHECK',
      notes: 'Leaves healthy',
      measurements: { plant_height: '42' },
      latitude: '24.846512',
      longitude: '89.377621',
      accuracyMeters: 6,
      photoId: 'p1',
      correctsEntryId: undefined,
      observedAt: '2026-10-20T03:30:00.000Z',
    });
  });

  it('checks readings, the photo, the location and the time on the phone', () => {
    const m = growth.measurements[0]!;
    expect(measurementProblem(m, '')).toEqual({ kind: 'required' });
    expect(measurementProblem(m, 'tall')).toEqual({ kind: 'number' });
    expect(measurementProblem(m, '4.5')).toEqual({
      kind: 'decimals',
      decimals: 0,
    });
    expect(measurementProblem(m, '1001')).toEqual({ kind: 'max', max: 1000 });
    expect(measurementProblem(m, '-1')).toEqual({ kind: 'min', min: 0 });
    expect(measurementProblem(m, '১২০')).toBeNull();
    expect(measurementProblem(growth.measurements[1]!, '')).toBeNull();

    const now = Date.parse('2026-10-20T04:00:00.000Z');
    const ok = draftProblems(data(), growth, true, now);
    expect(Object.values(ok).filter((v) => v === true)).toEqual([]);
    const bad = draftProblems(
      data({
        location: null,
        observedAt: '2026-10-21T00:00:00.000Z',
        measurements: {},
      }),
      growth,
      false,
      now,
    );
    expect(bad).toMatchObject({
      photo: true,
      location: true,
      observedAt: true,
    });
    expect(bad.measurements.plant_height).toEqual({ kind: 'required' });
  });

  it('shrinks photos to 1600 px at most, never enlarging; rounds GPS as the server keeps it', () => {
    expect(fitScale(4000, 3000)).toBe(0.4);
    expect(fitScale(1200, 900)).toBe(1);
    expect(toDegrees(24.84651234)).toBe('24.846512');
    expect(toAccuracy(6.4)).toBe(6);
    expect(toAccuracy(null)).toBeNull();
  });

  it('opens the form from the address and keeps times in the phone’s zone', () => {
    const id = crypto.randomUUID();
    expect(parseNewUpdateSearch({ draft: id, project: PROJECT })).toEqual({
      draft: id,
    });
    expect(parseNewUpdateSearch({ corrects: 'not-an-id' })).toEqual({});
    const iso = '2026-10-20T03:30:00.000Z';
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });
});

describe('sending drafts', () => {
  it('uploads each photo once and settles every draft by its outcome', async () => {
    await signedInAs('field_officer');
    const [a, b, c] = [await save(), await save(), await save()];
    await save({}, 'other'); // someone else's on this phone: never sent
    let photos = 0;
    const sent = fakeServer(({ method, url, body }) => {
      if (method === 'POST' && url.pathname === '/api/photos') {
        photos++;
        return {
          status: 201,
          body: {
            data: {
              id: `photo-${photos}`,
              mimeType: 'image/jpeg',
              sizeBytes: 10,
              photoHash: '0x1',
            },
          },
        };
      }
      if (url.pathname === '/api/field-records/sync') {
        const ids = (body as { records: { id: string }[] }).records.map(
          (r) => r.id,
        );
        return {
          body: {
            data: ids.map((id) =>
              id === a.id
                ? { id, outcome: 'recorded' }
                : id === b.id
                  ? {
                      id,
                      outcome: 'rejected',
                      code: 'NOT_FARMERS_OFFICER',
                      message:
                        'Only the farmer’s own field officer records farm updates',
                    }
                  : { id, outcome: 'pending' },
            ),
          },
        };
      }
      return undefined;
    });
    const summary = await sendDrafts('me');
    expect(summary).toEqual({
      sent: 1,
      rejected: 1,
      waiting: 1,
      offline: false,
    });
    expect(photos).toBe(3);
    expect(await drafts.get(a.id)).toBeUndefined();
    expect((await drafts.get(b.id))?.rejection?.code).toBe(
      'NOT_FARMERS_OFFICER',
    );
    const waiting = await drafts.get<FarmUpdateData>(c.id);
    expect(waiting?.data.photoId).toBe('photo-3');
    expect(waiting?.photos).toHaveLength(1);

    // Next time: the waiting one goes again without uploading its photo again.
    const again = await sendDrafts('me');
    expect(again.waiting).toBe(1);
    expect(photos).toBe(3);
    const syncs = sent.filter(
      (s) => s.url.pathname === '/api/field-records/sync',
    );
    expect((syncs.at(-1)!.body as { records: unknown[] }).records).toHaveLength(
      1,
    );
  });

  it('marks only the faulty draft when the server refuses a whole batch', async () => {
    await signedInAs('field_officer');
    const good = await save({ data: data({ photoId: 'p1' }), photos: [] });
    const bad = await save({
      data: data({ photoId: 'p2', notes: 'x'.repeat(2001) }),
      photos: [],
    });
    fakeServer(({ url, body }) => {
      if (url.pathname !== '/api/field-records/sync') return undefined;
      const records = (body as { records: { id: string; notes?: string }[] })
        .records;
      if (records.some((r) => (r.notes ?? '').length > 2000)) {
        return {
          status: 400,
          body: {
            statusCode: 400,
            message: 'Invalid input',
            code: 'INVALID_INPUT',
            details: { fields: [] },
          },
        };
      }
      return {
        body: { data: records.map((r) => ({ id: r.id, outcome: 'recorded' })) },
      };
    });
    expect(await sendDrafts('me')).toMatchObject({ sent: 1, rejected: 1 });
    expect(await drafts.get(good.id)).toBeUndefined();
    expect((await drafts.get(bad.id))?.rejection?.code).toBe('INVALID_INPUT');
  });

  it('keeps everything when there is no connection', async () => {
    await signedInAs('field_officer');
    const d = await save();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    expect(await sendDrafts('me')).toMatchObject({ sent: 0, offline: true });
    const kept = await drafts.get(d.id);
    expect(kept?.rejection).toBeNull();
    expect(kept?.data).toEqual(d.data);
  });
});

describe('the five steps', () => {
  const myProjects = {
    data: [
      {
        id: PROJECT,
        title: 'Maize in Bogura',
        stage: 'active',
        farmer: { id: 'f1', name: 'Rahim Uddin' },
        location: 'Shibganj',
        district: 'Bogura',
        produceName: 'Maize',
        produceNameBn: 'ভুট্টা',
      },
    ],
  };

  beforeEach(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: {
              latitude: 24.8465123,
              longitude: 89.3776209,
              accuracy: 6.4,
            },
          } as GeolocationPosition),
      },
    });
    Object.assign(URL, {
      createObjectURL: () => 'blob:photo',
      revokeObjectURL: () => undefined,
    });
  });

  it('takes an officer from project to a sent update, and keeps the project list for offline', async () => {
    await signedInAs('field_officer');
    const sent = fakeServer(({ method, url, body }) => {
      if (url.pathname === '/api/catalog') return { body: { data: catalog } };
      if (url.pathname === '/api/field-records/my-projects')
        return { body: myProjects };
      if (method === 'POST' && url.pathname === '/api/photos') {
        return {
          status: 201,
          body: {
            data: {
              id: 'photo-1',
              mimeType: 'image/jpeg',
              sizeBytes: 10,
              photoHash: '0x1',
            },
          },
        };
      }
      if (url.pathname === '/api/field-records/sync') {
        const ids = (body as { records: { id: string }[] }).records.map(
          (r) => r.id,
        );
        return {
          body: { data: ids.map((id) => ({ id, outcome: 'recorded' })) },
        };
      }
      return undefined;
    });
    const { router } = await renderPage(
      <NewUpdatePage search={{}} />,
      '/farm-updates',
    );
    const user = userEvent.setup();

    // 1. Project
    await user.click(
      await screen.findByRole('radio', { name: /Maize in Bogura/ }),
    );
    await user.click(screen.getByRole('button', { name: /Next/ }));
    // 2. Type
    await user.click(
      await screen.findByRole('radio', { name: /Growth Check/ }),
    );
    await user.click(screen.getByRole('button', { name: /Next/ }));
    // 3. Photo: needed for this type
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText('Take a photo for this update.')).toBeTruthy();
    const camera = document.querySelector<HTMLInputElement>('input[capture]')!;
    await user.upload(
      camera,
      new File(['jpeg-bytes'], 'leaf.jpg', { type: 'image/jpeg' }),
    );
    await screen.findByAltText('Photo of the field');
    await user.click(screen.getByRole('button', { name: /Next/ }));
    // 4. Details: the required reading, Bengali digits allowed
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText('Enter this reading.')).toBeTruthy();
    await user.type(screen.getByLabelText(/Plant Height/), '৪২');
    expect(screen.getByText('24.846512, 89.377621')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Next/ }));
    // 5. Review and save
    expect(screen.getByText('Maize in Bogura · Rahim Uddin')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Save and Send/ }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/farm-updates/sent'),
    );
    const sync = sent.find(
      (s) => s.url.pathname === '/api/field-records/sync',
    )!;
    const record = (sync.body as { records: Record<string, unknown>[] })
      .records[0]!;
    expect(record).toMatchObject({
      projectId: PROJECT,
      entryTypeCode: 'GROWTH_CHECK',
      measurements: { plant_height: '42' },
      latitude: '24.846512',
      longitude: '89.377621',
      accuracyMeters: 6,
      photoId: 'photo-1',
    });
    expect(await drafts.list('me')).toEqual([]);

    // Later, without internet: the projects are still there to choose.
    cleanup();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    fakeServer(({ url }) =>
      url.pathname === '/api/catalog' ? { body: { data: catalog } } : undefined,
    );
    await renderPage(<NewUpdatePage search={{}} />, '/farm-updates');
    expect(
      await screen.findByRole('radio', { name: /Maize in Bogura/ }),
    ).toBeTruthy();
    expect(screen.getByText(/List saved on this phone/)).toBeTruthy();
    vi.restoreAllMocks();
  });

  it('opens a record as a correction of it, on the same project', async () => {
    await signedInAs('field_officer');
    const original: FieldRecordDto = {
      id: '22222222-2222-4222-8222-222222222222',
      projectId: PROJECT,
      projectTitle: 'Maize in Bogura',
      farmer: { id: 'f1', name: 'Rahim Uddin' },
      entryTypeCode: 'GROWTH_CHECK',
      entryTypeName: 'Growth Check',
      entryTypeNameBn: 'বৃদ্ধি পর্যবেক্ষণ',
      notes: 'Typo here',
      measurements: [
        {
          key: 'plant_height',
          label: 'Plant Height',
          labelBn: 'গাছের উচ্চতা',
          unit: 'cm',
          value: '420',
        },
      ],
      location: {
        latitude: '24.846512',
        longitude: '89.377621',
        accuracyMeters: 6,
        exact: true,
      },
      photo: {
        id: 'photo-9',
        url: '/api/field-records/2222/photo',
        photoHash: '0x9',
      },
      correctsEntryId: null,
      correctedBy: [],
      recordedBy: { id: 'me', name: 'Demo Field Officer' },
      observedAt: '2026-10-19T03:00:00.000Z',
      recordedAt: '2026-10-19T03:01:00.000Z',
      status: 'recorded',
      dataHash: '0x1',
      txHash: '0x2',
    };
    fakeServer(({ url }) => {
      if (url.pathname === '/api/catalog') return { body: { data: catalog } };
      if (url.pathname === `/api/field-records/${original.id}`)
        return { body: { data: original } };
      if (url.pathname === '/api/field-records/my-projects')
        return { body: myProjects };
      return undefined;
    });
    await renderPage(
      <NewUpdatePage search={{ corrects: original.id }} />,
      '/farm-updates',
    );
    expect(await screen.findByText(/Correcting the Growth Check/)).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Next/ })); // type kept
    expect(screen.getByText('The original photo is kept.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Next/ }));
    const height = screen.getByLabelText(/Plant Height/) as HTMLInputElement;
    expect(height.value).toBe('420');
    await user.clear(height);
    await user.type(height, '42');
    await user.click(screen.getByRole('button', { name: /Next/ }));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    await user.click(
      screen.getByRole('button', { name: /Save on This Phone/ }),
    );
    await waitFor(async () => expect(await drafts.list('me')).toHaveLength(1));
    const [d] = await drafts.list<FarmUpdateData>('me');
    expect(d!.data).toMatchObject({
      correctsEntryId: original.id,
      photoId: 'photo-9',
      measurements: { plant_height: '42' },
    });
    vi.restoreAllMocks();
  });
});

describe('drafts on this phone', () => {
  it('shows why a draft was refused, and lets the officer fix or delete it', async () => {
    await signedInAs('field_officer');
    await save({
      rejection: {
        code: 'INVALID_RECORD',
        message: 'The record is not valid',
        details: {
          problems: [
            {
              code: 'PHOTO_REQUIRED',
              message: 'A growth check needs a photo',
              details: {
                recordType: 'Growth Check',
                recordTypeBn: 'বৃদ্ধি পর্যবেক্ষণ',
              },
            },
          ],
        },
      },
    });
    await save();
    fakeServer(({ url }) =>
      url.pathname === '/api/catalog' ? { body: { data: catalog } } : undefined,
    );
    await renderPage(<DraftsPage />, '/farm-updates/drafts');
    expect(await screen.findByText(/1 update waiting to be sent/)).toBeTruthy();
    expect(screen.getByText(/1 to fix/)).toBeTruthy();
    const cards = await screen.findAllByRole('article');
    const refused = cards.find(
      (c) => within(c).queryAllByText('Needs Fixing').length > 0,
    )!;
    expect(within(refused).getByRole('link', { name: /Fix/ })).toBeTruthy();
    await userEvent.click(
      within(refused).getByRole('button', { name: /Delete/ }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /Delete/,
      }),
    );
    await waitFor(async () => expect(await drafts.list('me')).toHaveLength(1));
  });
});
