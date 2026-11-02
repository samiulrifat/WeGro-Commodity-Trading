// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, signedInAs } from '@/test/render';
import { ConfirmCodeBox } from './phone-code';
import { useConfirmCode } from './use-confirm-code';

afterEach(cleanup);

type Request = Parameters<typeof useConfirmCode>[0];

/** A number field with the box under it, as the forms that use it have. */
function Harness({ request, email }: { request: Request; email?: boolean }) {
  const confirm = useConfirmCode(request);
  const [to, setTo] = useState('01712345678');
  const [tried, setTried] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setTo('01812345678')}>
        Other Number
      </button>
      <button type="button" onClick={() => setTried(true)}>
        Submit
      </button>
      <ConfirmCodeBox
        to={to}
        shown={to}
        confirm={confirm}
        showProblem={tried}
        idPrefix="t"
        needed="We text a code to this number."
        email={email}
      />
    </>
  );
}

async function box(request: Request, email?: boolean) {
  await signedInAs('investor');
  await renderPage(<Harness request={request} email={email} />, '/account');
}

describe('confirming a number with a code', () => {
  it('asks for a code first, then wants its 6 digits, Bengali ones too', async () => {
    let answer!: (v: Awaited<ReturnType<Request>>) => void;
    const request = vi.fn<Request>(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    await box(request);
    expect(screen.getByText('We text a code to this number.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByRole('alert').textContent).toBe(
      'Send a code first, then enter it here.',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Send Code' }));
    const sending = screen.getByRole('button', { name: 'Sending…' });
    expect(sending.hasAttribute('disabled')).toBe(true);
    expect(request).toHaveBeenCalledWith('01712345678');
    answer({ resendAfterSeconds: 0, expiresInSeconds: 300 });

    expect(
      await screen.findByText(
        'A code is on its way to 01712345678. It works for 5 minutes.',
      ),
    ).toBeTruthy();
    const code = screen.getByLabelText('SMS Code');
    await userEvent.type(code, '12');
    expect(screen.getByRole('alert').textContent).toBe(
      'Enter the 6 digits of the code.',
    );
    await userEvent.clear(code);
    await userEvent.type(code, '১২৩৪৫৬');
    expect(screen.queryByRole('alert')).toBeNull();

    // Asked again at once: the code typed so far goes.
    await userEvent.click(screen.getByRole('button', { name: 'Resend Code' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    answer({ resendAfterSeconds: 0, expiresInSeconds: 300 });
    await waitFor(() =>
      expect(
        (screen.getByLabelText('SMS Code') as HTMLInputElement).value,
      ).toBe(''),
    );
  });

  it('makes them wait before asking again, and starts over for another number', async () => {
    await box(async () => ({ resendAfterSeconds: 60, expiresInSeconds: 600 }));
    await userEvent.click(screen.getByRole('button', { name: 'Send Code' }));
    expect(
      await screen.findByText('You can ask for a new code in 60 seconds.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resend Code' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Other Number' }));
    expect(screen.getByRole('button', { name: 'Send Code' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByRole('alert').textContent).toBe(
      'Send a code first, then enter it here.',
    );
  });

  it('says why no code was sent, in place of what is missing', async () => {
    await box(() =>
      Promise.reject({
        status: 429,
        data: {
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Too many codes',
          code: 'TOO_MANY_REQUESTS',
        },
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send Code' }));
    await waitFor(() =>
      expect(
        screen.queryByText('Send a code first, then enter it here.'),
      ).toBeNull(),
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Send Code' })).toBeTruthy();
  });

  it('speaks of an email code for an address', async () => {
    await box(
      async () => ({ resendAfterSeconds: 30, expiresInSeconds: 60 }),
      true,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send Code' }));
    expect(
      await screen.findByText(
        'A code is on its way to 01712345678. It works for 1 minute. Look in spam too.',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Email Code')).toBeTruthy();
  });
});
