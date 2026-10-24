import { Download } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { downloadFile } from '@/api/files';
import { Button } from '@/components/ui/button';

/** Downloads an API file (a CSV) under the name the server gives it. */
export function DownloadButton({
  path,
  children,
  variant = 'outline',
  className,
}: {
  path: string;
  children: ReactNode;
  variant?: 'outline' | 'default' | 'ghost';
  className?: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      className={className}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        downloadFile(path)
          .catch(() => toast.error(t('payouts.downloadFailed')))
          .finally(() => setBusy(false));
      }}
    >
      <Download /> {busy ? t('people.actions.working') : children}
    </Button>
  );
}
