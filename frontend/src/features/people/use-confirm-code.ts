import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, toApiError } from '@/api/errors';
import { latinDigits } from '@/lib/format';
import { useSecondsUntil } from '@/lib/use-seconds-until';

interface CodeSent {
  to: string;
  sentAt: number;
  resendAt: number;
  minutes: number;
}

/** How the API answers a request for a code. */
type Requested = { resendAfterSeconds: number; expiresInSeconds: number };

/**
 * A 6-digit code sent to a number (or address) to confirm it: asking, the
 * wait before asking again, and what was typed. `request` asks the server.
 */
export function useConfirmCode(request: (to: string) => Promise<Requested>) {
  const { t } = useTranslation();
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [requesting, setRequesting] = useState(false);
  const wait = useSecondsUntil(sent?.resendAt ?? 0, sent?.sentAt ?? 0);
  const digits = latinDigits(code.trim());

  async function send(to: string) {
    setError(null);
    setRequesting(true);
    try {
      const data = await request(to);
      const sentAt = Date.now();
      setCode('');
      setSent({
        to,
        sentAt,
        resendAt: sentAt + data.resendAfterSeconds * 1000,
        minutes: Math.round(data.expiresInSeconds / 60),
      });
      return true;
    } catch (e) {
      setError(toApiError(e as never));
      return false;
    } finally {
      setRequesting(false);
    }
  }

  return {
    sent,
    code,
    setCode,
    digits,
    error,
    setError,
    requesting,
    wait,
    send,
    /** Whether a code went to `to` (and not to a number typed before). */
    sentTo: (to: string) => sent?.to === to,
    /** Why the code cannot be used yet, for `to`; null when it can. */
    problem: (to: string) =>
      sent?.to !== to
        ? t('phoneCode.missing')
        : /^\d{6}$/.test(digits)
          ? null
          : t('phoneCode.malformed'),
  };
}

export type ConfirmCode = ReturnType<typeof useConfirmCode>;
