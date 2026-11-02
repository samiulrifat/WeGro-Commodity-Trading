// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParticipantDetailDto } from '@/api/generated/participants';
import type { Role } from '@/app/navigation';
import {
  fakeServer,
  type Reply,
  renderPage,
  signedInAs,
  type Sent,
} from '@/test/render';
import { PersonPage } from './person-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const warn = {
  code: 'NID_DISTRICT',
  result: 'warn',
  reason: 'NID_DISTRICT_DIFFERENT',
  message: 'NID was issued in a different district from the one given',
  params: { issued: 'DHAKA', given: 'BOGURA' },
};
const person = (
  over: Partial<ParticipantDetailDto> = {},
): ParticipantDetailDto =>
  ({
    id: 'u1',
    role: 'farmer',
    status: 'pending',
    chainState: 'confirmed',
    fullName: 'Rahima Begum',
    phone: '+8801712345678',
    email: null,
    nid: '5839204716',
    dateOfBirth: '1980-05-05',
    district: 'BOGURA',
    address: 'Village 1, Shibganj',
    masked: false,
    idCheck: { checks: [warn] },
    idCheckOutcome: 'flagged',
    selfRegistered: false,
    registeredBy: { id: 'fo1', name: 'Officer Kamal' },
    fieldOfficer: { id: 'fo1', name: 'Officer Kamal' },
    statusChangedAt: null,
    createdAt: '2026-10-18T04:00:00Z',
    account: '0x00000000000000000000000000000000000000a1',
    revocation: null,
    statusReason: null,
    accessRevoked: false,
    ...over,
  }) as ParticipantDetailDto;

const refused: Reply = {
  status: 409,
  body: {
    statusCode: 409,
    code: 'PARTICIPANT_STATUS_INVALID',
    message: 'Not now',
  },
};

async function open(
  viewer: Role,
  p: ParticipantDetailDto,
  write: (s: Sent) => Reply = () => ({ body: { data: p } }),
  more: (s: Sent) => Reply | undefined = () => undefined,
) {
  await signedInAs(viewer);
  const sent = fakeServer((s) => {
    if (s.method !== 'GET') return write(s);
    if (s.url.pathname === '/api/participants/u1') return { body: { data: p } };
    if (s.url.pathname === '/api/participants/u1/bank-account')
      return { body: { data: { verified: null, pending: null, history: [] } } };
    return more(s);
  });
  const view = await renderPage(<PersonPage id="u1" />, '/people/u1');
  await screen.findByRole('heading', { name: p.fullName });
  return { sent, ...view };
}

const posted = (sent: Sent[], path: string) =>
  sent.filter((s) => s.method !== 'GET' && s.url.pathname === path).at(-1);

describe('a person’s page', () => {
  it('shows the details, the ID check, the registration and the ledger record', async () => {
    await open('admin', person({ statusChangedAt: '2026-10-19T04:00:00Z' }));
    expect(screen.getByText('01712345678')).toBeTruthy();
    expect(screen.getByText('5839204716')).toBeTruthy();
    expect(screen.getByText('Village 1, Shibganj')).toBeTruthy();
    expect(screen.getAllByText('Officer Kamal')).toHaveLength(2);
    expect(screen.getByText('Status Last Changed')).toBeTruthy();
    expect(
      screen.getByText('0x00000000000000000000000000000000000000a1'),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'People' }).getAttribute('href'),
    ).toBe('/people');
  });

  it('hides what an auditor need not see, and says how a self sign-up registered', async () => {
    await open(
      'auditor',
      person({
        role: 'investor',
        status: 'verified',
        masked: true,
        phone: '+88017•••••678',
        nid: null,
        address: null,
        selfRegistered: true,
        idCheck: null,
        idCheckOutcome: 'passed',
      } as never),
    );
    expect(
      screen.getByText('Partly hidden: auditors see only what they need.'),
    ).toBeTruthy();
    expect(screen.getByText('+88017•••••678')).toBeTruthy();
    expect(screen.getByText('Self-Registered')).toBeTruthy();
    expect(screen.getByText('Every rule passed.')).toBeTruthy();
    // Auditors read; they do not act.
    expect(screen.queryByRole('button', { name: /Revoke Access/ })).toBeNull();
  });

  it('says why access was revoked, or a registration rejected, and what waits for the ledger', async () => {
    await open(
      'admin',
      person({
        status: 'rejected',
        accessRevoked: true,
        revocation: {
          reason: 'resigned',
          by: { id: 'a1', name: 'Admin Ayesha' },
          at: '2026-10-20T04:00:00Z',
          note: 'Moved abroad',
        },
      } as never),
    );
    expect(screen.getByText(/Resigned · revoked by Admin Ayesha/)).toBeTruthy();
    expect(screen.getByText('Moved abroad')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Restore Access/ })).toBeTruthy();
    cleanup();

    const { sent } = await open(
      'admin',
      person({
        status: 'rejected',
        statusReason: 'Photo does not match',
        chainState: 'submitted',
        idCheckOutcome: null,
        idCheck: null,
      } as never),
    );
    expect(screen.getByText('Photo does not match')).toBeTruthy();
    expect(screen.getByText('Awaiting Ledger Confirmation')).toBeTruthy();
    expect(screen.getByText('No ID check was recorded.')).toBeTruthy();
    const alert = screen
      .getByText('Awaiting Ledger Confirmation')
      .closest('[role="status"], [role="alert"]') as HTMLElement;
    await userEvent.click(
      within(alert).getByRole('button', { name: /Sync with Ledger/ }),
    );
    await waitFor(() =>
      expect(posted(sent, '/api/participants/u1/sync')).toBeTruthy(),
    );
  });

  it('checks the record against the ledger', async () => {
    let answer: Reply = { body: { data: { matches: true, mismatches: [] } } };
    await open('admin', person(), undefined, (s) =>
      s.url.pathname === '/api/participants/u1/integrity' ? answer : undefined,
    );
    const check = screen.getByRole('button', { name: 'Verify Against Ledger' });
    await userEvent.click(check);
    expect(
      await screen.findByText('The stored details match the ledger.'),
    ).toBeTruthy();
    answer = {
      body: { data: { matches: false, mismatches: ['role', 'somethingNew'] } },
    };
    await userEvent.click(check);
    expect(await screen.findByText('the role, somethingNew')).toBeTruthy();
    answer = {
      status: 503,
      body: {
        statusCode: 503,
        code: 'LEDGER_UNAVAILABLE',
        message: 'Ledger down',
      },
    };
    await userEvent.click(check);
    expect(
      await screen.findByText(
        'The ledger cannot be reached right now. Try again shortly.',
      ),
    ).toBeTruthy();
    // The earlier answer goes: it is not what the last check found.
    expect(screen.queryByText('the role, somethingNew')).toBeNull();
  });

  it('says what went wrong, and tries again', async () => {
    await signedInAs('field_officer');
    let calls = 0;
    fakeServer(({ url }) =>
      url.pathname === '/api/participants/u1'
        ? ++calls > 1
          ? { body: { data: person() } }
          : { status: 500, body: { statusCode: 500, code: 'X', message: 'x' } }
        : undefined,
    );
    await renderPage(<PersonPage id="u1" />, '/people/u1');
    expect(
      (await screen.findByRole('link', { name: /My Farmers/ })).getAttribute(
        'href',
      ),
    ).toBe('/people');
    await userEvent.click(screen.getByRole('button', { name: /Try Again/ }));
    expect(
      await screen.findByRole('heading', { name: 'Rahima Begum' }),
    ).toBeTruthy();
    // Field officers do not see the ledger card.
    expect(screen.queryByText('Verify Against Ledger')).toBeNull();
  });
});

describe('what staff can do to a person', () => {
  it('verifies a flagged registration only once the warnings are acknowledged', async () => {
    let refuse = true;
    const { sent } = await open('admin', person(), () =>
      refuse ? refused : { body: { data: person() } },
    );
    await userEvent.click(screen.getByRole('button', { name: /^Verify$/ }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        /This happens when someone lives away from home/,
      ),
    ).toBeTruthy();
    const verify = within(dialog).getByRole('button', { name: 'Verify' });
    await userEvent.click(verify);
    expect(
      within(dialog).getByText(
        'Tick the box to confirm you reviewed the warnings.',
      ),
    ).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole('checkbox', {
        name: 'I have reviewed the warnings.',
      }),
    );
    await userEvent.click(verify);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(verify);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(posted(sent, '/api/participants/u1/verify')!.body).toEqual({
      acknowledgeFlags: true,
    });
  });

  it('restores revoked access, with nothing to acknowledge when nothing was flagged', async () => {
    const { sent } = await open(
      'admin',
      person({
        status: 'rejected',
        accessRevoked: true,
        idCheckOutcome: 'passed',
      } as never),
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Restore Access/ }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Restore Access' }),
    );
    await waitFor(() =>
      expect(posted(sent, '/api/participants/u1/verify')!.body).toEqual({}),
    );
  });

  it('rejects a registration with a reason of at least three characters', async () => {
    let refuse = true;
    const { sent } = await open('admin', person(), () =>
      refuse ? refused : { body: { data: person() } },
    );
    await userEvent.click(screen.getByRole('button', { name: /^Reject$/ }));
    const dialog = await screen.findByRole('dialog');
    const reason = within(dialog).getByLabelText('Reason');
    await userEvent.type(reason, 'no');
    const reject = within(dialog).getByRole('button', { name: 'Reject' });
    await userEvent.click(reject);
    expect(
      within(dialog).getByText('Write at least 3 characters.'),
    ).toBeTruthy();
    await userEvent.type(reason, ' photo');
    await userEvent.click(reject);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(reject);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(posted(sent, '/api/participants/u1/reject')!.body).toEqual({
      reason: 'no photo',
    });
    await userEvent.click(screen.getByRole('button', { name: /^Reject$/ }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  const fromMore = async (item: string) => {
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: new RegExp(item) }),
    );
    return screen.findByRole('dialog');
  };

  it('resets the password and shows it once, saying whether the SMS went out', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    let refuse = true;
    const { sent } = await open('admin', person({ status: 'verified' }), (s) =>
      s.url.pathname.endsWith('/reset-password')
        ? refuse
          ? refused
          : {
              body: {
                data: { temporaryPassword: 'Tmp-7Xq-42', smsSent: false },
              },
            }
        : { body: { data: person() } },
    );
    let dialog = await fromMore('Reset Password');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Reset Password' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Reset Password' }),
    );
    expect(await within(dialog).findByText('Tmp-7Xq-42')).toBeTruthy();
    expect(within(dialog).getByText('SMS Not Sent')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: /Copy/ }));
    expect(writeText).toHaveBeenCalledWith('Tmp-7Xq-42');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(posted(sent, '/api/participants/u1/reset-password')).toBeTruthy();

    // Reopened, it asks again rather than showing the old password.
    dialog = await fromMore('Reset Password');
    expect(within(dialog).queryByText('Tmp-7Xq-42')).toBeNull();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );
  });

  it('replaces the key, and keeps the dialog when the ledger refuses', async () => {
    let refuse = true;
    const { sent } = await open('admin', person({ status: 'verified' }), () =>
      refuse ? refused : { body: { data: person() } },
    );
    const dialog = await fromMore('Replace Key');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Replace Key' }),
    );
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Replace Key' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(posted(sent, '/api/participants/u1/replace-key')).toBeTruthy();
    await fromMore('Replace Key');
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('assigns a farmer another field officer, never the current one', async () => {
    let refuse = true;
    const { sent } = await open(
      'admin',
      person({ status: 'verified' }),
      () => (refuse ? refused : { body: { data: person() } }),
      (s) =>
        s.url.pathname === '/api/participants'
          ? {
              body: {
                data: [
                  { id: 'fo1', fullName: 'Officer Kamal', district: 'BOGURA' },
                  { id: 'fo2', fullName: 'Officer Rina', district: 'BOGURA' },
                ],
                meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
              },
            }
          : undefined,
    );
    const dialog = await fromMore('Assign Field Officer');
    expect(within(dialog).getByText('Now: Officer Kamal.')).toBeTruthy();
    const assign = within(dialog).getByRole('button', {
      name: 'Assign Field Officer',
    });
    expect(assign.hasAttribute('disabled')).toBe(true);
    expect(
      within(dialog).queryByRole('button', { name: /Officer Kamal/ }),
    ).toBeNull();
    await userEvent.click(
      await within(dialog).findByRole('button', { name: /Officer Rina/ }),
    );
    await userEvent.click(assign);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(assign);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(posted(sent, '/api/participants/u1/field-officer')!.body).toEqual({
      officerId: 'fo2',
    });
  });

  it('brings the record in line with the ledger from More, or says why not', async () => {
    const { toast } = await import('sonner');
    const ok = vi.spyOn(toast, 'success').mockImplementation(() => 1);
    const failed = vi.spyOn(toast, 'error').mockImplementation(() => 1);
    let refuse = true;
    await open('admin', person({ status: 'verified' }), () =>
      refuse ? refused : { body: { data: person() } },
    );
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /Sync with Ledger/ }),
    );
    await waitFor(() => expect(failed).toHaveBeenCalled());
    refuse = false;
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /Sync with Ledger/ }),
    );
    await waitFor(() =>
      expect(ok).toHaveBeenCalledWith('In line with the ledger.'),
    );
    ok.mockRestore();
    failed.mockRestore();
  });

  it('syncs a registration still waiting for the ledger, saying why when it cannot', async () => {
    const { toast } = await import('sonner');
    const ok = vi.spyOn(toast, 'success').mockImplementation(() => 1);
    const failed = vi.spyOn(toast, 'error').mockImplementation(() => 1);
    let refuse = true;
    await open('admin', person({ chainState: 'submitted' }), () =>
      refuse ? refused : { body: { data: person() } },
    );
    const sync = screen.getByRole('button', { name: /Sync with Ledger/ });
    await userEvent.click(sync);
    await waitFor(() => expect(failed).toHaveBeenCalled());
    refuse = false;
    await userEvent.click(sync);
    await waitFor(() =>
      expect(ok).toHaveBeenCalledWith('In line with the ledger.'),
    );
    ok.mockRestore();
    failed.mockRestore();
  });

  it('closes an action on Escape', async () => {
    await open('admin', person({ status: 'verified' }));
    await fromMore('Reset Password');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
