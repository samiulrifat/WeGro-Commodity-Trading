// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ConsentDto,
  TrackRecordSummaryDto,
} from '@/api/generated/track-record';
import { fakeServer, renderPage, signedInAs } from '@/test/render';
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

/** jsdom's File and Node's FormData do not mix: record what the app appends. */
function recordForms(): Array<Array<[string, string]>> {
  const forms: Array<Array<[string, string]>> = [];
  vi.stubGlobal(
    'FormData',
    class {
      entries: Array<[string, string]> = [];
      constructor() {
        forms.push(this.entries);
      }
      append(key: string, value: string | File) {
        this.entries.push([
          key,
          typeof value === 'string' ? value : value.name,
        ]);
      }
    },
  );
  return forms;
}

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
