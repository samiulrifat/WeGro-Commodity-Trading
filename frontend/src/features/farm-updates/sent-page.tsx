import { Link, useNavigate } from '@tanstack/react-router';
import { NotebookPen, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import { useFieldRecordsListAllQuery } from '@/api/generated/field-records';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { buttonVariants } from '@/components/ui/button';
import { RecordCard } from './record-card';
import type { UpdateListSearch } from './search';

const PAGE_SIZE = 20;

/** The officer's farm updates that reached the server, newest first. */
export function SentPage({ search }: { search: UpdateListSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const page = search.page ?? 1;
  const query = useFieldRecordsListAllQuery({
    page,
    limit: PAGE_SIZE,
    q: search.q,
  });
  const meta = query.data?.meta;
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.sentUpdates')}
        description={t('farmUpdates.sentIntro')}
        actions={
          <Link to="/farm-updates" className={buttonVariants()}>
            <Plus /> {t('nav.sub.newUpdate')}
          </Link>
        }
      />
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) =>
          void navigate({ to: '/farm-updates/sent', search: { q } })
        }
        placeholder={t('farmUpdates.searchSent')}
      />
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && query.data.data.length === 0 && (
        <EmptyState
          icon={NotebookPen}
          title={
            search.q ? t('farmUpdates.noSentMatch') : t('farmUpdates.noneSent')
          }
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="grid gap-3">
            {query.data.data.map((r) => (
              <li key={r.id}>
                <RecordCard record={r} showProject />
              </li>
            ))}
          </ul>
          {meta && (
            <Pager
              page={page}
              pages={meta.totalPages}
              total={meta.total}
              onPage={(p) =>
                void navigate({
                  to: '/farm-updates/sent',
                  search: { ...search, page: p },
                })
              }
            />
          )}
        </>
      )}
    </div>
  );
}
