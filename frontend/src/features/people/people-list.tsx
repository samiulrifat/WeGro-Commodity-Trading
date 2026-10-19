import { Link, useNavigate } from '@tanstack/react-router';
import { UserPlus, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import type { District } from '@/api/generated/codes';
import {
  type ParticipantSummaryDto,
  useParticipantsListQuery,
} from '@/api/generated/participants';
import type { Role } from '@/app/navigation';
import { PageHeader } from '@/components/page-header';
import { Pager } from '@/components/pager';
import { SearchBox } from '@/components/search-box';
import { PersonCell } from '@/components/person-cell';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFormat } from '@/i18n/use-format';
import { useAppSelector } from '@/store/hooks';
import type { PeopleSearch } from './people-search';
import { PersonStatus } from './person-status';
import { useDistrictOptions } from './use-district-options';

const PAGE_SIZE = 20;
const NON_STAFF: ReadonlyArray<NonNullable<PeopleSearch['role']>> = [
  'farmer',
  'investor',
  'buyer',
  'supplier',
  'bank',
  'warehouse',
  'insurer',
];
const STAFF: ReadonlyArray<NonNullable<PeopleSearch['role']>> = [
  'admin',
  'accounts',
  'operations',
  'field_officer',
  'auditor',
];
const STATUSES = ['pending', 'verified', 'rejected'] as const;

/**
 * People the reader may see, newest first: everyone for admins and the
 * auditor, a field officer's own farmers. Names are encrypted, so search is
 * by a full number or NID. `pending` fixes the list to those waiting.
 */
export function PeopleList({
  search,
  pending = false,
}: {
  search: PeopleSearch;
  pending?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useAppSelector((s) => s.session.user!);
  const officer = me.role === 'field_officer';
  const page = search.page ?? 1;
  const query = useParticipantsListQuery({
    page,
    limit: PAGE_SIZE,
    role: search.role,
    status: pending ? 'pending' : search.status,
    // Waiting for you: only those you may verify.
    manageable: pending || undefined,
    district: search.district,
    q: search.q,
  });

  const path = pending ? '/people/pending' : '/people';
  const set = (patch: Partial<PeopleSearch>) =>
    void navigate({
      to: path,
      search: { ...search, ...patch, page: undefined },
    });

  const title = pending
    ? t('nav.sub.pendingPeople')
    : officer
      ? t('nav.sub.myFarmers')
      : t('nav.people');
  const canRegister = me.role !== 'auditor';
  const roles: ReadonlyArray<NonNullable<PeopleSearch['role']>> =
    me.role === 'super_admin' ? STAFF : [...NON_STAFF, ...STAFF];
  const filtered = Boolean(
    search.q || search.role || search.status || search.district,
  );
  const meta = query.data?.meta;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={title}
        description={pending ? t('people.pendingIntro') : undefined}
        actions={
          canRegister && (
            <Link to="/people/new" className={buttonVariants()}>
              <UserPlus />
              {officer ? t('nav.sub.registerFarmer') : t('people.register')}
            </Link>
          )
        }
      />

      <Filters
        search={search}
        pending={pending}
        roles={officer ? [] : roles}
        onChange={set}
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
          icon={Users}
          title={
            filtered
              ? t('people.noMatch')
              : pending
                ? t('people.noneWaiting')
                : t('people.none')
          }
          description={filtered ? t('people.noMatchHint') : undefined}
        />
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <PeopleTable people={query.data.data} />
          <PeopleCards people={query.data.data} />
          {meta && meta.totalPages > 1 && (
            <Pager
              page={page}
              pages={meta.totalPages}
              total={meta.total}
              onPage={(p) =>
                void navigate({ to: path, search: { ...search, page: p } })
              }
            />
          )}
        </>
      )}
    </div>
  );
}

function Filters({
  search,
  pending,
  roles,
  onChange,
}: {
  search: PeopleSearch;
  pending: boolean;
  roles: ReadonlyArray<NonNullable<PeopleSearch['role']>>;
  onChange: (patch: Partial<PeopleSearch>) => void;
}) {
  const { t } = useTranslation();
  const districts = useDistrictOptions();
  const ANY = '';

  const roleItems = [
    { value: ANY, label: t('people.anyRole') },
    ...roles.map((r) => ({ value: r, label: t(`roles.${r}`) })),
  ];
  const statusItems = [
    { value: ANY, label: t('people.anyStatus') },
    ...STATUSES.map((s) => ({ value: s, label: t(`people.status.${s}`) })),
  ];
  const districtItems = [
    { value: ANY, label: t('people.anyDistrict') },
    ...districts,
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
      <SearchBox
        value={search.q}
        onSearch={(q) => onChange({ q })}
        placeholder={t('people.search')}
      />
      {roles.length > 0 && (
        <FilterSelect
          label={t('people.role')}
          items={roleItems}
          value={search.role ?? ANY}
          onChange={(v) =>
            onChange({ role: (v || undefined) as PeopleSearch['role'] })
          }
        />
      )}
      {!pending && (
        <FilterSelect
          label={t('people.statusLabel')}
          items={statusItems}
          value={search.status ?? ANY}
          onChange={(v) =>
            onChange({ status: (v || undefined) as PeopleSearch['status'] })
          }
        />
      )}
      <FilterSelect
        label={t('person.district')}
        items={districtItems}
        value={search.district ?? ANY}
        onChange={(v) => onChange({ district: (v || undefined) as District })}
      />
    </div>
  );
}

function FilterSelect({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(v) => onChange(v ?? '')}
    >
      <SelectTrigger aria-label={label} className="w-full">
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
  );
}

/** Desktop: one row per person; the whole row opens them. */
function PeopleTable({ people }: { people: ParticipantSummaryDto[] }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const navigate = useNavigate();
  return (
    <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('people.column.person')}</TableHead>
            <TableHead>{t('people.role')}</TableHead>
            <TableHead>{t('person.district')}</TableHead>
            <TableHead>{t('people.column.registered')}</TableHead>
            <TableHead>{t('people.statusLabel')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {people.map((p) => (
            <TableRow
              key={p.id}
              className="cursor-pointer"
              onClick={() =>
                void navigate({
                  to: '/people/$personId',
                  params: { personId: p.id },
                })
              }
            >
              <TableCell>
                <Link
                  to="/people/$personId"
                  params={{ personId: p.id }}
                  className="outline-none focus-visible:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <PersonCell name={p.fullName} detail={p.phone} />
                </Link>
              </TableCell>
              <TableCell>{t(`roles.${p.role as Role}`)}</TableCell>
              <TableCell>
                {p.district ? t(`districts.${p.district as District}`) : '—'}
              </TableCell>
              <TableCell>{fmt.date(p.createdAt)}</TableCell>
              <TableCell>
                <PersonStatus person={p} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Phones: one card per person. */
function PeopleCards({ people }: { people: ParticipantSummaryDto[] }) {
  const { t } = useTranslation();
  return (
    <ul className="grid gap-3 md:hidden">
      {people.map((p) => (
        <li key={p.id}>
          <Link
            to="/people/$personId"
            params={{ personId: p.id }}
            className="grid gap-3 rounded-xl border bg-card p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <PersonCell
              name={p.fullName}
              detail={`${t(`roles.${p.role as Role}`)} · ${p.phone}`}
            />
            <PersonStatus person={p} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
