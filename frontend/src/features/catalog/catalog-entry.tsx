import { Link } from '@tanstack/react-router';
import { ArrowLeft, BookOpen, Pencil } from 'lucide-react';
import { type ComponentType, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import { type CatalogDto, useCatalogGetQuery } from '@/api/generated/catalog';
import type { SubPath } from '@/app/navigation';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppSelector } from '@/store/hooks';
import { canEditCatalog } from './catalog';
import { type Entry, type EntryFormProps, Status } from './catalog-list';

export interface Fact {
  label: string;
  value: ReactNode;
  /** Takes the whole row (long text). */
  wide?: boolean;
}

/**
 * One catalog entry: its details, and for editors whether it is in use and
 * changing it. Readers see only entries in use; a retired one is not found.
 */
export function CatalogEntryPage<T extends Entry>({
  code,
  list,
  listLabel,
  select,
  facts,
  more,
  Form,
}: {
  code: string;
  list: SubPath;
  listLabel: string;
  select: (catalog: CatalogDto) => readonly T[];
  facts: (entry: T, catalog: CatalogDto) => Fact[];
  /** Further sections, such as a farm update's measurements. */
  more?: (entry: T, catalog: CatalogDto) => ReactNode;
  Form: ComponentType<EntryFormProps<T>>;
}) {
  const { t, i18n } = useTranslation();
  const role = useAppSelector((s) => s.session.user!.role);
  const editor = canEditCatalog(role);
  const query = useCatalogGetQuery({ includeInactive: editor || undefined });
  const [editing, setEditing] = useState(false);
  const catalog = query.data?.data;
  const entry = catalog && select(catalog).find((e) => e.code === code);
  const bengali = i18n.resolvedLanguage === 'bn';

  const back = (
    <Link
      to={list}
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {listLabel}
    </Link>
  );

  if (query.isLoading) return <LoadingState />;
  if (query.error) {
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  if (!catalog || !entry) {
    return (
      <div className="grid gap-4">
        {back}
        <EmptyState
          icon={BookOpen}
          title={t('catalog.notFound')}
          description={t('catalog.notFoundHint', { code })}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {back}
      <PageHeader
        title={bengali ? entry.nameBn : entry.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {bengali ? entry.name : entry.nameBn}
            <span className="font-mono">{entry.code}</span>
            {editor && <Status entry={entry} />}
          </span>
        }
        actions={
          editor && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> {t('catalog.edit')}
            </Button>
          )
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('catalog.details')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            {facts(entry, catalog).map((f) => (
              <div
                key={f.label}
                className={
                  f.wide ? 'grid gap-0.5 sm:col-span-2' : 'grid gap-0.5'
                }
              >
                <dt className="text-sm text-muted-foreground">{f.label}</dt>
                <dd className="font-medium break-words whitespace-pre-line">
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      {more?.(entry, catalog)}
      {editing && (
        <Form
          entry={entry}
          catalog={catalog}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
