// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fakeServer,
  type Reply,
  renderPage,
  signedInAs,
  type Sent,
} from '@/test/render';
import {
  type ChangesSearch,
  DetailChangeReview,
  DetailChangesList,
} from './detail-changes';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const now = {
  fullName: 'Rahima Begum',
  phone: '+8801712345678',
  nid: '5839204716',
  dateOfBirth: '1980-05-05',
  district: 'BOGURA',
  address: 'Village 1, Shibganj',
};
const change = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  participant: { id: 'u1', name: 'Rahima Begum' },
  role: 'investor',
  status: 'pending',
  createdAt: '2026-10-25T04:00:00Z',
  changedFields: ['phone', 'district'],
  idCheckOutcome: 'flagged',
  idCheck: {
    checks: [
      {
        code: 'NID_DISTRICT',
        result: 'warn',
        reason: 'NID_DISTRICT_DIFFERENT',
        message: 'x',
        params: { issued: 'DHAKA', given: 'KHULNA' },
      },
      { code: 'NAME', result: 'pass', reason: 'NAME_OK', message: 'x' },
    ],
  },
  current: now,
  requested: { ...now, phone: '+8801812345678', district: 'KHULNA' },
  decidedBy: null,
  decidedAt: null,
  reason: null,
  ...over,
});
const meta = (total: number, totalPages = 1) => ({
  total,
  page: 1,
  limit: 20,
  totalPages,
});

describe('the detail changes list', () => {
  async function list(search: ChangesSearch, answer: () => Reply) {
    await signedInAs('admin');
    const sent = fakeServer(({ url }) =>
      url.pathname === '/api/detail-changes' ? answer() : undefined,
    );
    const view = await renderPage(
      <DetailChangesList search={search} />,
      '/people/changes',
    );
    return { sent, ...view };
  }

  it('lists requests with what they change, and moves between views and pages', async () => {
    const { router, sent } = await list({}, () => ({
      body: { data: [change()], meta: meta(21, 2) },
    }));
    const row = await screen.findByRole('link', { name: /Rahima Begum/ });
    expect(row.getAttribute('href')).toBe('/people/changes/c1');
    expect(row.textContent).toContain('Mobile Number');
    expect(row.textContent).toContain('Flagged');
    expect(sent[0]!.url.searchParams.get('status')).toBe('pending');
    await userEvent.click(screen.getByRole('button', { name: 'Approved' }));
    expect(router.state.location.search).toEqual({ status: 'approved' });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
    await userEvent.type(screen.getByRole('searchbox'), 'rahima');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'rahima' });
  });

  it('says when a view is empty or nothing matches, and tries again after an error', async () => {
    await list({ status: 'rejected' }, () => ({
      body: { data: [], meta: meta(0, 0) },
    }));
    expect(await screen.findByText('No rejected changes.')).toBeTruthy();
    cleanup();
    let calls = 0;
    await list({ q: 'nobody' }, () =>
      ++calls > 1
        ? { body: { data: [], meta: meta(0, 0) } }
        : { status: 500, body: { statusCode: 500, code: 'X', message: 'x' } },
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('No Matching People')).toBeTruthy();
  });
});

describe('reviewing a detail change', () => {
  async function review(
    c: ReturnType<typeof change>,
    write: (s: Sent) => Reply = () => ({ body: { data: c } }),
  ) {
    await signedInAs('admin');
    const sent = fakeServer((s) =>
      s.method === 'POST'
        ? write(s)
        : s.url.pathname === '/api/detail-changes/c1'
          ? { body: { data: c } }
          : undefined,
    );
    await renderPage(<DetailChangeReview id="c1" />, '/people/changes/c1');
    await screen.findByRole('heading', { name: 'Rahima Begum' });
    return sent;
  }
  const refused: Reply = {
    status: 409,
    body: {
      statusCode: 409,
      code: 'PHONE_ALREADY_REGISTERED',
      message: 'Taken',
    },
  };

  it('shows each detail now and as asked, marking what changes', async () => {
    await review(change({ current: { ...now, address: null } }));
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('01712345678')).toBeTruthy();
    expect(screen.getByText('01812345678')).toBeTruthy();
    expect(screen.getByText('Khulna')).toBeTruthy();
    expect(screen.getAllByText('changes')).toHaveLength(2);
    expect(
      screen.getByRole('link', { name: 'View Profile' }).getAttribute('href'),
    ).toBe('/people/u1');
    expect(
      screen.getByText(
        'Warnings on the new details: acknowledge them to approve.',
      ),
    ).toBeTruthy();
  });

  it('approves a flagged change only once the warnings are acknowledged', async () => {
    let refuse = true;
    const sent = await review(change(), () =>
      refuse ? refused : { body: { data: change({ status: 'approved' }) } },
    );
    await userEvent.click(screen.getByRole('button', { name: /Approve/ }));
    expect(
      screen.getByText('Tick the box to confirm you reviewed the warnings.'),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'I have reviewed the warnings.' }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Approve/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(screen.getByRole('button', { name: /Approve/ }));
    await waitFor(() =>
      expect(
        sent.filter((s) => s.url.pathname === '/api/detail-changes/c1/approve')
          .length,
      ).toBe(2),
    );
    expect(
      sent
        .filter((s) => s.url.pathname === '/api/detail-changes/c1/approve')
        .at(-1)!.body,
    ).toEqual({ acknowledgeFlags: true });
  });

  it('approves a change with nothing flagged at once', async () => {
    const sent = await review(
      change({ idCheckOutcome: 'passed', idCheck: null }),
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Approve/ }));
    await waitFor(() =>
      expect(sent.find((s) => s.method === 'POST')?.body).toEqual({}),
    );
  });

  it('rejects with a reason they will read, or backs out', async () => {
    let refuse = true;
    const sent = await review(change(), () =>
      refuse ? refused : { body: { data: change({ status: 'rejected' }) } },
    );
    await userEvent.click(screen.getByRole('button', { name: /^Reject/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Reason (Shown to Them)')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Reject/ }));
    const reason = screen.getByLabelText('Reason (Shown to Them)');
    await userEvent.type(reason, 'no');
    const send = screen.getByRole('button', {
      name: 'Reject with This Reason',
    });
    await userEvent.click(send);
    expect(screen.getByText('Write at least 3 characters.')).toBeTruthy();
    await userEvent.type(reason, 't the NID shown');
    await userEvent.click(send);
    expect(await screen.findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(send);
    await waitFor(() =>
      expect(
        sent.find((s) => s.url.pathname === '/api/detail-changes/c1/reject')
          ?.body,
      ).toEqual({ reason: 'not the NID shown' }),
    );
  });

  it('shows who decided, and why, once decided', async () => {
    await review(
      change({
        status: 'rejected',
        decidedBy: { id: 'a1', name: 'Admin Ayesha' },
        decidedAt: '2026-10-26T04:00:00Z',
        reason: 'Blurry photo',
      }),
    );
    expect(screen.getByText(/Rejected by Admin Ayesha/)).toBeTruthy();
    expect(screen.getByText(/Blurry photo/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
  });

  it('says what went wrong, and tries again', async () => {
    await signedInAs('admin');
    let calls = 0;
    fakeServer(() =>
      ++calls > 1
        ? { body: { data: change() } }
        : { status: 500, body: { statusCode: 500, code: 'X', message: 'x' } },
    );
    await renderPage(<DetailChangeReview id="c1" />, '/people/changes/c1');
    expect(
      (
        await screen.findByRole('link', { name: /Detail Change Requests/ })
      ).getAttribute('href'),
    ).toBe('/people/changes');
    await userEvent.click(screen.getByRole('button', { name: /Try Again/ }));
    expect(
      await screen.findByRole('heading', { name: 'Rahima Begum' }),
    ).toBeTruthy();
  });
});
