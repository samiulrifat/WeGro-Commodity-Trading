import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnline } from './online';

/** Says plainly when the device has no connection, and what still works. */
export function OfflineBanner() {
  const { t } = useTranslation();
  if (useOnline()) return null;
  return (
    <output className="flex items-start gap-2 bg-warning-soft px-4 py-2 text-sm text-warning-on-soft sm:px-6">
      <WifiOff aria-hidden className="mt-0.5 size-4 shrink-0" />
      {t('pwa.offline')}
    </output>
  );
}
