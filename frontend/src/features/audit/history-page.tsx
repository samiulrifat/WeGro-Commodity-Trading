import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import { useAuditRecordHistoryQuery } from '@/api/generated/audit';
import { mayOpen } from '@/app/navigation';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import {
  type HistoryType,
  recordPage,
  shortId,
  VERIFIERS,
} from './audit-utils';
import { EventRow } from './event-row';
import { VerifyPanel } from './verify-panel';
import { useAuditWords } from './words';

const PAGE_SIZE = 20;

export interface HistorySearch {
  order?: 'asc' | 'desc';
  page?: number;
}

/**
 * One record's full history from the ledger: every event that names it,
 * oldest first (or newest), who sent each, and, for those who check, a
 * check of the record against the ledger.
 */
export function HistoryPage({
  type,
  id,
  search,
}: {
  type: HistoryType;
  id: string;
  search: HistorySearch;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const words = useAuditWords();
  const user = useAppSelector((s) => s.session.user!);
  const order = search.order ?? 'asc';
  const page = search.page ?? 1;
  const query = useAuditRecordHistoryQuery(
    { type, id, order, page, limit: PAGE_SIZE },
    { refetchOnMountOrArgChange: true },
  );
  const go = (patch: HistorySearch) =>
    void navigate({
      to: '/audit/history/$type/$id',
      params: { type, id },
      search: { ...search, ...patch },
    });
  const own = recordPage(type, id);
  const meta = query.data?.meta;
  return (
    <div className="grid gap-6">
      <Link
        to="/audit"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('nav.sub.ledgerActivity')}
      </Link>
      <PageHeader
        title={`${words.recordType(type)} ${shortId(type, id)}`}
        description={t('audit.historyText')}
        actions={
          own &&
          mayOpen(user, own) && (
            <Link
              to={own as never}
              className={buttonVariants({ variant: 'outline' })}
            >
              <ExternalLink />
              {t('audit.openRecord')}
            </Link>
          )
        }
      />
      <p className="-mt-3 font-mono text-xs break-all text-muted-foreground">
        {id}
      </p>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid gap-4">
          <div
            role="tablist"
            aria-label={t('audit.order')}
            className="flex gap-2"
          >
            {(['asc', 'desc'] as const).map((o) => (
              <button
                key={o}
                type="button"
                role="tab"
                aria-selected={order === o}
                onClick={() => go({ order: o, page: undefined })}
                className={cn(
                  'min-h-11 rounded-full border px-5 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  order === o
                    ? 'border-ink bg-ink text-white'
                    : 'bg-card hover:bg-muted',
                )}
              >
                {o === 'asc' ? t('audit.oldestFirst') : t('audit.newestFirst')}
              </button>
            ))}
          </div>
          {query.isLoading && <LoadingState />}
          {query.error && (
            <ErrorState
              error={toApiError(query.error)!}
              onRetry={() => void query.refetch()}
            />
          )}
          {query.data && query.data.data.length === 0 && (
            <EmptyState icon={History} title={t('audit.noHistory')} />
          )}
          {query.data && query.data.data.length > 0 && (
            <>
              <ol className="divide-y rounded-2xl border bg-card px-4">
                {query.data.data.map((e) => (
                  <li key={`${e.blockNumber}-${e.logIndex}`}>
                    <EventRow entry={e} />
                  </li>
                ))}
              </ol>
              {meta && (
                <Pager
                  page={page}
                  pages={meta.totalPages}
                  total={meta.total}
                  onPage={(p) => go({ page: p })}
                />
              )}
            </>
          )}
        </div>
        {VERIFIERS.has(user.role) && (
          <Card className="max-lg:order-first">
            <CardHeader>
              <CardTitle className="text-lg">
                {t('audit.verify.title')}
              </CardTitle>
              <CardDescription>{t('audit.verify.text')}</CardDescription>
            </CardHeader>
            <CardContent>
              <VerifyPanel type={type} id={id} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
