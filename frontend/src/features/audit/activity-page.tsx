import { useNavigate } from '@tanstack/react-router';
import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import { useAuditActivityQuery } from '@/api/generated/audit';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HISTORY_TYPES, type HistoryType } from './audit-utils';
import { EventRow } from './event-row';
import { useAuditWords } from './words';

const PAGE_SIZE = 20;

export interface ActivitySearch {
  type?: HistoryType;
  q?: string;
  page?: number;
}

/**
 * Everything that happened on the ledger, newest first: all of it, one kind
 * of record, or one record found by its number or id. Each event opens the
 * history of the records it names.
 */
export function ActivityPage({ search }: { search: ActivitySearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const words = useAuditWords();
  const page = search.page ?? 1;
  const query = useAuditActivityQuery(
    { page, limit: PAGE_SIZE, type: search.type, q: search.q },
    { refetchOnMountOrArgChange: true },
  );
  const set = (patch: Partial<ActivitySearch>) =>
    void navigate({
      to: '/audit',
      search: { ...search, ...patch, page: undefined },
    });
  const items = [
    { value: '', label: t('audit.anyType') },
    ...HISTORY_TYPES.map((x) => ({ value: x, label: words.recordType(x) })),
  ];
  const meta = query.data?.meta;
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.ledgerActivity')}
        description={t('audit.activityIntro')}
      />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,16rem)_minmax(0,36rem)]">
        <Select
          items={items}
          value={search.type ?? ''}
          onValueChange={(v) =>
            set({ type: (v || undefined) as HistoryType | undefined })
          }
        >
          <SelectTrigger aria-label={t('audit.typeLabel')} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value || 'any'} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchBox
          value={search.q}
          onSearch={(q) => set({ q })}
          placeholder={t('audit.searchRecords')}
        />
      </div>
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && query.data.data.length === 0 && (
        <EmptyState
          icon={History}
          title={
            search.q || search.type
              ? t('audit.noEventMatch')
              : t('audit.noEvents')
          }
          description={search.q ? t('audit.searchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="divide-y rounded-2xl border bg-card px-4">
            {query.data.data.map((e) => (
              <li key={`${e.blockNumber}-${e.logIndex}`}>
                <EventRow entry={e} />
              </li>
            ))}
          </ul>
          {meta && (
            <Pager
              page={page}
              pages={meta.totalPages}
              total={meta.total}
              onPage={(p) =>
                void navigate({ to: '/audit', search: { ...search, page: p } })
              }
            />
          )}
        </>
      )}
    </div>
  );
}
