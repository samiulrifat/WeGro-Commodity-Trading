import { Link, useNavigate } from '@tanstack/react-router';
import { Landmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  type PendingBankAccountDto,
  useBankAccountsPendingQuery,
} from '@/api/generated/bank-accounts';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { PersonCell } from '@/components/person-cell';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFormat } from '@/i18n/use-format';
import type { BankQueueSearch } from './bank-details';
import { BankListCard } from './bank-list-card';
import { DecideBankDetails } from './decide';

const PAGE_SIZE = 20;
const PATH = '/people/bank-details';

/**
 * Bank details waiting for verification, oldest first, searchable by the
 * payee; each verified or rejected in place. The bank list they are picked
 * from is shown below, with its import.
 */
export function BankQueue({ search }: { search: BankQueueSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const page = search.page ?? 1;
  const query = useBankAccountsPendingQuery({
    page,
    limit: PAGE_SIZE,
    q: search.q,
  });
  const items = query.data?.data;
  const meta = query.data?.meta;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.bankDetails')}
        description={t('bank.queue.intro')}
      />
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) => void navigate({ to: PATH, search: { q } })}
        placeholder={t('bank.queue.search')}
      />
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {items && items.length === 0 && (
        <EmptyState
          icon={Landmark}
          title={search.q ? t('people.noMatch') : t('bank.queue.none')}
          description={search.q ? t('people.noMatchHint') : undefined}
        />
      )}
      {items && items.length > 0 && (
        <>
          <QueueTable items={items} />
          <QueueCards items={items} />
          {meta && (
            <Pager
              page={page}
              pages={meta.totalPages}
              total={meta.total}
              onPage={(p) =>
                void navigate({ to: PATH, search: { ...search, page: p } })
              }
            />
          )}
        </>
      )}
      <BankListCard />
    </div>
  );
}

function Payee({ item }: { item: PendingBankAccountDto }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/people/$personId"
      params={{ personId: item.owner.id }}
      className="outline-none focus-visible:underline"
    >
      <PersonCell
        name={item.owner.name}
        detail={t(`roles.${item.ownerRole}`)}
      />
    </Link>
  );
}

function Kind({ item }: { item: PendingBankAccountDto }) {
  const { t } = useTranslation();
  return (
    <Badge variant={item.isChange ? 'secondary' : 'outline'}>
      {item.isChange ? t('bank.isChange') : t('bank.isNew')}
    </Badge>
  );
}

function Where({ item }: { item: PendingBankAccountDto }) {
  return (
    <div className="grid gap-0.5">
      <span className="font-medium">{item.bankName}</span>
      <span className="text-sm text-muted-foreground">
        {[item.branchName, item.districtName].filter(Boolean).join(', ')}
      </span>
    </div>
  );
}

function Account({ item }: { item: PendingBankAccountDto }) {
  return (
    <div className="grid gap-0.5">
      <span className="font-mono tracking-wider">{item.accountNumber}</span>
      <span className="text-sm text-muted-foreground">{item.holderName}</span>
    </div>
  );
}

/** Desktop: one row per payee. */
function QueueTable({ items }: { items: PendingBankAccountDto[] }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('bank.queue.payee')}</TableHead>
            <TableHead>{t('bank.queue.bankBranch')}</TableHead>
            <TableHead>{t('bank.queue.account')}</TableHead>
            <TableHead>{t('bank.queue.entered')}</TableHead>
            <TableHead>{t('bank.queue.kind')}</TableHead>
            <TableHead className="sr-only">{t('bank.verify')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className="align-top">
              <TableCell>
                <Payee item={item} />
              </TableCell>
              <TableCell className="whitespace-normal">
                <Where item={item} />
              </TableCell>
              <TableCell>
                <Account item={item} />
              </TableCell>
              <TableCell className="whitespace-normal">
                <div className="grid gap-0.5">
                  <span>{item.enteredBy.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {fmt.dateTime(item.enteredAt)}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Kind item={item} />
              </TableCell>
              <TableCell className="whitespace-normal">
                <DecideBankDetails
                  size="sm"
                  personId={item.owner.id}
                  personName={item.owner.name}
                  pending={item}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Phones: one card per payee. */
function QueueCards({ items }: { items: PendingBankAccountDto[] }) {
  const { t } = useTranslation();
  return (
    <ul className="grid gap-3 md:hidden">
      {items.map((item) => (
        <li key={item.id} className="grid gap-4 rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <Payee item={item} />
            <Kind item={item} />
          </div>
          <Where item={item} />
          <Account item={item} />
          <p className="text-sm text-muted-foreground">
            {t('bank.entered', {
              name: item.enteredBy.name,
              at: item.enteredAt,
            })}
          </p>
          <DecideBankDetails
            personId={item.owner.id}
            personName={item.owner.name}
            pending={item}
          />
        </li>
      ))}
    </ul>
  );
}
