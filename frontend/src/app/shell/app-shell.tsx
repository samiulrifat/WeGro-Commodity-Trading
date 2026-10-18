import { Outlet, useMatches, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@/store/hooks';
import { access, navFor } from '../navigation';
import { NoAccessPage } from '../pages';
import { OfflineBanner } from '../pwa/offline-banner';
import { BottomBar } from './bottom-bar';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

/**
 * Every signed-in page: sidebar on desktop, bottom bar on phones, the top
 * bar on both. A page of an area the role does not have shows "not
 * available" in its place (its data is never requested).
 */
export function AppShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useAppSelector((s) => s.session);
  const area = useMatches({
    select: (matches) =>
      matches.findLast((m) => m.staticData.area)?.staticData.area,
  });

  // Signed out here or elsewhere (a failed renewal): back to sign-in.
  useEffect(() => {
    if (session.status === 'signedOut') {
      void navigate({
        to: '/sign-in',
        search: { redirect: window.location.pathname },
      });
    }
  }, [session.status, navigate]);

  if (!session.user) return null;
  const items = navFor(session.user);

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('shell.skipToContent')}
      </a>
      <Sidebar items={items} />
      <div className="flex min-w-0 flex-col">
        <TopBar />
        <OfflineBanner />
        <main
          id="main"
          className="w-full max-w-7xl flex-1 p-4 pb-24 sm:p-6 lg:pb-6"
        >
          {access(session, area) === 'ok' ? <Outlet /> : <NoAccessPage />}
        </main>
      </div>
      <BottomBar items={items} />
    </div>
  );
}
