import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiFetch, apiUrl } from '@/api/http';
import type { ProofFileDto } from '@/api/generated/payment-proofs';
import { Button } from '@/components/ui/button';

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
  const { t } = useTranslation();
  async function open() {
    // Opened first, so the browser does not block it as a pop-up.
    const tab = window.open('', '_blank');
    try {
      const res = await apiFetch(apiUrl(file.url));
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      tab?.close();
      toast.error(t('booking.fileFailed'));
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
