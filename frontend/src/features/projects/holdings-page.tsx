import { Link } from '@tanstack/react-router';
import { ChevronRight, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type ReservationDto,
  useInvestmentsMineQuery,
  useReservationsListQuery,
} from '@/api/generated/projects';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormat } from '@/i18n/use-format';
import { ProjectPhoto } from './project-card';
import { toPoisha, toTaka } from './project-math';
import { StagePill } from './stage-pill';

const TONE = {
  pending: 'warning',
  confirmed: 'success',
  expired: 'neutral',
  cancelled: 'neutral',
} as const;

/** An investor's holdings (slots paid for) and their bookings, newest first. */
export function HoldingsPage() {
  const { t } = useTranslation();
  const fmt = useFormat();
  const holdings = useInvestmentsMineQuery();
  const bookings = useReservationsListQuery({ limit: 50 });
  const invested = (holdings.data?.data ?? []).reduce(
    (sum, h) => sum + toPoisha(h.invested),
    0n,
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.holdings')}
        description={
          holdings.data
            ? t('holdings.total', { amount: fmt.taka(toTaka(invested)) })
            : undefined
        }
        actions={
          <Link
            to="/projects"
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('holdings.browse')}
          </Link>
        }
      />

      <section className="grid gap-3" aria-labelledby="holdings-title">
        <h2 id="holdings-title" className="text-lg font-semibold">
          {t('holdings.held')}
        </h2>
        {holdings.isLoading && <LoadingState />}
        {holdings.error && (
          <ErrorState
            error={toApiError(holdings.error)!}
            onRetry={() => void holdings.refetch()}
          />
        )}
        {holdings.data && holdings.data.data.length === 0 && (
          <EmptyState
            icon={Wallet}
            title={t('holdings.none')}
            description={t('holdings.noneHint')}
          />
        )}
        <ul className="grid gap-4 md:grid-cols-2">
          {(holdings.data?.data ?? []).map((h) => (
            <li key={h.project.id}>
              <Link
                to="/projects/$projectId"
                params={{ projectId: h.project.id }}
                className="flex gap-4 rounded-2xl border bg-card p-4 outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ProjectPhoto
                  project={h.project}
                  className="size-20 shrink-0 rounded-xl"
                />
                <div className="grid min-w-0 flex-1 gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold">{h.project.title}</p>
                    <StagePill stage={h.project.stage} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('projects.unitsWord', { count: h.slots })} ·{' '}
                    {fmt.taka(h.invested)}
                  </p>
                  <p className="text-sm">
                    {t('holdings.estimate', {
                      min: fmt.taka(h.estimatedReturn.minAmount),
                      max: fmt.taka(h.estimatedReturn.maxAmount),
                    })}
                  </p>
                  {h.pendingSlots > 0 && (
                    <p className="text-sm text-warning-on-soft">
                      {t('holdings.pending', { count: h.pendingSlots })}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('holdings.bookings')}</CardTitle>
        </CardHeader>
        <CardContent>
          {bookings.isLoading && <LoadingState />}
          {bookings.data && bookings.data.data.length === 0 && (
            <p className="text-muted-foreground">{t('holdings.noBookings')}</p>
          )}
          <ul className="divide-y">
            {(bookings.data?.data ?? []).map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function BookingRow({ booking: b }: { booking: ReservationDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <li>
      <Link
        to="/holdings/bookings/$bookingId"
        params={{ bookingId: String(b.id) }}
        className="flex items-center gap-3 py-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="truncate font-medium">
            {t('holdings.bookingNo', { id: fmt.number(b.id) })} ·{' '}
            {b.projectTitle}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('projects.unitsWord', { count: b.slots })} · {fmt.taka(b.amount)}
            {b.status === 'pending' &&
              ` · ${t('holdings.left', { amount: fmt.taka(b.remaining) })}`}
          </p>
        </div>
        <StatusPill
          tone={b.status === 'pending' && b.onHold ? 'success' : TONE[b.status]}
          appearance="soft"
        >
          {b.status === 'pending' && b.onHold
            ? t('booking.underReview')
            : t(`holdings.status.${b.status}`)}
        </StatusPill>
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </Link>
    </li>
  );
}
