import { Download, Share, SquarePlus } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useInstall } from './install';

/**
 * "Install app" where the device allows it: the browser's own install
 * dialog, or on iPhone and iPad the steps to add it from Safari. Renders
 * nothing once installed or where installing is not possible.
 */
export function InstallApp({
  render,
}: {
  /** The control to show, given what it should do when chosen. */
  render: (open: () => void) => ReactNode;
}) {
  const { t } = useTranslation();
  const install = useInstall();
  const [steps, setSteps] = useState(false);
  if (!install.canPrompt && !install.showAppleSteps) return null;
  return (
    <>
      {render(() =>
        install.canPrompt ? void install.prompt() : setSteps(true),
      )}
      <Dialog open={steps} onOpenChange={setSteps}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pwa.installTitle')}</DialogTitle>
            <DialogDescription>{t('pwa.appleIntro')}</DialogDescription>
          </DialogHeader>
          <ol className="grid gap-3">
            <li className="flex items-center gap-3">
              <Share aria-hidden className="size-5 text-brand" />
              {t('pwa.appleShare')}
            </li>
            <li className="flex items-center gap-3">
              <SquarePlus aria-hidden className="size-5 text-brand" />
              {t('pwa.appleAdd')}
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const InstallIcon = Download;
