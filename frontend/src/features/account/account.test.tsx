// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyDetailsDto } from '@/api/generated/participants';
import type { Role } from '@/app/navigation';
import { store } from '@/store/store';
import {
  fakeServer,
  type Reply,
  renderPage,
  type Sent,
  signedInAs,
} from '@/test/render';
import { EmailCard } from './email-card';
import { MyDetails } from './my-details';
import {
  LedgerAccountCard,
  PasswordCard,
  SignOutEverywhereCard,
} from './security';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const current = {
  fullName: 'Rahima Begum',
  phone: '+8801712345678',
  nid: '1234567890',
  dateOfBirth: '1990-04-02',
  district: 'BOGURA',
  address: 'Sherpur, Bogura',
};
const mine = (over: Partial<MyDetailsDto> = {}): MyDetailsDto => ({
  current,
  change: null,
  needsApproval: true,
  ...over,
});
const failure = (status: number, code: string): Reply => ({
  status,
  body: { statusCode: status, code, message: code },
});
const posted = (sent: Sent[], path: string, method = 'POST') =>
  sent.filter((s) => s.method === method && s.url.pathname === path);

async function show(
  role: Role,
  ui: React.ReactNode,
  answer: (s: Sent) => Reply | undefined,
) {
  await signedInAs(role);
  const sent = fakeServer(answer);
  const view = await renderPage(ui, '/account');
  return { sent, ...view };
}

async function toasts() {
  const { toast } = await import('sonner');
  return {
    ok: vi.spyOn(toast, 'success').mockImplementation(() => 1),
    failed: vi.spyOn(toast, 'error').mockImplementation(() => 1),
  };
}

describe('my details', () => {
  const details = (
    role: Role,
    read: () => Reply,
    write: (s: Sent) => Reply | undefined = () => undefined,
  ) =>
    show(role, <MyDetails />, (s) =>
      s.method === 'GET' && s.url.pathname === '/api/me/details'
        ? read()
        : write(s),
    );

  it('shows them, and sends a change for approval', async () => {
    const { ok } = await toasts();
    const { sent } = await details(
      'investor',
      () => ({ body: { data: mine() } }),
      (s) =>
        s.url.pathname === '/api/me/details/change'
          ? { body: { data: mine({ change: null }) } }
          : undefined,
    );
    expect(
      await screen.findByText('An admin checks a change before it applies.'),
    ).toBeTruthy();
    expect(screen.getByText('01712345678')).toBeTruthy();
    expect(screen.getByText('Bogura')).toBeTruthy();
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Edit My Details' })[0]!,
    );
    const name = screen.getByLabelText('Full Name');
    await userEvent.clear(name);
    await userEvent.click(
      screen.getByRole('button', { name: 'Submit for Approval' }),
    );
    expect(screen.getByText('Fill this in.')).toBeTruthy();
    await userEvent.type(name, 'Rahima Khatun');
    await userEvent.click(
      screen.getByRole('button', { name: 'Submit for Approval' }),
    );
    await waitFor(() =>
      expect(ok).toHaveBeenCalledWith(
        'Your change is sent. You will be notified when it is decided.',
      ),
    );
    expect(posted(sent, '/api/me/details/change')[0]!.body).toMatchObject({
      fullName: 'Rahima Khatun',
    });
  });

  it('confirms a new number by its code, and keeps the code apart from other refusals', async () => {
    let refusal: Reply | null = failure(400, 'CODE_INVALID');
    const { sent } = await details(
      'admin',
      () => ({
        body: {
          data: mine({ current: { ...current, phone: '+8801711111111' } }),
        },
      }),
      (s) => {
        if (s.url.pathname === '/api/me/details/phone-code')
          return {
            body: { data: { resendAfterSeconds: 0, expiresInSeconds: 300 } },
          };
        if (s.url.pathname === '/api/me/details/change') {
          const now = refusal;
          refusal =
            refusal?.body &&
            (refusal.body as { code: string }).code === 'CODE_INVALID'
              ? failure(409, 'PHONE_ALREADY_REGISTERED')
              : null;
          return now ?? { body: { data: mine() } };
        }
        return undefined;
      },
    );
    // Staff: changed through the super admin.
    expect(
      await screen.findByText(
        'The super admin checks a change before it applies.',
      ),
    ).toBeTruthy();
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Edit My Details' })[0]!,
    );
    const phone = screen.getByLabelText('Mobile Number');
    await userEvent.clear(phone);
    await userEvent.type(phone, '01812345678');
    expect(
      screen.getByText(
        'Confirm the new number: we send it a 6-digit code by SMS.',
      ),
    ).toBeTruthy();
    const submit = screen.getByRole('button', { name: 'Submit for Approval' });
    await userEvent.click(submit);
    expect(
      screen.getByText('Send a code first, then enter it here.'),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Send Code' }));
    await userEvent.type(await screen.findByLabelText('SMS Code'), '123456');
    // A wrong code shows under the code box …
    await userEvent.click(submit);
    expect(await screen.findByRole('alert')).toBeTruthy();
    // … a taken number under the form.
    await userEvent.click(submit);
    await waitFor(() =>
      expect(posted(sent, '/api/me/details/change')).toHaveLength(2),
    );
    await userEvent.click(submit);
    await waitFor(() =>
      expect(screen.queryByLabelText('Mobile Number')).toBeNull(),
    );
    expect(posted(sent, '/api/me/details/change').at(-1)!.body).toMatchObject({
      phone: '01812345678',
      phoneCode: '123456',
    });
    expect(posted(sent, '/api/me/details/phone-code')[0]!.body).toEqual({
      phone: '01812345678',
    });
  });

  it('saves at once for the super admin, and goes back on Cancel', async () => {
    const { ok } = await toasts();
    await details(
      'super_admin',
      () => ({
        body: {
          data: mine({
            needsApproval: false,
            current: { fullName: 'Super Admin', phone: '+8801711000000' },
          }),
        },
      }),
      (s) =>
        s.url.pathname === '/api/me/details/change'
          ? { body: { data: mine({ needsApproval: false }) } }
          : undefined,
    );
    expect(await screen.findByText('Your changes apply at once.')).toBeTruthy();
    const edit = screen.getAllByRole('button', { name: 'Edit My Details' })[0]!;
    await userEvent.click(edit);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Full Name')).toBeNull();
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Edit My Details' })[0]!,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(ok).toHaveBeenCalledWith('Your details are saved.'),
    );
  });

  it('shows a change waiting, what it asks for, and takes it back', async () => {
    const { ok, failed } = await toasts();
    let refuse = true;
    const { sent } = await details(
      'investor',
      () => ({
        body: {
          data: mine({
            change: {
              id: 'c1',
              status: 'pending',
              requested: {
                ...current,
                address: 'Gabtali, Bogura',
                nid: null as never,
              },
              changedFields: ['address', 'nid'],
              createdAt: '2026-10-30T04:00:00Z',
            },
          }),
        },
      }),
      (s) =>
        s.method === 'DELETE'
          ? refuse
            ? failure(409, 'NOTHING_PENDING')
            : { body: { data: mine() } }
          : undefined,
    );
    expect(await screen.findByText(/Pending approval since/)).toBeTruthy();
    expect(screen.getByText('Gabtali, Bogura')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    const withdraw = screen.getByRole('button', { name: 'Withdraw' });
    await userEvent.click(withdraw);
    await waitFor(() => expect(failed).toHaveBeenCalled());
    refuse = false;
    await userEvent.click(withdraw);
    await waitFor(() =>
      expect(ok).toHaveBeenCalledWith('Your change is taken back.'),
    );
    expect(posted(sent, '/api/me/details/change', 'DELETE')).toHaveLength(2);

    // Editing again starts from what is waiting.
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Edit Again' })[0]!,
    );
    expect((screen.getByLabelText('Address') as HTMLInputElement).value).toBe(
      'Gabtali, Bogura',
    );
    expect(
      screen.getByText('Sending a new change replaces the one waiting.'),
    ).toBeTruthy();
  });

  it('says how the last change ended', async () => {
    await details('investor', () => ({
      body: {
        data: mine({
          change: {
            id: 'c1',
            status: 'rejected',
            requested: current,
            changedFields: ['address'],
            createdAt: '2026-10-30T04:00:00Z',
            decidedAt: '2026-10-31T04:00:00Z',
            reason: 'Blurry NID',
          },
        }),
      },
    }));
    expect(await screen.findByText(/was not approved/)).toBeTruthy();
    expect(screen.getByText('Reason: Blurry NID')).toBeTruthy();
    cleanup();

    await details('investor', () => ({
      body: {
        data: mine({
          change: {
            id: 'c1',
            status: 'rejected',
            requested: current,
            changedFields: ['address'],
            createdAt: '2026-10-30T04:00:00Z',
            decidedAt: '2026-10-31T04:00:00Z',
          },
        }),
      },
    }));
    expect(await screen.findByText(/was not approved/)).toBeTruthy();
    expect(screen.queryByText(/Reason:/)).toBeNull();
    cleanup();

    await details('investor', () => ({
      body: {
        data: mine({
          change: {
            id: 'c1',
            status: 'approved',
            requested: current,
            changedFields: ['address'],
            createdAt: '2026-10-30T04:00:00Z',
            decidedAt: '2026-10-31T04:00:00Z',
          },
        }),
      },
    }));
    expect(await screen.findByText(/was approved on/)).toBeTruthy();
    cleanup();

    // Withdrawn: nothing to say about it.
    await details('investor', () => ({
      body: {
        data: mine({
          change: {
            id: 'c1',
            status: 'withdrawn' as never,
            requested: current,
            changedFields: ['address'],
            createdAt: '2026-10-30T04:00:00Z',
          },
        }),
      },
    }));
    expect(await screen.findByText('Sherpur, Bogura')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says why they cannot be loaded, and tries again', async () => {
    let calls = 0;
    await details('investor', () =>
      ++calls > 1 ? { body: { data: mine() } } : failure(500, 'X'),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Try Again/ }),
    );
    expect(await screen.findByText('Sherpur, Bogura')).toBeTruthy();
  });
});

describe('the email address', () => {
  const card = (
    email: string | null,
    write: (s: Sent) => Reply | undefined = () => ({ body: { data: {} } }),
  ) =>
    show('investor', <EmailCard />, (s) =>
      s.method === 'GET' && s.url.pathname === '/api/auth/me'
        ? {
            body: {
              data: { id: 'me', role: 'investor', fullName: 'R', email },
            },
          }
        : write(s),
    );

  it('adds one once its code is confirmed', async () => {
    const { ok } = await toasts();
    let refuse = true;
    const { sent } = await card(null, (s) => {
      if (s.url.pathname === '/api/auth/me/email/code')
        return {
          body: { data: { resendAfterSeconds: 0, expiresInSeconds: 600 } },
        };
      if (s.url.pathname === '/api/auth/me/email')
        return refuse ? failure(400, 'CODE_INVALID') : { body: { data: {} } };
      return undefined;
    });
    expect(await screen.findByText('No email address yet')).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Add Email Address' }),
    );
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    await userEvent.click(confirm);
    expect(
      screen.getByText('Enter an email address, such as name@example.com.'),
    ).toBeTruthy();
    await userEvent.type(
      screen.getByLabelText('Email'),
      ' Rahima@Example.com ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send Code' }));
    await userEvent.type(await screen.findByLabelText('Email Code'), '654321');
    await userEvent.click(confirm);
    expect(await screen.findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(ok).toHaveBeenCalledWith(
        'Your email address is confirmed. You can sign in with it.',
      ),
    );
    expect(posted(sent, '/api/auth/me/email')[0]!.body).toEqual({
      email: 'rahima@example.com',
      code: '654321',
    });
    expect(posted(sent, '/api/auth/me/email/code')[0]!.body).toEqual({
      email: 'rahima@example.com',
    });
  });

  it('changes or removes the one they have', async () => {
    const { ok, failed } = await toasts();
    let refuse = true;
    await card('rahima@example.com', (s) =>
      s.method === 'DELETE'
        ? refuse
          ? failure(409, 'EMAIL_ONLY_SIGN_IN')
          : { body: { data: {} } }
        : undefined,
    );
    expect(await screen.findByText('rahima@example.com')).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Change Email Address' }),
    );
    expect(screen.getByLabelText('New Email Address')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const remove = screen.getByRole('button', { name: 'Remove' });
    await userEvent.click(remove);
    await waitFor(() => expect(failed).toHaveBeenCalled());
    refuse = false;
    await userEvent.click(remove);
    await waitFor(() =>
      expect(ok).toHaveBeenCalledWith('Your email address is removed.'),
    );
  });
});

describe('security', () => {
  it('changes the password, staying signed in here', async () => {
    const { ok } = await toasts();
    let refuse = true;
    const { sent } = await show('investor', <PasswordCard />, (s) =>
      s.url.pathname === '/api/auth/change-password'
        ? refuse
          ? failure(401, 'BAD_CREDENTIALS')
          : {
              body: {
                data: {
                  accessToken: 'renewed',
                  tokenType: 'Bearer',
                  expiresIn: 900,
                  mustChangePassword: false,
                  user: {
                    id: 'me',
                    role: 'investor',
                    status: 'verified',
                    language: 'en',
                  },
                },
              },
            }
        : undefined,
    );
    const save = screen.getByRole('button', { name: 'Change Password' });
    await userEvent.click(save);
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Current Password'), 'old-one');
    await userEvent.type(
      screen.getByLabelText('New Password'),
      'a-new-password',
    );
    await userEvent.type(
      screen.getByLabelText('Confirm New Password'),
      'a-new-password',
    );
    await userEvent.click(save);
    expect(await screen.findByRole('alert')).toBeTruthy();
    refuse = false;
    await userEvent.click(save);
    await waitFor(() =>
      expect(ok).toHaveBeenCalledWith(
        'Your password is changed. Other devices are signed out.',
      ),
    );
    expect(store.getState().session.accessToken).toBe('renewed');
    expect(
      (screen.getByLabelText('Current Password') as HTMLInputElement).value,
    ).toBe('');
    expect(posted(sent, '/api/auth/change-password').at(-1)!.body).toEqual({
      currentPassword: 'old-one',
      newPassword: 'a-new-password',
    });
  });

  it('shows staff their ledger address to copy, if the clipboard allows', async () => {
    const { ok } = await toasts();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    await show('admin', <LedgerAccountCard />, (s) =>
      s.url.pathname === '/api/auth/me'
        ? {
            body: {
              data: {
                id: 'me',
                role: 'admin',
                fullName: 'A',
                account: '0xabc',
              },
            },
          }
        : undefined,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Copy Address/ }),
    );
    expect(writeText).toHaveBeenCalledWith('0xabc');
    expect(ok).toHaveBeenCalledWith('Address copied.');
    writeText.mockImplementation(() => Promise.reject(new Error('denied')));
    await userEvent.click(screen.getByRole('button', { name: /Copy Address/ }));
    expect(ok).toHaveBeenCalledTimes(1);
    cleanup();

    await show('investor', <LedgerAccountCard />, (s) =>
      s.url.pathname === '/api/auth/me'
        ? { body: { data: { id: 'me', role: 'investor', fullName: 'I' } } }
        : undefined,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Ledger Account')).toBeNull();
  });

  it('signs out everywhere after asking, or says why not', async () => {
    const { failed } = await toasts();
    let refuse = true;
    const { router, sent } = await show(
      'investor',
      <SignOutEverywhereCard />,
      (s) =>
        s.url.pathname === '/api/auth/logout-all'
          ? refuse
            ? failure(503, 'X')
            : { body: {} }
          : undefined,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Sign Out Everywhere/ }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(
        'You will need to sign in again on each of them.',
      ),
    ).toBeTruthy();
    const go = within(dialog).getByRole('button', {
      name: /Sign Out Everywhere/,
    });
    await userEvent.click(go);
    await waitFor(() => expect(failed).toHaveBeenCalled());
    refuse = false;
    await userEvent.click(go);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/sign-in'),
    );
    expect(posted(sent, '/api/auth/logout-all')).toHaveLength(2);
    expect(store.getState().session.status).toBe('signedOut');
  });
});
