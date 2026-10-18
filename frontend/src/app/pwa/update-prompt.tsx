import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useRegisterSW } from 'virtual:pwa-register/react';

const HOUR = 60 * 60 * 1000;

/**
 * Registers the offline worker and, when a new version of the app has been
 * downloaded, offers "Reload": the person chooses when, so a form being
 * filled in is never lost.
 */
export function UpdatePrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Apps left open for days still learn about new versions.
      if (registration) {
        setInterval(() => void registration.update().catch(() => {}), HOUR);
      }
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    const id = toast(t('pwa.updateReady'), {
      duration: Infinity,
      action: {
        label: t('pwa.reload'),
        onClick: () => void updateServiceWorker(true),
      },
    });
    return () => void toast.dismiss(id);
  }, [needRefresh, t, updateServiceWorker]);

  return null;
}
