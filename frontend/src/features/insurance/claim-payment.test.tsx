// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ClaimDto,
  ClaimProofDto,
  WeatherEventDto,
} from '@/api/generated/insurance';
import type { Role } from '@/app/navigation';
import type { MarketSearch } from '@/features/marketplace/market-utils';
import {
  fakeServer,
  recordForms,
  type Reply,
  renderPage,
  signedInAs,
  type Sent,
} from '@/test/render';
import { ClaimPage } from './claim-page';
import { ClaimPaymentsQueue } from './claim-payments-queue';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PROJECT = '11111111-1111-4111-8111-111111111111';
const CLAIM = '22222222-2222-4222-8222-222222222222';

const event: WeatherEventDto = {
  id: '33333333-3333-4333-8333-333333333333',
  district: { code: 'BOGURA', name: 'Bogura' },
  eventType: { code: 'FLOOD', name: 'Flood', nameBn: 'বন্যা' },
  occurredOn: '2026-10-18',
  severity: 'severe',
  notes: null,
  status: 'recorded',
  recordedAt: '2026-10-18T05:00:00.000Z',
  recordedBy: { id: 'a1', name: 'Tania Admin' },
};

/** An approved claim of 25,000, as its insurer ('me') and payment staff see it. */
const claim = (over: Partial<ClaimDto> = {}): ClaimDto => ({
  id: CLAIM,
  project: { id: PROJECT, name: 'Maize in Bogura' },
  event,
  damagePercent: '40.5',
  notes: 'Half the field under water',
  photos: [],
  openedBy: { id: 'o1', name: 'Imran Officer' },
  status: 'approved',
  openedAt: '2026-10-19T05:00:00.000Z',
  assessment: null,
  approvedAmount: '25000.00',
  decidedAt: '2026-10-20T05:00:00.000Z',
  insurer: { id: 'me', name: 'Green Delta' },
  paidAt: null,
  paymentReference: null,
  claimHash: '0x2',
  assessmentHash: null,
  paid: '0.00',
  underReview: '0.00',
  remaining: '25000.00',
  ...over,
});

const proof = (over: Partial<ClaimProofDto> = {}): ClaimProofDto => ({
  id: 'proof-1',
  claimId: CLAIM,
  project: { id: PROJECT, name: 'Maize in Bogura' },
  insurer: { id: 'i1', fullName: 'Green Delta' },
  amount: '10000.00',
  claimTotal: '25000.00',
  claimStatus: 'approved',
  transferredOn: '2026-10-22',
  method: 'bank_deposit',
  bankName: 'SONALI BANK LTD.',
  branchName: 'BOGRA BAZAR',
  districtName: 'BOGRA',
  routingNumber: '200100405',
  reference: 'DEP-55',
  note: null,
  files: [
    {
      id: 'f1',
      mimeType: 'image/jpeg',
      sizeBytes: 3,
      url: '/api/claim-proofs/files/f1',
    },
  ],
  status: 'pending',
  submittedAt: '2026-10-22T08:00:00Z',
  decided: { by: null, at: null },
  rejectionReason: null,
  ...over,
});

/** The claim page, with WeGro's account behind it. */
async function claimPage(
  role: Role,
  c: ClaimDto,
  proofs: ClaimProofDto[] = [],
  write: (s: Sent) => Reply = () => ({ status: 201, body: { data: {} } }),
) {
  await signedInAs(role);
  const sent = fakeServer((s) => {
    const { method, url } = s;
    if (method === 'POST') return write(s);
    if (url.pathname === `/api/insurance/claims/${CLAIM}`)
      return { body: { data: c } };
    if (url.pathname === `/api/insurance/claims/${CLAIM}/proofs`)
      return { body: { data: proofs } };
    if (url.pathname === '/api/payment-accounts') {
      return {
        body: {
          data: [
            {
              id: 'a1',
              bankName: 'UNITED COMMERCIAL BANK LTD.',
              branchName: 'TEJGAON',
              routingNumber: '245264485',
              accountName: 'WEGRO TECHNOLOGIES LTD',
              accountNumber: '1042112000000463',
              active: true,
              sortOrder: 0,
              updatedAt: '2026-10-20T00:00:00.000Z',
            },
          ],
        },
      };
    }
    return undefined;
  });
  await renderPage(<ClaimPage id={CLAIM} />, `/insurance/claims/${CLAIM}`);
  return sent;
}

const upload = () =>
  screen.findByRole('button', { name: /Upload Payment Proof/ });

describe('paying an approved claim, as its insurer', () => {
  it('shows WeGro’s account, the exact amount and what is left', async () => {
    await claimPage('insurer', claim());
    expect(await screen.findByText('WEGRO TECHNOLOGIES LTD')).toBeTruthy();
    expect(screen.getByText('245264485')).toBeTruthy();
    expect(screen.getByText('Exact Transfer Amount')).toBeTruthy();
    expect(
      screen.getByText(/You still need to pay .*25,000.* for this claim\./),
    ).toBeTruthy();
    expect(screen.getByText(/upload the proof\. Accounts checks/)).toBeTruthy();
    expect(await upload()).toBeTruthy();
    // Accounts' move is not the insurer's.
    expect(
      screen.queryByRole('button', { name: 'Record Insurer’s Payment' }),
    ).toBeNull();
  });

  it('sends a proof for the claim, saying what happens next', async () => {
    const forms = recordForms();
    const sent = await claimPage('insurer', claim());
    await userEvent.click(await upload());
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/the claim is paid once accepted payments/),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/clock stops/)).toBeNull();
    const amount = within(dialog).getByLabelText('Amount Transferred');
    await userEvent.clear(amount);
    await userEvent.type(amount, '10000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cash' }));
    await userEvent.upload(
      within(dialog).getByLabelText('Payment Proof'),
      new File(['%PDF-1.4'], 'slip.pdf', { type: 'application/pdf' }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Submit for Review/ }),
    );
    await waitFor(() =>
      expect(sent.find((s) => s.method === 'POST')?.url.pathname).toBe(
        `/api/insurance/claims/${CLAIM}/proofs`,
      ),
    );
    expect(Object.fromEntries(forms.at(-1)!)).toMatchObject({
      amount: '10000',
      method: 'cash',
      files: 'slip.pdf',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('offers no upload when all is sent, and shows why a proof was turned down', async () => {
    await claimPage(
      'insurer',
      claim({ underReview: '15000.00', paid: '10000.00', remaining: '0.00' }),
      [
        proof({ id: 'p2', amount: '15000.00' }),
        proof({
          status: 'rejected',
          rejectionReason: 'Not on the statement',
        }),
      ],
    );
    expect(await screen.findByText('Your Payments')).toBeTruthy();
    expect(screen.getByText(/Not on the statement/)).toBeTruthy();
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Upload/ })).toBeNull();
    expect(screen.queryByText('WEGRO TECHNOLOGIES LTD')).toBeNull();
  });

  it('asks for no proofs and shows no figures to those not sent them', async () => {
    const farmerView = claim({ insurer: { id: 'i9', name: 'Green Delta' } });
    delete farmerView.paid;
    delete farmerView.underReview;
    delete farmerView.remaining;
    const sent = await claimPage('farmer', farmerView);
    expect(await screen.findByText('Approved Amount')).toBeTruthy();
    expect(screen.queryByText('Payment Progress')).toBeNull();
    expect(sent.some((s) => s.url.pathname.endsWith('/proofs'))).toBe(false);
  });
});

describe('a claim’s payment, for others', () => {
  const sentProof = claim({ underReview: '10000.00', remaining: '15000.00' });

  it('lets Accounts record outright only while nothing was sent', async () => {
    await claimPage('accounts', claim({ insurer: { id: 'i1', name: 'GD' } }));
    expect(
      await screen.findByRole('button', { name: 'Record Insurer’s Payment' }),
    ).toBeTruthy();
    expect(screen.getByText(/paid without sending proof/)).toBeTruthy();
    cleanup();
    await claimPage(
      'accounts',
      { ...sentProof, insurer: { id: 'i1', name: 'GD' } },
      [proof()],
    );
    expect(await screen.findByText('Payments Sent')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Record Insurer’s Payment' }),
    ).toBeNull();
  });

  it('lets Accounts accept a proof on the claim itself, with the statement reference', async () => {
    const sent = await claimPage(
      'accounts',
      { ...sentProof, insurer: { id: 'i1', name: 'GD' } },
      [proof()],
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Accept' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/cover the approved amount/)).toBeTruthy();
    const box = within(dialog).getByLabelText<HTMLInputElement>(
      'Statement Reference',
    );
    expect(box.value).toBe('DEP-55');
    await userEvent.clear(box);
    await userEvent.type(box, 'STMT-1');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Accept' }),
    );
    await waitFor(() =>
      expect(
        sent.find((s) => s.url.pathname === '/api/claim-proofs/proof-1/accept')
          ?.body,
      ).toEqual({ paymentReference: 'STMT-1' }),
    );
  });

  it('lets Accounts reject a proof, saying why', async () => {
    const sent = await claimPage(
      'accounts',
      { ...sentProof, insurer: { id: 'i1', name: 'GD' } },
      [proof()],
      () => ({ body: { data: {} } }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Reject' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/can send another/)).toBeTruthy();
    await userEvent.type(
      within(dialog).getByRole('textbox'),
      'Not on the statement',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: /Reject/ }),
    );
    await waitFor(() =>
      expect(
        sent.find((s) => s.url.pathname === '/api/claim-proofs/proof-1/reject')
          ?.body,
      ).toEqual({ reason: 'Not on the statement' }),
    );
  });

  it('shows the auditor the proofs, each linking to its claim, without any move on them', async () => {
    await claimPage(
      'auditor',
      { ...sentProof, insurer: { id: 'i1', name: 'GD' } },
      [proof()],
    );
    expect(await screen.findByText('Payments Sent')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Claim on Maize in Bogura' })
        .getAttribute('href'),
    ).toBe(`/insurance/claims/${CLAIM}`);
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });

  it('hides the progress of a claim paid outright', async () => {
    await claimPage(
      'accounts',
      claim({
        status: 'paid',
        paid: '25000.00',
        remaining: '0.00',
        paidAt: '2026-10-23T05:00:00.000Z',
      }),
    );
    expect(await screen.findByText('Insurer Paid')).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByText('Payment Progress')).toBeNull(),
    );
  });
});

describe('Accounts’ insurer payments page', () => {
  const meta = (total: number, totalPages = 1) => ({
    total,
    page: 1,
    limit: 20,
    totalPages,
  });

  async function queue(
    search: MarketSearch = {},
    over: { proofs?: (s: Sent) => Reply; claims?: () => Reply } = {},
  ) {
    await signedInAs('accounts');
    const sent = fakeServer((s) => {
      if (s.url.pathname === '/api/claim-proofs')
        return (
          over.proofs?.(s) ?? { body: { data: [proof()], meta: meta(1, 2) } }
        );
      if (s.url.pathname === '/api/insurance/claims')
        return (
          over.claims?.() ?? {
            body: {
              data: [claim({ insurer: { id: 'i1', name: 'GD' } })],
              meta: meta(1),
            },
          }
        );
      return undefined;
    });
    const view = await renderPage(
      <ClaimPaymentsQueue search={search} />,
      '/insurance/payments',
    );
    return { sent, ...view };
  }

  const errored: Reply = {
    status: 500,
    body: { statusCode: 500, message: 'Down' },
  };

  it('shows each waiting proof in full, and moves between tabs and pages', async () => {
    const { router, sent } = await queue();
    expect(
      await screen.findByRole('heading', { name: 'Insurer Payments' }),
    ).toBeTruthy();
    expect(await screen.findByText('Green Delta')).toBeTruthy();
    expect(screen.getByText(/BOGRA BAZAR, BOGRA/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /File 1/ })).toBeTruthy();
    expect(
      sent
        .find((s) => s.url.pathname === '/api/claim-proofs')!
        .url.searchParams.get('status'),
    ).toBe('pending');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toEqual({ page: 2 });
    await userEvent.click(screen.getByRole('tab', { name: 'Accepted' }));
    expect(router.state.location.search).toEqual({ tab: 'accepted' });
    await userEvent.type(screen.getByRole('searchbox'), 'green');
    await userEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.state.location.search).toEqual({ q: 'green' });
    await userEvent.click(screen.getByRole('tab', { name: 'Waiting' }));
    expect(router.state.location.search).toEqual({});
  });

  it('says when each list is empty, or nothing matches', async () => {
    const none = () => ({ body: { data: [], meta: meta(0) } });
    await queue({ tab: 'rejected' }, { proofs: none });
    expect(await screen.findByText('No rejected proofs.')).toBeTruthy();
    cleanup();
    await queue({ q: 'nobody' }, { proofs: none });
    expect(await screen.findByText('No Matching People')).toBeTruthy();
    cleanup();
    await queue({ tab: 'claims' }, { claims: none });
    expect(
      await screen.findByText('No claims are awaiting payment.'),
    ).toBeTruthy();
    cleanup();
    await queue({ tab: 'claims', q: 'jute' }, { claims: none });
    expect(await screen.findByText('No Matching People')).toBeTruthy();
  });

  it('says what went wrong on each list, and tries again', async () => {
    await queue({}, { proofs: () => errored });
    expect(
      await screen.findByRole('button', { name: /Try Again/ }),
    ).toBeTruthy();
    cleanup();
    await queue({ tab: 'claims' }, { claims: () => errored });
    expect(
      await screen.findByRole('button', { name: /Try Again/ }),
    ).toBeTruthy();
  });

  it('lists the claims awaiting payment, each opening the claim', async () => {
    const { sent } = await queue({ tab: 'claims' });
    expect(
      (await screen.findByRole('link', { name: /40\.5% damage/ })).getAttribute(
        'href',
      ),
    ).toBe(`/insurance/claims/${CLAIM}`);
    expect(
      sent
        .find((s) => s.url.pathname === '/api/insurance/claims')!
        .url.searchParams.get('paymentDue'),
    ).toBe('true');
    expect(screen.getByRole('searchbox').getAttribute('placeholder')).toMatch(
      /Project title, event type/,
    );
  });
});
