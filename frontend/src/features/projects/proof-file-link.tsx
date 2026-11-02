import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { apiFetch, apiUrl } from '@/api/http';
import type { ProofFileDto } from '@/api/generated/payment-proofs';
import { Button } from '@/components/ui/button';
import { errorText } from '@/i18n/text';

/**
 * Opens a proof's file in a new tab. It comes decrypted from the API with
 * the session's token, so it is fetched here rather than linked.
 */
export function ProofFileLink({
  file,
  children,
}: {
  file: ProofFileDto;
  index: number;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  async function open() {
    // Opened first, so the browser does not block it as a pop-up.
    const tab = window.open('', '_blank');
    let refused: ApiError | null = null;
    try {
      const res = await apiFetch(apiUrl(file.url));
      if (!res.ok) {
        // The server's reason, when it gives one (a file no longer as sent).
        const data: unknown = await res.json().catch(() => null);
        refused = toApiError({ status: res.status, data });
        throw new Error(String(res.status));
      }
      const url = URL.createObjectURL(await res.blob());
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      tab?.close();
      toast.error(
        refused?.code ? errorText(refused, i18n) : t('booking.fileFailed'),
      );
    }
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void open()}
    >
      {children}
    </Button>
  );
}
