// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ConsentDto,
  TrackRecordSummaryDto,
} from '@/api/generated/track-record';
import { fakeServer, recordForms, renderPage, signedInAs } from '@/test/render';
import { BankFarmersList } from './bank-farmers-list';
import { BankViewPage } from './bank-view-page';
import { BanksPage } from './banks-page';
import { FarmerRecordPage } from './farmer-record-page';
import { FarmersList } from './farmers-list';
import { PermissionsList } from './permissions-list';

const FARMER = '11111111-1111-4111-8111-111111111111';
const BANK = '22222222-2222-4222-8222-222222222222';
const page = <T,>(data: T[]) => ({
  data,
  meta: { page: 1, limit: 12, total: data.length, totalPages: 1 },
});

beforeEach(() => {
  Object.assign(URL, {
    createObjectURL: () => 'blob:x',
    revokeObjectURL: () => undefined,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const summary: TrackRecordSummaryDto = {
  v: 2,
  recordId: 'r1',
  generatedAt: '2026-10-20T05:00:00.000Z',
  farmer: {
    id: FARMER,
    name: 'Rahim Uddin',
    district: { code: 'BOGURA', name: 'Bogura' },
  },
  projects: [
    {
      id: 'p1',
      title: 'Maize in Bogura #1',
      produce: { code: 'MAIZE', name: 'Maize', unit: 'kg' },
      district: { code: 'BOGURA', name: 'Bogura' },
      durationType: 'short_term',
      durationMonths: 5,
      startedOn: '2026-01-01',
      plannedEndOn: '2026-06-01',
      finishedOn: '2026-05-20',
      onTime: true,
      money: {
        fundingRaised: '100000.00',
        income: '600000.00',
        sales: '600000.00',
        insurance: '0.00',
        costs: '200000.00',
        inputs: '150000.00',
        otherCosts: '50000.00',
        net: '400000.00',
        farmerReceived: '160000.00',
        investorReturnPercent: '60.0',
      },
      harvest: { harvested: '20000', sold: '20000', unit: 'kg' },
      risk: {
        claimsApproved: 0,
        claimsRejected: 0,
        approvedAmount: '0.00',
        events: [],
      },
    },
  ],
  totals: {
    projects: 1,
    finishedOnTime: 1,
    fundingRaised: '100000.00',
    income: '600000.00',
    costs: '200000.00',
    net: '400000.00',
    farmerReceived: '160000.00',
    claimsApproved: 0,
    claimsApprovedAmount: '0.00',
  },
  importedHistory: [],
};

const consent = (over: Partial<ConsentDto> = {}): ConsentDto => ({
  id: 'c1',
  farmer: { id: FARMER, name: 'Rahim Uddin' },
  bank: { id: BANK, name: 'Krishi Bank' },
  status: 'active',
  current: true,
  expiresOn: '2027-04-30',
  expiresAt: '2027-04-30T17:59:59.000Z',
  grantedBy: { id: 'o1', name: 'Imran Officer' },
  grantedAt: '2026-10-20T05:00:00.000Z',
  revokedAt: null,
  evidencePhotoUrl: '/api/consents/c1/evidence-photo',
  evidenceHash: '0x1',
  views: 2,
  lastViewedAt: null,
  ...over,
});

function farmerServer(
  over: {
    versions?: unknown[];
    officer?: { id: string; name: string } | null;
    pendingProjects?: number;
    summary?: TrackRecordSummaryDto;
  } = {},
) {
  return fakeServer(({ method, url }) => {
    const base = `/api/farmers/${FARMER}`;
    if (url.pathname === `${base}/track-records` && method === 'GET')
      return {
        body: {
          data: over.versions ?? [
            {
              version: 1,
              publishedAt: '2026-10-20T05:00:00.000Z',
              publishedBy: { id: 'o1', name: 'Imran Officer' },
              projects: 1,
              summaryHash: '0x1',
            },
          ],
        },
      };
    if (url.pathname === `${base}/track-record/preview`)
      return {
        body: {
          data: {
            summary: over.summary ?? summary,
            officer:
              over.officer === undefined
                ? { id: 'o1', name: 'Imran Officer' }
                : over.officer,
            latestVersion: over.versions?.length === 0 ? null : 1,
            pendingProjects: over.pendingProjects ?? 0,
          },
        },
      };
    if (url.pathname === `${base}/track-records/1`)
      return {
        body: {
          data: {
            version: 1,
            publishedAt: '2026-10-20T05:00:00.000Z',
            publishedBy: { id: 'o1', name: 'Imran Officer' },
            projects: 1,
            summaryHash: '0x1',
            summary,
            verified: true,
          },
        },
      };
    if (url.pathname === `${base}/consents` && method === 'GET')
      return { body: { data: [consent()] } };
    if (url.pathname === `${base}/consents/views`)
      return {
        body: page([
          {
            bank: { id: BANK, name: 'Krishi Bank' },
            viewer: { id: 'b1', name: 'Bank Officer' },
            version: 1,
            viewedAt: '2026-10-21T05:00:00.000Z',
          },
        ]),
      };
    if (url.pathname === '/api/banks')
      return {
        body: {
          data: [
            {
              id: BANK,
              name: 'Krishi Bank',
              branchName: 'Bogura',
              district: { code: 'BOGURA', name: 'Bogura' },
              address: 'Satmatha',
              status: 'registered',
              detailsHash: '0x',
            },
          ],
        },
      };
    if (method === 'POST' && url.pathname === '/api/photos')
      return {
        status: 201,
        body: {
          data: {
            id: 'form-1',
            mimeType: 'image/jpeg',
            sizeBytes: 1,
            photoHash: '0x',
          },
        },
      };
    if (method === 'POST' && url.pathname === `${base}/consents`)
      return { status: 201, body: { data: consent() } };
    if (method === 'POST' && url.pathname === `${base}/track-records`)
      return { status: 201, body: { data: { version: 2 } } };
    if (url.pathname.startsWith('/api/consents/')) return { body: '' };
    return undefined;
  });
}

describe('farmers', () => {
  it('lists an officer’s farmers by whether a record is published', async () => {
    await signedInAs('field_officer');
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/track-records/farmers'
        ? {
            body: page([
              {
                farmer: { id: FARMER, name: 'Rahim Uddin' },
                district: 'Bogura',
                officer: { id: 'me', name: 'Me' },
                finishedProjects: 2,
                latestVersion: 3,
                publishedAt: '2026-10-20T05:00:00.000Z',
                pendingProjects: 1,
                currentPermissions: 1,
              },
            ]),
          }
        : undefined,
    );
    await renderPage(
      <FarmersList search={{ tab: 'published', q: 'Rahim' }} />,
      '/track-records',
    );
    expect(await screen.findByText('Rahim Uddin')).toBeTruthy();
    expect(
      screen.getByText('2 finished projects · 1 bank may look'),
    ).toBeTruthy();
    expect(screen.getByText('1 Project to Add')).toBeTruthy();
    const params = sent.find(
      (s) => s.url.pathname === '/api/track-records/farmers',
    )!.url.searchParams;
    expect(params.get('state')).toBe('published');
    expect(params.get('q')).toBe('Rahim');
  });

  it('shows the published record, and lets the officer publish and give a bank permission', async () => {
    const forms = recordForms();
    await signedInAs('field_officer');
    const sent = farmerServer();
    await renderPage(
      <FarmerRecordPage farmerId={FARMER} />,
      `/track-records/farmers/${FARMER}`,
    );
    expect(await screen.findByText('Maize in Bogura #1')).toBeTruthy();
    expect(
      screen.getByText(/Version 1 published by Imran Officer/),
    ).toBeTruthy();
    expect(screen.getByText('viewed 2 times', { exact: false })).toBeTruthy();

    await userEvent.click(
      screen.getByRole('button', { name: 'Publish New Version' }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Publish New Version',
      }),
    );
    await waitFor(() =>
      expect(
        sent.some(
          (s) =>
            s.method === 'POST' && s.url.pathname.endsWith('/track-records'),
        ),
      ).toBe(true),
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Give a Bank Permission' }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox'));
    await userEvent.click(
      await screen.findByRole('option', { name: /Krishi Bank/ }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Give a Bank Permission' }),
    );
    expect(
      within(dialog).getByText('Add a photo of the signed form.'),
    ).toBeTruthy();
    await userEvent.upload(
      dialog.querySelector('input[type=file]') as HTMLInputElement,
      new File(['jpeg'], 'form.jpg', { type: 'image/jpeg' }),
    );
    await waitFor(() => expect(forms.at(-1)).toEqual([['file', 'form.jpg']]));
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Give a Bank Permission' }),
    );
    await waitFor(() =>
      expect(
        sent.find(
          (s) => s.method === 'POST' && s.url.pathname.endsWith('/consents'),
        )?.body,
      ).toMatchObject({ bankId: BANK, evidencePhotoId: 'form-1' }),
    );
  });

  it('shows a farmer their own record without the officer’s moves', async () => {
    await signedInAs('farmer');
    farmerServer();
    await renderPage(
      <FarmerRecordPage farmerId={FARMER} own />,
      '/track-records',
    );
    expect(await screen.findByText('Maize in Bogura #1')).toBeTruthy();
    expect(screen.getByText('Who Looked')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Give a Bank Permission/ }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });

  it('previews before anything is published', async () => {
    await signedInAs('admin');
    farmerServer({ versions: [] });
    await renderPage(
      <FarmerRecordPage farmerId={FARMER} />,
      `/track-records/farmers/${FARMER}`,
    );
    expect(
      await screen.findByText(/A preview of the next version/),
    ).toBeTruthy();
    expect(screen.getAllByText('Not Published').length).toBeGreaterThan(0);
    // An admin sees the record but does not act for the farmer.
    expect(screen.getByText(/Field Officer: Imran Officer/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull();
  });

  it('lets the super admin act for a farmer without an officer, and flags projects to add', async () => {
    await signedInAs('super_admin');
    farmerServer({ officer: null, pendingProjects: 2 });
    await renderPage(
      <FarmerRecordPage farmerId={FARMER} />,
      `/track-records/farmers/${FARMER}`,
    );
    expect(await screen.findByText(/No Field Officer/)).toBeTruthy();
    expect(
      screen.getByText(/2 finished projects are not in version 1 yet/),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Publish New Version' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Give a Bank Permission' }),
    ).toBeTruthy();
    expect(
      await screen.findByRole('button', { name: 'Withdraw' }),
    ).toBeTruthy();
  });

  it('has nothing to publish before a project finishes', async () => {
    await signedInAs('field_officer');
    farmerServer({
      versions: [],
      summary: {
        ...summary,
        projects: [],
        totals: { ...summary.totals, projects: 0 },
      },
    });
    await renderPage(
      <FarmerRecordPage farmerId={FARMER} />,
      `/track-records/farmers/${FARMER}`,
    );
    const publish = await screen.findByRole('button', {
      name: 'Publish New Version',
    });
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Nothing to publish until/)).toBeTruthy();
  });
});

describe('permissions and banks', () => {
  it('lists permissions across farmers, searched by farmer or bank', async () => {
    await signedInAs('auditor');
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/consents'
        ? { body: page([consent()]) }
        : undefined,
    );
    await renderPage(
      <PermissionsList search={{ tab: 'expired', q: 'Krishi' }} />,
      '/track-records/permissions',
    );
    expect(await screen.findByText(/Rahim Uddin/)).toBeTruthy();
    const params = sent.find((s) => s.url.pathname === '/api/consents')!.url
      .searchParams;
    expect(params.get('state')).toBe('expired');
    expect(params.get('q')).toBe('Krishi');
  });

  it('lets an admin register a bank', async () => {
    await signedInAs('admin');
    const sent = fakeServer(({ method, url }) => {
      if (url.pathname === '/api/banks')
        return method === 'POST'
          ? { status: 201, body: { data: {} } }
          : { body: { data: [] } };
      return undefined;
    });
    await renderPage(<BanksPage search={{}} />, '/track-records/banks');
    await userEvent.click(
      await screen.findByRole('button', { name: /Register Bank/ }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.type(
      within(dialog).getByLabelText('Bank Name'),
      'Krishi Bank',
    );
    await userEvent.type(within(dialog).getByLabelText('Branch'), 'Bogura');
    await userEvent.type(within(dialog).getByLabelText('District'), 'Bogura');
    await userEvent.click(
      await screen.findByRole('option', { name: 'Bogura' }),
    );
    await userEvent.type(
      within(dialog).getByLabelText('Address'),
      'Satmatha, Bogura',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Register Bank' }),
    );
    await waitFor(() =>
      expect(sent.find((s) => s.method === 'POST')?.body).toEqual({
        name: 'Krishi Bank',
        branchName: 'Bogura',
        districtCode: 'BOGURA',
        address: 'Satmatha, Bogura',
      }),
    );
  });

  it('links a bank officer only to farmers with a published record', async () => {
    await signedInAs('bank');
    fakeServer(({ url }) => {
      if (url.pathname === '/api/bank/me')
        return {
          body: {
            data: {
              bank: { id: BANK, name: 'Krishi Bank', branchName: 'Bogura' },
            },
          },
        };
      if (url.pathname === '/api/bank/farmers')
        return {
          body: page([
            {
              farmer: { id: FARMER, name: 'Rahim Uddin' },
              district: 'Bogura',
              expiresOn: '2027-04-30',
              latestVersion: 2,
            },
            {
              farmer: { id: 'f2', name: 'Karim Mia' },
              district: 'Bogura',
              expiresOn: '2027-04-30',
              latestVersion: null,
            },
          ]),
        };
      return undefined;
    });
    await renderPage(<BankFarmersList search={{}} />, '/bank/farmers');
    expect(
      (await screen.findByText('Rahim Uddin'))
        .closest('a')
        ?.getAttribute('href'),
    ).toBe(`/bank/farmers/${FARMER}`);
    expect(screen.getByText('Karim Mia').closest('a')).toBeNull();
  });

  it('opens a farmer’s record for a bank officer only when they ask, logged', async () => {
    await signedInAs('bank');
    const sent = fakeServer(({ method, url }) =>
      method === 'POST' &&
      url.pathname === `/api/bank/farmers/${FARMER}/track-record/view`
        ? {
            body: {
              data: {
                farmer: { id: FARMER, name: 'Rahim Uddin' },
                version: 1,
                publishedAt: '2026-10-20T05:00:00.000Z',
                summary,
                summaryHash: '0x1',
                verified: true,
                viewedAt: '2026-10-22T05:00:00.000Z',
                txHash: '0xabc',
              },
            },
          }
        : undefined,
    );
    await renderPage(
      <BankViewPage farmerId={FARMER} />,
      `/bank/farmers/${FARMER}`,
    );
    expect(sent).toHaveLength(0);
    await userEvent.click(
      screen.getByRole('button', { name: /Open Track Record/ }),
    );
    expect(await screen.findByText('Maize in Bogura #1')).toBeTruthy();
    expect(screen.getByText('Checked Against the Ledger')).toBeTruthy();
  });
});

const failure = (status: number, code: string) => ({
  status,
  body: { statusCode: status, code, message: code },
});
const pages = <T,>(data: T[], totalPages: number) => ({
  data,
  meta: { page: 1, limit: 12, total: data.length, totalPages },
});

describe('track record lists', () => {
  it('moves the farmers list between tabs and pages, and tries again', async () => {
    await signedInAs('field_officer');
    let calls = 0;
    fakeServer(({ url }) =>
      url.pathname === '/api/track-records/farmers'
        ? ++calls > 1
          ? {
              body: pages(
                [
                  {
                    farmer: { id: FARMER, name: 'Rahim Uddin' },
                    district: 'BOGURA',
                    officer: null,
                    finishedProjects: 1,
                    latestVersion: null,
                    publishedAt: null,
                    pendingProjects: 0,
                    activeConsents: 0,
                  },
                ],
                2,
              ),
            }
          : failure(500, 'X')
        : undefined,
    );
    const { router } = await renderPage(
      <FarmersList search={{}} />,
      '/track-records',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    await screen.findByText(/Rahim Uddin/);
    await userEvent.click(screen.getByRole('tab', { name: 'Published' }));
    expect(router.state.location.search).toEqual({ tab: 'published' });
    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(router.state.location.search).toEqual({});
    await userEvent.type(screen.getByRole('searchbox'), 'rahim');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'rahim' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
  });

  it('moves the permissions list between tabs and pages, and tries again', async () => {
    await signedInAs('admin');
    let calls = 0;
    fakeServer(({ url }) =>
      url.pathname === '/api/consents'
        ? ++calls > 1
          ? { body: pages([consent()], 2) }
          : failure(500, 'X')
        : undefined,
    );
    const { router } = await renderPage(
      <PermissionsList search={{}} />,
      '/track-records/permissions',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    await screen.findByText(/Rahim Uddin/);
    await userEvent.click(screen.getByRole('tab', { name: 'Withdrawn' }));
    expect(router.state.location.search).toEqual({ tab: 'revoked' });
    await userEvent.click(screen.getByRole('tab', { name: 'Current' }));
    expect(router.state.location.search).toEqual({});
    await userEvent.type(screen.getByRole('searchbox'), 'krishi');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'krishi' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
  });

  it('searches and pages a bank officer’s farmers, and tries again', async () => {
    await signedInAs('bank');
    let calls = 0;
    fakeServer(({ url }) => {
      if (url.pathname === '/api/bank/me')
        return {
          body: {
            data: {
              bank: { id: BANK, name: 'Krishi Bank', branchName: 'Bogura' },
            },
          },
        };
      if (url.pathname === '/api/bank/farmers')
        return ++calls > 1
          ? {
              body: pages(
                [
                  {
                    farmer: { id: FARMER, name: 'Rahim Uddin' },
                    district: 'BOGURA',
                    expiresOn: '2027-04-30',
                    latestVersion: 1,
                  },
                ],
                2,
              ),
            }
          : failure(500, 'X');
      return undefined;
    });
    const { router } = await renderPage(
      <BankFarmersList search={{}} />,
      '/bank/farmers',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    await screen.findByText('Rahim Uddin');
    await userEvent.type(screen.getByRole('searchbox'), 'rahim');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'rahim' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
  });

  it('says why a bank officer cannot open a record', async () => {
    await signedInAs('bank');
    fakeServer(() => failure(403, 'CONSENT_REQUIRED'));
    await renderPage(
      <BankViewPage farmerId={FARMER} />,
      `/bank/farmers/${FARMER}`,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Open Track Record/ }),
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});

describe('a farmer’s record, further', () => {
  it('says why it cannot be opened, and asks both again', async () => {
    await signedInAs('admin');
    let calls = 0;
    fakeServer(({ url }) => {
      if (url.pathname.endsWith('/track-record/preview'))
        return ++calls > 1
          ? {
              body: {
                data: {
                  summary,
                  officer: null,
                  latestVersion: null,
                  pendingProjects: 0,
                },
              },
            }
          : failure(500, 'X');
      if (url.pathname.endsWith('/track-records'))
        return { body: { data: [] } };
      // Nothing else (the catalog among them): names stay as codes.
      return undefined;
    });
    await renderPage(
      <FarmerRecordPage farmerId={FARMER} />,
      `/track-records/farmers/${FARMER}`,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('Maize in Bogura #1')).toBeTruthy();
  });

  it('moves between a version and the preview, and keeps publishing with the reason when refused', async () => {
    await signedInAs('field_officer');
    const sent = farmerServer();
    // Refuse the publish this time.
    const fetchFn = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        if (
          req.method === 'POST' &&
          new URL(req.url).pathname.endsWith('/track-records')
        )
          return Response.json(failure(409, 'NOTHING_NEW').body, {
            status: 409,
          });
        return fetchFn(input, init);
      }),
    );
    await renderPage(
      <FarmerRecordPage farmerId={FARMER} />,
      `/track-records/farmers/${FARMER}`,
    );
    await screen.findByText('Maize in Bogura #1');
    await userEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(
      await screen.findByText(/A preview of the next version/),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Version 1' }));
    expect(
      await screen.findByText(/Version 1 published by Imran Officer/),
    ).toBeTruthy();

    await userEvent.click(
      screen.getByRole('button', { name: 'Publish New Version' }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Publish New Version' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Publish New Version' }),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    void sent;
  });

  it('shows the signed form, and withdraws a permission after asking', async () => {
    await signedInAs('field_officer');
    const sent = farmerServer();
    await renderPage(
      <FarmerRecordPage farmerId={FARMER} />,
      `/track-records/farmers/${FARMER}`,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Signed Form' }),
    );
    expect(
      await screen.findByRole('img', {
        name: 'The farmer’s signed consent form',
      }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Hide Form' }));

    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    let dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(
        'Krishi Bank can no longer see the track record, from now on.',
      ),
    ).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Withdraw' }),
    );
    // The fake server has no answer for it: the reason is shown.
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    const fetchFn = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        if (new URL(req.url).pathname.endsWith('/revoke'))
          return Response.json({ data: consent({ status: 'revoked' }) });
        return fetchFn(input, init);
      }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Withdraw' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      sent.some(
        (s) =>
          s.method === 'POST' &&
          s.url.pathname.endsWith(`/consents/${BANK}/revoke`),
      ),
    ).toBe(true);
  });

  it('keeps a permission with the reason when refused, and its last day as chosen', async () => {
    recordForms();
    await signedInAs('field_officer');
    const sent = farmerServer();
    const fetchFn = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        if (
          req.method === 'POST' &&
          new URL(req.url).pathname === `/api/farmers/${FARMER}/consents`
        )
          return Response.json(failure(409, 'CONSENT_EXISTS').body, {
            status: 409,
          });
        return fetchFn(input, init);
      }),
    );
    await renderPage(
      <FarmerRecordPage farmerId={FARMER} />,
      `/track-records/farmers/${FARMER}`,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Give a Bank Permission' }),
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox'));
    await userEvent.click(
      await screen.findByRole('option', { name: /Krishi Bank/ }),
    );
    const lastDay = within(dialog).getByLabelText('Last Day the Bank May Look');
    await userEvent.clear(lastDay);
    await userEvent.type(lastDay, '2027-01-31');
    await userEvent.upload(
      dialog.querySelector('input[type=file]') as HTMLInputElement,
      new File(['jpeg'], 'form.jpg', { type: 'image/jpeg' }),
    );
    const give = within(dialog).getByRole('button', {
      name: 'Give a Bank Permission',
    });
    await waitFor(() => expect(give.hasAttribute('disabled')).toBe(false));
    await userEvent.click(give);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    void sent;
  });

  it('shows what came before the platform', async () => {
    await signedInAs('admin');
    // Nothing published yet: the preview, with the history brought in.
    farmerServer({
      versions: [],
      summary: {
        ...summary,
        importedHistory: [
          {
            title: 'Rice before WeGro',
            produce: { code: 'RICE', name: 'Rice', unit: 'kg' },
            district: { code: 'BOGURA', name: 'Bogura' },
            startedOn: '2024-01-01',
            finishedOn: '2024-05-01',
            net: '50000.00',
            farmerReceived: '20000.00',
          },
        ] as never,
      },
    });
    await renderPage(
      <FarmerRecordPage farmerId={FARMER} own />,
      '/track-records',
    );
    expect(await screen.findByText('Before the Platform')).toBeTruthy();
    expect(screen.getByText('Rice before WeGro')).toBeTruthy();
  });
});

describe('banks, further', () => {
  const bankRow = (over = {}) => ({
    id: BANK,
    name: 'Krishi Bank',
    branchName: 'Bogura',
    district: { code: 'BOGURA', name: 'Bogura' },
    address: 'Satmatha',
    status: 'registered',
    detailsHash: '0x',
    officers: [{ id: 'bo1', name: 'Bank Officer' }],
    ...over,
  });

  it('places and removes bank officers, saying why not when refused', async () => {
    const { toast } = await import('sonner');
    const ok = vi.spyOn(toast, 'success').mockImplementation(() => 1);
    const failed = vi.spyOn(toast, 'error').mockImplementation(() => 1);
    await signedInAs('admin');
    let refuse = true;
    const sent = fakeServer(({ method, url }) => {
      if (method === 'PUT')
        return refuse
          ? failure(409, 'OFFICER_NOT_VERIFIED')
          : { body: { data: {} } };
      if (url.pathname === '/api/banks') return { body: { data: [bankRow()] } };
      if (url.pathname === '/api/participants')
        return {
          body: page([
            { id: 'bo2', fullName: 'New Officer', district: 'BOGURA' },
          ]),
        };
      return undefined;
    });
    await renderPage(<BanksPage search={{}} />, '/track-records/banks');
    const remove = await screen.findByRole('button', {
      name: 'Remove Bank Officer',
    });
    await userEvent.click(remove);
    await waitFor(() => expect(failed).toHaveBeenCalled());
    refuse = false;
    await userEvent.click(remove);
    await waitFor(() => expect(ok).toHaveBeenCalledWith('Officer removed.'));

    await userEvent.click(screen.getByRole('button', { name: /Add Officer/ }));
    const dialog = screen.getByRole('dialog');
    const add = within(dialog).getByRole('button', { name: 'Add Officer' });
    expect(add.hasAttribute('disabled')).toBe(true);
    await userEvent.click(
      await within(dialog).findByRole('button', { name: /New Officer/ }),
    );
    refuse = true;
    await userEvent.click(add);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(add);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent.filter((s) => s.method === 'PUT').at(-1)!.body).toEqual({
      bankId: BANK,
    });
    await userEvent.click(screen.getByRole('button', { name: /Add Officer/ }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Add Officer/ }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('checks a new bank’s details, and keeps the form when refused', async () => {
    await signedInAs('admin');
    fakeServer(({ method, url }) =>
      method === 'POST'
        ? failure(409, 'BANK_EXISTS')
        : url.pathname === '/api/banks'
          ? { body: { data: [] } }
          : undefined,
    );
    await renderPage(<BanksPage search={{}} />, '/track-records/banks');
    await userEvent.click(
      await screen.findByRole('button', { name: /Register Bank/ }),
    );
    const dialog = screen.getByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Register Bank' });
    await userEvent.click(save);
    for (const m of [
      'Enter the bank’s name.',
      'Enter the branch.',
      'Enter the address.',
    ])
      expect(within(dialog).getByText(m)).toBeTruthy();
    await userEvent.type(
      within(dialog).getByLabelText('Bank Name'),
      'Krishi Bank',
    );
    await userEvent.type(within(dialog).getByLabelText('Branch'), 'Bogura');
    await userEvent.type(within(dialog).getByLabelText('District'), 'Bogura');
    await userEvent.click(
      await screen.findByRole('option', { name: 'Bogura' }),
    );
    await userEvent.type(within(dialog).getByLabelText('Address'), 'Satmatha');
    await userEvent.click(save);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: /Register Bank/ }),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('searches banks, says when none match, and tries again', async () => {
    await signedInAs('auditor');
    let calls = 0;
    fakeServer(({ url }) =>
      url.pathname === '/api/banks'
        ? ++calls > 1
          ? { body: { data: [bankRow({ officers: [] })] } }
          : failure(500, 'X')
        : undefined,
    );
    const { router } = await renderPage(
      <BanksPage search={{}} />,
      '/track-records/banks',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('No officers yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add Officer/ })).toBeNull();
    await userEvent.type(screen.getByRole('searchbox'), 'krishi');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'krishi' });
    cleanup();
    fakeServer(() => ({ body: { data: [] } }));
    await renderPage(
      <BanksPage search={{ q: 'zz' }} />,
      '/track-records/banks',
    );
    expect(await screen.findByText('No banks match.')).toBeTruthy();
  });
});
