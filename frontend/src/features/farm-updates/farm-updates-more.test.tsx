// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldRecordDto } from '@/api/generated/field-records';
import type { ProjectDto } from '@/api/generated/projects';
import type { Role } from '@/app/navigation';
import { deviceCache } from '@/lib/device-cache';
import { drafts } from '@/lib/drafts';
import { store } from '@/store/store';
import { project } from '@/test/fixtures';
import {
  fakeServer,
  type Reply,
  renderPage,
  type Sent,
  signedInAs,
} from '@/test/render';
import type { FarmUpdateData } from './draft';
import {
  useBackgroundSending,
  useObjectUrl,
  useOfficerProjects,
  useSendNow,
} from './hooks';
import { shrinkPhoto } from './photo';
import { ProjectFarmUpdates } from './project-farm-updates';
import { RecordCard } from './record-card';
import {
  fromLocalInput,
  parseNewUpdateSearch,
  parseUpdateListSearch,
  toLocalInput,
} from './search';
import { isSending, sendDrafts } from './sender';
import { SentPage } from './sent-page';
import { useCurrentLocation } from './use-location';
import { DraftsPage } from './drafts-page';
import { NewUpdatePage } from './new-update-page';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

class TestForm {
  fields: [string, unknown][] = [];
  append(name: string, value: unknown) {
    this.fields.push([name, value]);
  }
}

beforeEach(async () => {
  for (const d of await drafts.list('me')) await drafts.remove(d.id);
  localStorage.clear();
  vi.stubGlobal('FormData', TestForm);
  Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:photo'),
    revokeObjectURL: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const page = <T,>(data: T[], total = data.length) => ({
  data,
  meta: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) || 1 },
});
const failure = (status: number, code: string): Reply => ({
  status,
  body: { statusCode: status, code, message: code },
});

const record = (over: Partial<FieldRecordDto> = {}): FieldRecordDto => ({
  id: 'r1',
  projectId: PROJECT,
  projectTitle: 'Maize in Bogura',
  farmer: { id: 'f1', name: 'Rahim Uddin' },
  entryTypeCode: 'GROWTH_CHECK',
  entryTypeName: 'Growth Check',
  entryTypeNameBn: 'বৃদ্ধি পর্যবেক্ষণ',
  notes: 'Leaves healthy',
  measurements: [
    {
      key: 'plant_height',
      label: 'Plant Height',
      labelBn: 'গাছের উচ্চতা',
      unit: 'cm',
      value: '42',
    },
    {
      key: 'count',
      label: 'Plants',
      labelBn: 'গাছ',
      unit: null,
      value: '12',
    },
  ],
  location: {
    latitude: '24.846512',
    longitude: '89.377621',
    accuracyMeters: 6,
    exact: true,
  } as never,
  photo: { url: '/api/photos/ph1/file' } as never,
  correctsEntryId: null,
  correctedBy: [],
  recordedBy: { id: 'me', name: 'Officer Kamal' },
  observedAt: '2026-10-20T03:30:00.000Z',
  recordedAt: '2026-10-20T04:00:00.000Z',
  status: 'recorded',
  dataHash: '0x',
  ...over,
});

const draftData = (over: Partial<FarmUpdateData> = {}): FarmUpdateData => ({
  projectId: PROJECT,
  projectTitle: 'Maize in Bogura',
  farmerName: 'Rahim Uddin',
  entryTypeCode: 'GROWTH_CHECK',
  measurements: { plant_height: '42' },
  notes: '',
  location: null,
  observedAt: '2026-10-20T03:30:00.000Z',
  correctsEntryId: null,
  correcting: null,
  photoId: null,
  ...over,
});
const keep = (over: Partial<FarmUpdateData> = {}, photo = true) =>
  drafts.save<FarmUpdateData>({
    id: crypto.randomUUID(),
    ownerId: 'me',
    kind: 'farm-update',
    data: draftData(over),
    photos: photo ? [new Blob(['jpeg'], { type: 'image/jpeg' })] : [],
    rejection: null,
  });

describe('shrinking a photo', () => {
  function canvasGives(blob: Blob | null) {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) =>
      done(blob),
    );
    return drawImage;
  }

  it('redraws a big photo at 1600 px, keeping the smaller file', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4000, height: 3000, close })),
    );
    const drawImage = canvasGives(new Blob(['x']));
    const original = new Blob(['a much bigger photo']);
    const out = await shrinkPhoto(original);
    expect(out.size).toBe(1);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    expect(close).toHaveBeenCalled();
  });

  it('keeps the original when redrawing does not make it smaller, or fails', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 800, height: 600, close: () => {} })),
    );
    canvasGives(new Blob(['a bigger redraw than the file']));
    const original = new Blob(['small']);
    expect(await shrinkPhoto(original)).toBe(original);
    canvasGives(null);
    expect(await shrinkPhoto(original)).toBe(original);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('not an image');
      }),
    );
    expect(await shrinkPhoto(original)).toBe(original);
  });
});

describe('the farm update addresses', () => {
  it('opens a draft first, then a correction, then a project', () => {
    const upper = PROJECT.toUpperCase();
    expect(
      parseNewUpdateSearch({ draft: upper, corrects: OTHER, project: OTHER }),
    ).toEqual({ draft: PROJECT });
    expect(parseNewUpdateSearch({ corrects: OTHER, project: PROJECT })).toEqual(
      { corrects: OTHER },
    );
    expect(parseNewUpdateSearch({ project: PROJECT, draft: 'x' })).toEqual({
      project: PROJECT,
    });
    expect(parseNewUpdateSearch({ project: 7 })).toEqual({});
  });

  it('keeps a short search and a later page', () => {
    expect(parseUpdateListSearch({ q: ' maize ', page: '2' })).toEqual({
      q: 'maize',
      page: 2,
    });
    expect(parseUpdateListSearch({ q: ' ', page: '1' })).toEqual({});
    expect(parseUpdateListSearch({ q: 'x'.repeat(101) })).toEqual({});
  });

  it('leaves a time it cannot read empty', () => {
    expect(toLocalInput('not a time')).toBe('');
    expect(fromLocalInput('nonsense')).toBeNull();
  });
});

describe('finding where the phone is', () => {
  function geolocation(
    answer: (ok: PositionCallback, fail: PositionErrorCallback) => void,
  ) {
    const getCurrentPosition = vi.fn(answer);
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    });
    return getCurrentPosition;
  }
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'geolocation');
  });

  it('gives the spot rounded as the server keeps it, and asks again on retry', async () => {
    const ask = geolocation((ok) =>
      ok({
        coords: { latitude: 24.8465123, longitude: 89.3776211, accuracy: 5.6 },
      } as GeolocationPosition),
    );
    const { result } = renderHook(() => useCurrentLocation());
    await waitFor(() => expect(result.current.state.status).toBe('found'));
    expect(result.current.state).toEqual({
      status: 'found',
      location: {
        latitude: '24.846512',
        longitude: '89.377621',
        accuracyMeters: 6,
      },
    });
    act(() => result.current.retry());
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
  });

  it('says when location is refused or cannot be found', async () => {
    const denied = {
      code: 1,
      PERMISSION_DENIED: 1,
    } as GeolocationPositionError;
    geolocation((_ok, fail) => fail(denied));
    const one = renderHook(() => useCurrentLocation());
    await waitFor(() => expect(one.result.current.state.status).toBe('denied'));
    geolocation((_ok, fail) =>
      fail({ code: 2, PERMISSION_DENIED: 1 } as GeolocationPositionError),
    );
    const two = renderHook(() => useCurrentLocation());
    await waitFor(() =>
      expect(two.result.current.state.status).toBe('unavailable'),
    );
  });

  it('ignores an answer that comes after the form closed, and waits while off', async () => {
    let answer: PositionCallback = () => {};
    const ask = geolocation((ok) => {
      answer = ok;
    });
    const off = renderHook(() => useCurrentLocation(false));
    expect(ask).not.toHaveBeenCalled();
    off.unmount();
    const { result, unmount } = renderHook(() => useCurrentLocation());
    unmount();
    answer({
      coords: { latitude: 1, longitude: 2, accuracy: Number.NaN },
    } as GeolocationPosition);
    expect(result.current.state.status).toBe('locating');
  });

  it('says it is unavailable on a phone without location', () => {
    const { result } = renderHook(() => useCurrentLocation());
    expect(result.current.state.status).toBe('unavailable');
    act(() => result.current.retry());
    expect(result.current.state.status).toBe('unavailable');
  });
});

describe('the farm update hooks', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  it('shows a photo from the phone, releasing it when done', async () => {
    const photo: Blob | null = new Blob(['jpeg']);
    const revoke = vi.fn();
    Object.assign(URL, { revokeObjectURL: revoke });
    const { result, rerender, unmount } = renderHook(
      ({ blob }: { blob: Blob | null }) => useObjectUrl(blob),
      { initialProps: { blob: photo as Blob | null } },
    );
    await waitFor(() => expect(result.current).toBe('blob:photo'));
    rerender({ blob: null });
    expect(result.current).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:photo');
    // Gone before the address was made: none is made.
    const quick = renderHook(() => useObjectUrl(new Blob(['x'])));
    quick.unmount();
    unmount();
  });

  it('keeps the officer’s project list for offline, and shows the kept one', async () => {
    await signedInAs('field_officer');
    fakeServer((s) =>
      s.url.pathname === '/api/field-records/my-projects'
        ? {
            body: {
              data: [{ id: PROJECT, title: 'Maize', farmer: { name: 'R' } }],
            },
          }
        : undefined,
    );
    const live = renderHook(() => useOfficerProjects(), { wrapper });
    await waitFor(() => expect(live.result.current.projects).toHaveLength(1));
    expect(live.result.current.savedAt).toBeNull();
    expect(deviceCache.get('officerProjects', 'me')?.value).toHaveLength(1);
    live.unmount();

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const kept = renderHook(() => useOfficerProjects(), { wrapper });
    expect(kept.result.current.projects).toHaveLength(1);
    expect(kept.result.current.savedAt).toEqual(expect.any(Number));
    expect(kept.result.current.loading).toBe(false);
  });

  it('sends now for whoever is signed in, and nothing for nobody', async () => {
    await signedInAs('field_officer');
    fakeServer(() => undefined);
    const { result } = renderHook(() => useSendNow(), { wrapper });
    await expect(result.current.send()).resolves.toEqual({
      sent: 0,
      rejected: 0,
      waiting: 0,
      offline: false,
    });
    act(() => {
      store.dispatch({ type: 'session/sessionEnded', payload: 'signedOut' });
    });
    await expect(result.current.send()).resolves.toBeNull();
  });

  it('sends nothing in the background for others, and survives a failed run', async () => {
    await signedInAs('investor');
    await keep({ photoId: 'p' }, false);
    let sent = fakeServer(() => undefined);
    const other = renderHook(() => useBackgroundSending(), { wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toEqual([]);
    other.unmount();
    await signedInAs('field_officer');
    sent = fakeServer(() => ({ body: { data: null } }));
    const officer = renderHook(() => useBackgroundSending(), { wrapper });
    await waitFor(() => expect(sent).toHaveLength(1));
    officer.unmount();
  });

  it('sends a field officer’s drafts in the background, and again every two minutes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await signedInAs('field_officer');
      await keep({ photoId: 'already' }, false);
      const sent = fakeServer((s) =>
        s.url.pathname === '/api/field-records/sync'
          ? { body: { data: [{ id: 'x', outcome: 'pending' }] } }
          : undefined,
      );
      const { unmount } = renderHook(() => useBackgroundSending(), {
        wrapper,
      });
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      await vi.advanceTimersByTimeAsync(120_000);
      await vi.waitFor(() => expect(sent).toHaveLength(2));
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('sending drafts, further', () => {
  it('marks a draft whose photo is refused, and keeps going', async () => {
    const bad = await keep();
    const fine = await keep({ photoId: 'ok' }, false);
    fakeServer((s) => {
      if (s.url.pathname === '/api/photos')
        return {
          status: 422,
          body: { statusCode: 422, message: ['Not a', 'photo'] },
        };
      if (s.url.pathname === '/api/field-records/sync')
        return {
          body: {
            data: [
              { id: fine.id, outcome: 'pending' },
              { id: 'someone-else', outcome: 'recorded' },
            ],
          },
        };
      return undefined;
    });
    const summary = await sendDrafts('me');
    expect(summary).toEqual({
      sent: 0,
      rejected: 1,
      waiting: 1,
      offline: false,
    });
    const marked = (await drafts.list<FarmUpdateData>('me')).find(
      (d) => d.id === bad.id,
    )!;
    expect(marked.rejection).toEqual({
      code: 'PHOTO_INVALID',
      message: 'Not a photo',
      details: undefined,
    });
  });

  it('waits when the photo server is down, and runs once at a time', async () => {
    await keep();
    fakeServer(() => ({ status: 503, body: {} }));
    const first = sendDrafts('me');
    expect(isSending()).toBe(true);
    expect(sendDrafts('me')).toBe(first);
    expect(await first).toMatchObject({ offline: true, waiting: 1 });
    expect(isSending()).toBe(false);
  });

  it('marks a lone draft the server cannot read, by its reason or a default', async () => {
    const one = await keep({ photoId: 'p' }, false);
    fakeServer(() => ({ status: 400, body: 'not json' }));
    await sendDrafts('me');
    expect(
      (await drafts.list<FarmUpdateData>('me')).find((d) => d.id === one.id)!
        .rejection?.code,
    ).toBe('INVALID_INPUT');
  });

  it('sends more than fifty in batches, under the browser’s lock', async () => {
    for (let i = 0; i < 51; i++) await keep({ photoId: `p${i}` }, false);
    const request = vi.fn((_name: string, work: () => Promise<unknown>) =>
      work(),
    );
    Object.defineProperty(navigator, 'locks', {
      value: { request },
      configurable: true,
    });
    const sent = fakeServer((s) =>
      s.url.pathname === '/api/field-records/sync'
        ? {
            body: {
              data: (s.body as { records: { id: string }[] }).records.map(
                (r) => ({ id: r.id, outcome: 'already_recorded' }),
              ),
            },
          }
        : undefined,
    );
    const dispatch = vi.fn();
    expect(await sendDrafts('me', dispatch)).toMatchObject({ sent: 51 });
    expect(
      sent.map((s) => (s.body as { records: unknown[] }).records.length),
    ).toEqual([50, 1]);
    expect(request).toHaveBeenCalledWith(
      'wegro-farm-updates',
      expect.any(Function),
    );
    expect(dispatch).toHaveBeenCalled();
    Reflect.deleteProperty(navigator, 'locks');
  });

  it('marks drafts even when the refusal is not readable', async () => {
    const photo = await keep();
    const lone = await keep({ photoId: 'p' }, false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('oops', { status: 422 })),
    );
    await sendDrafts('me');
    const left = await drafts.list<FarmUpdateData>('me');
    expect(left.find((d) => d.id === photo.id)!.rejection?.code).toBe(
      'PHOTO_INVALID',
    );
    expect(left.find((d) => d.id === lone.id)!.rejection?.code).toBe(
      'INVALID_INPUT',
    );
  });

  it('passes on what is not a connection problem', async () => {
    await keep({ photoId: 'p' }, false);
    fakeServer(() => ({ body: { data: null } }));
    await expect(sendDrafts('me')).rejects.toBeInstanceOf(TypeError);
  });
});

async function show(
  role: Role,
  ui: ReactNode,
  path: string,
  answer: (s: Sent) => Reply | undefined,
) {
  await signedInAs(role);
  const sent = fakeServer(answer);
  const view = await renderPage(ui, path);
  return { sent, ...view };
}

describe('sent farm updates', () => {
  it('lists them with search and pages, each opening its project', async () => {
    const { router } = await show(
      'field_officer',
      <SentPage search={{}} />,
      '/farm-updates/sent',
      (s) =>
        s.url.pathname === '/api/field-records'
          ? { body: page([record()], 40) }
          : s.url.pathname === '/api/photos/ph1/file'
            ? { body: 'jpg' }
            : undefined,
    );
    expect(
      (
        await screen.findByRole('link', { name: 'Maize in Bogura' })
      ).getAttribute('href'),
    ).toBe(`/projects/${PROJECT}`);
    await userEvent.type(screen.getByRole('searchbox'), 'maize');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'maize' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
  });

  it('says when there are none, or none match, and tries again', async () => {
    await show(
      'field_officer',
      <SentPage search={{}} />,
      '/farm-updates/sent',
      () => ({
        body: page([]),
      }),
    );
    expect(await screen.findByText('No Farm Updates Sent Yet')).toBeTruthy();
    cleanup();
    let calls = 0;
    await show(
      'field_officer',
      <SentPage search={{ q: 'zz' }} />,
      '/farm-updates/sent',
      () => (++calls > 1 ? { body: page([]) } : failure(500, 'X')),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(
      await screen.findByText('No Farm Update Matches Your Search'),
    ).toBeTruthy();
  });
});

describe('a farm update', () => {
  const card = (role: Role, r: FieldRecordDto, verify?: () => Reply) =>
    show(role, <RecordCard record={r} />, '/projects/p1', (s) =>
      s.url.pathname === '/api/photos/ph1/file'
        ? { body: 'jpg' }
        : s.url.pathname === `/api/field-records/${r.id}/verify`
          ? verify?.()
          : undefined,
    );

  it('shows the readings, the exact spot, and the photo enlarged', async () => {
    await card('field_officer', record());
    expect(screen.getByText('Plant Height:')).toBeTruthy();
    expect(screen.getByText(/24.846512, 89.377621 ±6 m/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Map' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /Correct/ }).getAttribute('href'),
    ).toContain('corrects=r1');
    const show = screen.getByRole('button', { name: 'Show Photo' });
    await waitFor(() => expect(show.hasAttribute('disabled')).toBe(false));
    await userEvent.click(show);
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('img', { name: 'Photo of the field' }),
    ).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // A photo that will not load is not offered.
    const img = document.querySelector('article img') as HTMLImageElement;
    img.dispatchEvent(new Event('error'));
    await waitFor(() => expect(show.hasAttribute('disabled')).toBe(true));
  });

  it('marks corrections, and shows only the area of a spot not exact', async () => {
    await card(
      'field_officer',
      record({
        recordedBy: { id: 'someone', name: 'Other Officer' },
        correctsEntryId: 'r0',
        correctedBy: ['r2'],
        status: 'submitted',
        photo: null,
        notes: null,
        measurements: [],
        location: {
          latitude: '24.85',
          longitude: '89.38',
          accuracyMeters: null,
          exact: false,
        } as never,
      }),
    );
    expect(screen.getByText('Correction')).toBeTruthy();
    expect(screen.getByText('Corrected Later')).toBeTruthy();
    expect(screen.getByText('Sending to Ledger')).toBeTruthy();
    expect(screen.getByText(/Around 24.85, 89.38/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Correct/ })).toBeNull();
    cleanup();
    await card(
      'field_officer',
      record({
        recordedBy: { id: 'someone', name: 'Other Officer' },
        location: {
          latitude: '1',
          longitude: '2',
          accuracyMeters: null,
          exact: true,
        } as never,
      }),
    );
    // Their own farmer's record (exact spot shown): they may correct it.
    expect(screen.getByRole('link', { name: /Correct/ })).toBeTruthy();
    expect(screen.getByText('1, 2')).toBeTruthy();
  });

  it('is checked against the ledger by admins and auditors', async () => {
    let answer: Reply = { body: { data: { matches: true, mismatches: [] } } };
    await card('auditor', record({ location: null }), () => answer);
    const check = screen.getByRole('button', { name: /Verify Against Ledger/ });
    await userEvent.click(check);
    expect(
      await screen.findByText('This farm update matches the ledger.'),
    ).toBeTruthy();
    answer = { body: { data: { matches: false, mismatches: ['notes'] } } };
    await userEvent.click(check);
    expect(
      await screen.findByText('This farm update differs from the ledger'),
    ).toBeTruthy();
    answer = failure(503, 'LEDGER_UNAVAILABLE');
    await userEvent.click(check);
    expect(
      await screen.findByText(
        'The ledger cannot be reached right now. Try again shortly.',
      ),
    ).toBeTruthy();
    // The earlier answer goes: it is not what the last check found.
    expect(
      screen.queryByText('This farm update differs from the ledger'),
    ).toBeNull();
  });

  it('reads in Bengali', async () => {
    const { applyLanguage } = await import('@/i18n');
    await signedInAs('farmer');
    await applyLanguage('bn');
    fakeServer(() => undefined);
    await renderPage(<RecordCard record={record()} />, '/projects/p1');
    expect(screen.getByText('বৃদ্ধি পর্যবেক্ষণ')).toBeTruthy();
    expect(screen.getByText('গাছের উচ্চতা:')).toBeTruthy();
    await applyLanguage('en');
  });
});

describe('a project’s farm updates', () => {
  const at = (
    role: Role,
    over: Partial<ProjectDto> = {},
    answer: (s: Sent) => Reply | undefined = () => undefined,
  ) =>
    show(
      role,
      <ProjectFarmUpdates
        project={project({ id: PROJECT, chainState: 'confirmed', ...over })}
      />,
      `/projects/${PROJECT}`,
      answer,
    );

  it('shows five, then ten more at a time', async () => {
    const { sent } = await at('investor', {}, (s) =>
      s.url.pathname === `/api/projects/${PROJECT}/field-records`
        ? {
            body: page(
              [record({ photo: null }), record({ id: 'r2', photo: null })],
              8,
            ),
          }
        : undefined,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Show 6 More' }),
    );
    await waitFor(() =>
      expect(sent.at(-1)!.url.searchParams.get('limit')).toBe('15'),
    );
  });

  it('lets the farmer’s own officer add one, says when there are none, and tries again', async () => {
    deviceCache.set('officerProjects', 'me', [{ id: PROJECT }]);
    let calls = 0;
    await at('field_officer', {}, (s) =>
      s.url.pathname === `/api/projects/${PROJECT}/field-records`
        ? ++calls > 1
          ? { body: page([]) }
          : failure(500, 'X')
        : s.url.pathname === '/api/field-records/my-projects'
          ? { body: { data: [{ id: PROJECT }] } }
          : undefined,
    );
    expect(
      (
        await screen.findByRole('link', { name: /Add Farm Update/ })
      ).getAttribute('href'),
    ).toBe(`/farm-updates?project=${PROJECT}`);
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('No farm updates yet.')).toBeTruthy();
  });

  it('offers adding only on the officer’s own projects, and nothing before the ledger', async () => {
    await at('field_officer', {}, (s) =>
      s.url.pathname === '/api/field-records/my-projects'
        ? { body: { data: [{ id: OTHER }] } }
        : { body: page([]) },
    );
    expect(await screen.findByText('No farm updates yet.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Add Farm Update/ })).toBeNull();
    cleanup();
    const { sent } = await at('investor', { chainState: 'local' });
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toEqual([]);
    expect(screen.queryByText('Farm Updates')).toBeNull();
  });
});

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
  ],
};
const visit = {
  code: 'VISIT',
  name: 'Field Visit',
  nameBn: 'মাঠ পরিদর্শন',
  active: true,
  sortOrder: 1,
  requiresPhoto: false,
  requiresLocation: false,
  measurements: [],
};
const catalogBody: Reply = {
  body: {
    data: {
      version: '1',
      units: [],
      produceTypes: [],
      inputTypes: [],
      fieldRecordTypes: [
        growth,
        visit,
        { ...visit, code: 'OLD', name: 'Old Kind', active: false },
      ],
      weatherEventTypes: [],
      districts: [],
    },
  },
};
const myProjects: Reply = {
  body: {
    data: [
      {
        id: PROJECT,
        title: 'Maize in Bogura',
        stage: 'active',
        farmer: { id: 'f1', name: 'Rahim Uddin' },
        location: 'Shibganj',
        district: 'Bogura',
      },
      {
        id: OTHER,
        title: 'Jute in Rangpur',
        stage: 'active',
        farmer: { id: 'f2', name: 'Karim Mia' },
        location: 'Pirgacha',
        district: 'Rangpur',
      },
    ],
  },
};

/** The officer's server: the catalog, their projects, then `rest`. */
const officerServer =
  (rest: (s: Sent) => Reply | undefined = () => undefined) =>
  (s: Sent): Reply | undefined => {
    if (s.url.pathname === '/api/catalog') return catalogBody;
    if (s.url.pathname === '/api/field-records/my-projects') return myProjects;
    return rest(s);
  };

describe('the farm update form, further', () => {
  let locate: (ok: PositionCallback, fail: PositionErrorCallback) => void;
  beforeEach(() => {
    locate = (ok) =>
      ok({
        coords: { latitude: 24.8465123, longitude: 89.3776209, accuracy: 6.4 },
      } as GeolocationPosition);
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          ok: PositionCallback,
          fail: PositionErrorCallback,
        ) => locate(ok, fail),
      },
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'geolocation');
  });

  const open = async (
    search: Parameters<typeof NewUpdatePage>[0]['search'],
    rest?: (s: Sent) => Reply | undefined,
  ) => {
    await signedInAs('field_officer');
    const sent = fakeServer(officerServer(rest));
    const view = await renderPage(
      <NewUpdatePage search={search} />,
      '/farm-updates',
    );
    return { sent, ...view };
  };

  it('says a draft is not on this phone, nor someone else’s', async () => {
    await open({ draft: crypto.randomUUID() });
    expect(
      await screen.findByText('This Draft Is Not on This Phone'),
    ).toBeTruthy();
    cleanup();
    const theirs = await drafts.save<FarmUpdateData>({
      id: crypto.randomUUID(),
      ownerId: 'other',
      kind: 'farm-update',
      data: draftData(),
      photos: [],
      rejection: null,
    });
    await open({ draft: theirs.id });
    expect(
      await screen.findByText('This Draft Is Not on This Phone'),
    ).toBeTruthy();
    await drafts.remove(theirs.id);
  });

  it('says why a record to correct cannot be opened, and tries again', async () => {
    let calls = 0;
    await open({ corrects: OTHER }, (s) =>
      s.url.pathname === `/api/field-records/${OTHER}`
        ? ++calls > 1
          ? { body: { data: record({ id: OTHER, photo: null }) } }
          : failure(500, 'X')
        : undefined,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText(/Correcting the Growth Check/)).toBeTruthy();
    // The project stays: going back shows it fixed.
    await userEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(
      screen.getByText('A correction stays on the same project.'),
    ).toBeTruthy();
  });

  it('starts at the type for a project of theirs, and at the projects otherwise', async () => {
    await open({ project: PROJECT });
    expect(
      await screen.findByRole('heading', { name: 'Update Type' }),
    ).toBeTruthy();
    // A retired kind is not offered for a new update.
    expect(screen.queryByRole('radio', { name: /Old Kind/ })).toBeNull();
    cleanup();
    await open({ project: crypto.randomUUID() });
    expect(
      await screen.findByRole('heading', { name: 'Choose the Project' }),
    ).toBeTruthy();
  });

  it('finds a project, keeps what fits a new type, and saves offline', async () => {
    const { toast } = await import('sonner');
    const ok = vi.spyOn(toast, 'success').mockImplementation(() => 1);
    const { router } = await open({});
    await userEvent.type(await screen.findByRole('searchbox'), 'rangpur');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(screen.queryByRole('radio', { name: /Maize in Bogura/ })).toBeNull();
    await userEvent.click(
      screen.getByRole('radio', { name: /Jute in Rangpur/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    await userEvent.click(
      await screen.findByRole('radio', { name: /Growth Check/ }),
    );
    await userEvent.click(screen.getByRole('radio', { name: /Field Visit/ }));
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    // No photo needed: it can be skipped. The pickers open the phone’s own.
    const picker = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await userEvent.click(screen.getByRole('button', { name: /Take Photo/ }));
    await userEvent.click(
      screen.getByRole('button', { name: /Choose From Gallery/ }),
    );
    expect(picker).toHaveBeenCalledTimes(2);
    picker.mockRestore();
    // Nothing chosen in the picker: nothing changes.
    const gallery =
      document.querySelectorAll<HTMLInputElement>('input[type=file]')[1]!;
    gallery.dispatchEvent(new Event('change', { bubbles: true }));
    await userEvent.click(
      screen.getByRole('button', { name: /Continue Without Photo/ }),
    );
    await userEvent.type(screen.getByLabelText('Notes'), 'All well');
    const observed = screen.getByLabelText('Observed At');
    await userEvent.clear(observed);
    await userEvent.click(screen.getByRole('button', { name: /Find Again/ }));
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText('Jute in Rangpur · Karim Mia')).toBeTruthy();
    // Changing a part goes back to its step.
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Change' })[0]!,
    );
    expect(
      screen.getByRole('heading', { name: 'Choose the Project' }),
    ).toBeTruthy();
    for (let i = 0; i < 4; i++)
      await userEvent.click(
        screen.getByRole('button', { name: /Next|Continue/ }),
      );

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    await userEvent.click(
      screen.getByRole('button', { name: /Save on This Phone/ }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/farm-updates/drafts'),
    );
    expect(ok).toHaveBeenCalled();
    const [d] = await drafts.list<FarmUpdateData>('me');
    expect(d!.data).toMatchObject({
      projectId: OTHER,
      entryTypeCode: 'VISIT',
      notes: 'All well',
      measurements: {},
    });
  });

  it('tells the officer when the location is blocked, and asks again', async () => {
    locate = (_ok, fail) =>
      fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);
    await open({ project: PROJECT });
    await userEvent.click(
      await screen.findByRole('radio', { name: /Field Visit/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    await userEvent.click(
      screen.getByRole('button', { name: /Continue Without Photo/ }),
    );
    expect(screen.getByText(/Location is blocked/)).toBeTruthy();
    locate = (ok) =>
      ok({
        coords: { latitude: 1, longitude: 2, accuracy: 3 },
      } as GeolocationPosition);
    await userEvent.click(screen.getByRole('button', { name: /Try Again/ }));
    expect(await screen.findByText(/1.000000, 2.000000/)).toBeTruthy();
  });

  it('opens a refused draft at the review, keeps it unsaved while wrong, and says how sending went', async () => {
    const { toast } = await import('sonner');
    const failed = vi.spyOn(toast, 'error').mockImplementation(() => 1);
    const ok = vi.spyOn(toast, 'success').mockImplementation(() => 1);
    const kept = await keep({ photoId: 'p1', measurements: {} }, false);
    await drafts.save({
      ...(await drafts.get<FarmUpdateData>(kept.id))!,
      rejection: { code: 'INVALID_RECORD', message: 'Bad', details: undefined },
    });
    let outcome = 'rejected';
    const { router } = await open({ draft: kept.id }, (s) =>
      s.url.pathname === '/api/field-records/sync'
        ? {
            body: {
              data: [
                { id: kept.id, outcome, code: 'INVALID_RECORD', message: 'x' },
              ],
            },
          }
        : undefined,
    );
    expect(
      await screen.findByRole('heading', { name: 'Farm Update Draft' }),
    ).toBeTruthy();
    const save = screen.getByRole('button', { name: /Save and Send/ });
    // The required reading is missing: nothing is saved.
    await userEvent.click(save);
    expect(
      (await drafts.get<FarmUpdateData>(kept.id))!.rejection,
    ).not.toBeNull();
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Change' })[3]!,
    );
    await userEvent.type(screen.getByLabelText(/Plant Height/), '42');
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    await userEvent.click(
      screen.getByRole('button', { name: /Save and Send/ }),
    );
    await waitFor(() => expect(failed).toHaveBeenCalled());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/farm-updates/drafts'),
    );
    cleanup();

    outcome = 'pending';
    await open({ draft: kept.id }, (s) =>
      s.url.pathname === '/api/field-records/sync'
        ? { body: { data: [{ id: kept.id, outcome: 'pending' }] } }
        : undefined,
    );
    // Once refused it is not sent by itself: save it again. (The catalog
    // must be in first, to know the update's type.)
    await screen.findByText('Growth Check');
    await userEvent.click(
      screen.getByRole('button', { name: /Save and Send/ }),
    );
    await waitFor(() =>
      expect(ok).toHaveBeenCalledWith(
        'Saved on this phone. It will be sent shortly.',
      ),
    );
  });
});

describe('drafts on this phone, further', () => {
  const page = async (rest?: (s: Sent) => Reply | undefined) => {
    await signedInAs('field_officer');
    const sent = fakeServer(officerServer(rest));
    await renderPage(<DraftsPage />, '/farm-updates/drafts');
    return sent;
  };

  it('finds drafts by project, farmer or type', async () => {
    await keep();
    await keep({
      projectId: OTHER,
      projectTitle: 'Jute in Rangpur',
      farmerName: 'Karim Mia',
      entryTypeCode: 'VISIT',
    });
    await page();
    expect(await screen.findAllByRole('article')).toHaveLength(2);
    await userEvent.type(screen.getByRole('searchbox'), 'field visit');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), 'nobody');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(screen.getByText('No Draft Matches Your Search')).toBeTruthy();
  });

  it('sends now, saying how it went', async () => {
    const { toast } = await import('sonner');
    const ok = vi.spyOn(toast, 'success').mockImplementation(() => 1);
    const failed = vi.spyOn(toast, 'error').mockImplementation(() => 1);
    const plain = vi.mocked(toast);
    const d = await keep({ photoId: 'p' }, false);
    let answer: Reply | 'offline' = {
      body: { data: [{ id: d.id, outcome: 'pending' }] },
    };
    await page((s) =>
      s.url.pathname === '/api/field-records/sync'
        ? answer === 'offline'
          ? { status: 503, body: {} }
          : answer
        : undefined,
    );
    const send = await screen.findByRole('button', { name: /Send Now/ });
    void plain;
    await userEvent.click(send);
    answer = 'offline';
    await userEvent.click(send);
    await waitFor(() =>
      expect(failed).toHaveBeenCalledWith(
        'Could not reach the server. The updates stay on this phone.',
      ),
    );
    // A broken answer: as good as no answer.
    answer = { body: { data: null } };
    await userEvent.click(send);
    await waitFor(() => expect(failed).toHaveBeenCalledTimes(2));
    answer = { body: { data: [{ id: d.id, outcome: 'rejected', code: 'X' }] } };
    await userEvent.click(send);
    await waitFor(() => expect(failed).toHaveBeenCalledTimes(3));
    cleanup();

    const e = await keep({ photoId: 'p2' }, false);
    answer = { body: { data: [{ id: e.id, outcome: 'recorded' }] } };
    await page((s) =>
      s.url.pathname === '/api/field-records/sync'
        ? (answer as Reply)
        : undefined,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Send Now/ }),
    );
    await waitFor(() => expect(ok).toHaveBeenCalledWith('1 update sent.'));
  });

  it('keeps a draft when deleting is called off', async () => {
    await keep();
    await page();
    const card = (await screen.findAllByRole('article'))[0]!;
    await userEvent.click(within(card).getByRole('button', { name: /Delete/ }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await userEvent.click(within(card).getByRole('button', { name: /Delete/ }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await drafts.list('me')).toHaveLength(1);
  });

  it('says plainly while offline that they wait', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await keep();
    await page();
    expect(
      (await screen.findByRole('button', { name: /Send Now/ })).hasAttribute(
        'disabled',
      ),
    ).toBe(true);
  });
});

describe('the farm update form, last details', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: { latitude: 24.8, longitude: 89.3, accuracy: 5 },
          } as GeolocationPosition),
      },
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'geolocation');
  });

  it('keeps the readings that fit when the type is chosen again, and the time typed', async () => {
    const { toast } = await import('sonner');
    const ok = vi.spyOn(toast, 'success').mockImplementation(() => 1);
    const kept = await keep(
      {
        photoId: 'p1',
        entryTypeCode: 'VISIT',
        measurements: { plant_height: '42', stale: '7' },
      },
      false,
    );
    await signedInAs('field_officer');
    fakeServer(
      officerServer((s) =>
        s.url.pathname === '/api/field-records/sync'
          ? { body: { data: null } }
          : undefined,
      ),
    );
    await renderPage(
      <NewUpdatePage search={{ draft: kept.id }} />,
      '/farm-updates',
    );
    await screen.findByText('Field Visit');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Change' })[1]!,
    );
    await userEvent.click(screen.getByRole('radio', { name: /Growth Check/ }));
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    // jsdom types a date-time field one key at a time: set it whole.
    fireEvent.change(screen.getByLabelText('Observed At'), {
      target: { value: '2026-10-19T08:15' },
    });
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    // Sending fails outright: it stays on the phone, to be sent later.
    await userEvent.click(
      screen.getByRole('button', { name: /Save and Send/ }),
    );
    await waitFor(() =>
      expect(ok).toHaveBeenCalledWith(
        'Saved on this phone. It will be sent shortly.',
      ),
    );
    const d = (await drafts.get<FarmUpdateData>(kept.id))!;
    expect(d.data.measurements).toEqual({ plant_height: '42' });
    expect(d.data.observedAt).toBe(new Date('2026-10-19T08:15').toISOString());
  });

  it('waits for the catalog before a draft can be checked or saved, and asks again when it fails', async () => {
    const kept = await keep({ entryTypeCode: 'VISIT' });
    await signedInAs('field_officer');
    let catalogCalls = 0;
    fakeServer((s) =>
      s.url.pathname === '/api/catalog' && ++catalogCalls === 1
        ? failure(500, 'X')
        : officerServer()(s),
    );
    await renderPage(
      <NewUpdatePage search={{ draft: kept.id }} />,
      '/farm-updates',
    );
    // Not "Missing": the type is there, its details are not yet.
    const retry = await screen.findByRole('button', { name: /Try Again/ });
    expect(screen.queryByText('Missing')).toBeNull();
    const save = screen.getByRole('button', { name: /Save and Send/ });
    expect(save.hasAttribute('disabled')).toBe(true);
    await userEvent.click(retry);
    expect(await screen.findByText('Field Visit')).toBeTruthy();
    expect(save.hasAttribute('disabled')).toBe(false);
  });

  it('says when the types cannot be loaded on choosing one', async () => {
    await signedInAs('field_officer');
    fakeServer((s) =>
      s.url.pathname === '/api/catalog'
        ? failure(500, 'X')
        : officerServer()(s),
    );
    await renderPage(
      <NewUpdatePage search={{ project: PROJECT }} />,
      '/farm-updates',
    );
    expect(
      await screen.findByRole('button', { name: /Try Again/ }),
    ).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('shows the project of a correction fixed, and closes before a draft is read', async () => {
    await signedInAs('field_officer');
    fakeServer(
      officerServer((s) =>
        s.url.pathname === `/api/field-records/${OTHER}`
          ? { body: { data: record({ id: OTHER, photo: null }) } }
          : undefined,
      ),
    );
    await renderPage(
      <NewUpdatePage search={{ corrects: OTHER }} />,
      '/farm-updates',
    );
    await userEvent.click(await screen.findByRole('button', { name: /Back/ }));
    // Choosing it again changes nothing.
    await userEvent.click(
      screen.getByRole('radio', { name: /Maize in Bogura/ }),
    );
    expect(
      screen.getByText('A correction stays on the same project.'),
    ).toBeTruthy();
    cleanup();

    const kept = await keep();
    await renderPage(
      <NewUpdatePage search={{ draft: kept.id }} />,
      '/farm-updates',
    );
    cleanup();
    await new Promise((r) => setTimeout(r, 50));
  });
});
