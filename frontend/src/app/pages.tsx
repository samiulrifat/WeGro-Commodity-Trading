import {
  type ErrorComponentProps,
  Link,
  useRouter,
} from '@tanstack/react-router';
import { Construction, SearchX, ShieldX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ApiError } from '@/api/errors';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { buttonVariants } from '@/components/ui/button';
import { useAppSelector } from '@/store/hooks';
import { type Area, navFor } from './navigation';
import { SessionUnknownError } from './session';

const homeLink = buttonVariants({ variant: 'outline' });

/** An area's page before its screens are built: its name, and a plain note. */
export function ComingSoon({ area }: { area: Area }) {
  const { t } = useTranslation();
  const user = useAppSelector((s) => s.session.user);
  const label = user && navFor(user).find((n) => n.area === area)?.label;
  return (
    <>
      <PageHeader title={label ? t(`nav.${label}`) : t('states.comingSoon')} />
      <EmptyState
        icon={Construction}
        title={t('states.comingSoon')}
        description={t('states.comingSoonHint')}
      />
    </>
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={SearchX}
      title={t('pages.notFound')}
      description={t('pages.notFoundHint')}
      action={
        <Link to="/" className={homeLink}>
          {t('pages.home')}
        </Link>
      }
    />
  );
}

export function NoAccessPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={ShieldX}
      title={t('pages.noAccess')}
      description={t('pages.noAccessHint')}
      action={
        <Link to="/" className={homeLink}>
          {t('pages.home')}
        </Link>
      }
    />
  );
}

export function PageLoading() {
  return <LoadingState className="min-h-[50vh]" />;
}

/** Anything a page threw while opening, as one of the API's error kinds. */
function asApiError(error: unknown): ApiError {
  if (error instanceof SessionUnknownError || error instanceof TypeError) {
    return { kind: 'network', status: null, messages: [] };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { kind: 'server', status: null, messages: [message] };
}

export function PageError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <ErrorState
        error={asApiError(error)}
        onRetry={() => void router.invalidate()}
      />
    </div>
  );
}
