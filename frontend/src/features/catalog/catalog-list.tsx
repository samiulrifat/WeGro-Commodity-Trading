import { Link, useNavigate } from '@tanstack/react-router';
import { BookOpen, ChevronRight, Plus } from 'lucide-react';
import { type ComponentType, type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import { type CatalogDto, useCatalogGetQuery } from '@/api/generated/catalog';
import type { SubPath } from '@/app/navigation';
import { PageHeader } from '@/components/page-header';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
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
import { useAppSelector } from '@/store/hooks';
import {
  canEditCatalog,
  type CatalogSearch,
  findEntries,
  type Shown,
} from './catalog';

export interface Entry {
  code: string;
  name: string;
  nameBn: string;
  active: boolean;
}

export interface Column<T> {
  header: string;
  cell: (entry: T, catalog: CatalogDto) => ReactNode;
}

/** The dialog that adds (entry null) or changes an entry. */
export type EntryFormProps<T> = {
  entry: T | null;
  catalog: CatalogDto;
  onClose: () => void;
};

/** Where an entry's own page is, by its list (all take the code). */
export type DetailPath =
  | '/catalog/units/$code'
  | '/catalog/produce/$code'
  | '/catalog/inputs/$code'
  | '/catalog/farm-update-types/$code'
  | '/catalog/weather-events/$code';

/**
 * One catalog list: searchable by name in either language or code, in
 * dropdown order; each entry opens its own page. Editors also see retired
 * entries (on asking) and add entries; everyone else reads what is in use.
 */
export function CatalogList<T extends Entry>({
  path,
  detail,
  title,
  intro,
  addLabel,
  select,
  columns,
  searchExtra,
  search,
  Form,
}: {
  path: SubPath;
  detail: DetailPath;
  title: string;
  intro: string;
  addLabel: string;
  select: (catalog: CatalogDto) => readonly T[];
  columns: readonly Column<T>[];
  /** More texts a search may match, such as a unit's symbol. */
  searchExtra?: (
    entry: T,
    catalog: CatalogDto,
  ) => (string | null | undefined)[];
  search: CatalogSearch;
  Form: ComponentType<EntryFormProps<T>>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user!.role);
  const editor = canEditCatalog(role);
  const query = useCatalogGetQuery({ includeInactive: editor || undefined });
  const [adding, setAdding] = useState(false);
  const catalog = query.data?.data;
  const shown: Shown = editor ? (search.show ?? 'active') : 'active';

  const entries = useMemo(
    () =>
      catalog
        ? findEntries(select(catalog), search.q, shown, (e) =>
            searchExtra ? searchExtra(e, catalog) : [],
          )
        : [],
    [catalog, select, search.q, shown, searchExtra],
  );

  const set = (patch: Partial<CatalogSearch>) =>
    void navigate({ to: path, search: { ...search, ...patch } });

  return (
    <div className="grid gap-6">
      <PageHeader
        title={title}
        description={intro}
        actions={
          editor && (
            <Button onClick={() => setAdding(true)} disabled={!catalog}>
              <Plus /> {addLabel}
            </Button>
          )
        }
      />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SearchBox
          value={search.q}
          onSearch={(q) => set({ q })}
          placeholder={t('catalog.search')}
        />
        {editor && (
          <ShowSelect
            value={shown}
            onChange={(show) =>
              set({ show: show === 'active' ? undefined : show })
            }
          />
        )}
      </div>

      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {catalog && entries.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title={search.q ? t('catalog.noMatch') : t(`catalog.none.${shown}`)}
          description={search.q ? t('catalog.noMatchHint') : undefined}
        />
      )}
      {catalog && entries.length > 0 && (
        <>
          <EntryTable
            entries={entries}
            catalog={catalog}
            columns={columns}
            editor={editor}
            detail={detail}
          />
          <EntryCards
            entries={entries}
            catalog={catalog}
            columns={columns}
            editor={editor}
            detail={detail}
          />
        </>
      )}

      {catalog && adding && (
        <Form entry={null} catalog={catalog} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}

function ShowSelect({
  value,
  onChange,
}: {
  value: Shown;
  onChange: (value: Shown) => void;
}) {
  const { t } = useTranslation();
  const items = (['active', 'retired', 'all'] as const).map((v) => ({
    value: v,
    label: t(`catalog.show.${v}`),
  }));
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(v) => onChange((v ?? 'active') as Shown)}
    >
      <SelectTrigger aria-label={t('catalog.showLabel')} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The name in the reader's language first, the other and the code below. */
export function EntryName({ entry }: { entry: Entry }) {
  const { i18n } = useTranslation();
  const bengali = i18n.resolvedLanguage === 'bn';
  return (
    <div className="grid gap-0.5">
      <span className="font-semibold">
        {bengali ? entry.nameBn : entry.name}
      </span>
      <span className="text-sm text-muted-foreground">
        {bengali ? entry.name : entry.nameBn}
        {' · '}
        <span className="font-mono">{entry.code}</span>
      </span>
    </div>
  );
}

export function Status({ entry }: { entry: Entry }) {
  const { t } = useTranslation();
  return (
    <StatusPill tone={entry.active ? 'success' : 'neutral'} appearance="soft">
      {entry.active ? t('catalog.status.active') : t('catalog.status.retired')}
    </StatusPill>
  );
}

interface ViewProps<T extends Entry> {
  entries: readonly T[];
  catalog: CatalogDto;
  columns: readonly Column<T>[];
  editor: boolean;
  detail: DetailPath;
}

/** Desktop: one row per entry; the whole row opens it. */
function EntryTable<T extends Entry>({
  entries,
  catalog,
  columns,
  editor,
  detail,
}: ViewProps<T>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('catalog.column.name')}</TableHead>
            {columns.map((c) => (
              <TableHead key={c.header}>{c.header}</TableHead>
            ))}
            {editor && <TableHead>{t('catalog.column.status')}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e) => (
            <TableRow
              key={e.code}
              className="cursor-pointer align-top"
              onClick={() =>
                void navigate({ to: detail, params: { code: e.code } })
              }
            >
              <TableCell className="whitespace-normal">
                <Link
                  to={detail}
                  params={{ code: e.code }}
                  className="outline-none focus-visible:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  <EntryName entry={e} />
                </Link>
              </TableCell>
              {columns.map((c) => (
                <TableCell key={c.header} className="whitespace-normal">
                  {c.cell(e, catalog)}
                </TableCell>
              ))}
              {editor && (
                <TableCell>
                  <Status entry={e} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Phones: one card per entry, opening it. */
function EntryCards<T extends Entry>({
  entries,
  catalog,
  columns,
  editor,
  detail,
}: ViewProps<T>) {
  return (
    <ul className="grid gap-3 md:hidden">
      {entries.map((e) => (
        <li key={e.code}>
          <Link
            to={detail}
            params={{ code: e.code }}
            className="grid gap-3 rounded-xl border bg-card p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <div className="flex items-start justify-between gap-3">
              <EntryName entry={e} />
              {editor ? (
                <Status entry={e} />
              ) : (
                <ChevronRight
                  aria-hidden
                  className="size-5 shrink-0 text-muted-foreground"
                />
              )}
            </div>
            <dl className="grid grid-cols-2 gap-3">
              {columns.map((c) => (
                <div key={c.header} className="grid gap-0.5">
                  <dt className="text-sm text-muted-foreground">{c.header}</dt>
                  <dd className="font-medium break-words">
                    {c.cell(e, catalog)}
                  </dd>
                </div>
              ))}
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  );
}
