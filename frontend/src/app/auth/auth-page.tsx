import type { ReactNode } from 'react';
import { LanguageSwitch } from '@/components/language-switch';
import { Logo } from '@/components/logo';
import { OfflineBanner } from '../pwa/offline-banner';

/** The frame of the pages used before signing in: logo, language, the page. */
export function AuthPage({
  title,
  intro,
  children,
}: {
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <OfflineBanner />
      <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <Logo className="h-9" />
          <LanguageSwitch />
        </div>
        <div className="grid gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {intro && <p className="text-muted-foreground">{intro}</p>}
        </div>
        {children}
      </div>
    </>
  );
}
