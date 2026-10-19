import type { ReactNode } from 'react';
import { LanguageSwitch } from '@/components/language-switch';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/utils';
import { OfflineBanner } from '../pwa/offline-banner';

/**
 * The frame of the pages used before signing in, as WeGro's sign-in box: a
 * white card in the middle of the page, the logo and title centred in it,
 * the language at the top of the page. `wide` for longer forms (signing up).
 */
export function AuthPage({
  title,
  intro,
  wide = false,
  after,
  children,
}: {
  title: ReactNode;
  intro?: ReactNode;
  wide?: boolean;
  /** Below the card (e.g. installing the app). */
  after?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-muted">
      <OfflineBanner />
      <div className="flex justify-end p-4 sm:px-6">
        <LanguageSwitch />
      </div>
      <main className="flex flex-1 flex-col items-center gap-6 px-4 pb-10 sm:justify-center">
        <div
          className={cn(
            'w-full rounded-xl bg-card p-6 text-card-foreground shadow-lg ring-1 ring-foreground/5 sm:p-8',
            wide ? 'max-w-2xl' : 'max-w-md',
          )}
        >
          <div className="mb-6 grid justify-items-center gap-5 text-center">
            <Logo className="h-9" />
            <div className="grid gap-1">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {intro && (
                <p className="text-sm text-muted-foreground">{intro}</p>
              )}
            </div>
          </div>
          {children}
        </div>
        {after}
      </main>
    </div>
  );
}
