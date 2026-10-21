import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import { useFieldRecordsListQuery } from '@/api/generated/field-records';
import type { ProjectDto } from '@/api/generated/projects';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAppSelector } from '@/store/hooks';
import { useOfficerProjects } from './hooks';
import { RecordCard } from './record-card';

const FIRST = 5;
const MORE = 10;

/** What happened in the field, newest first, for everyone who sees the project. */
export function ProjectFarmUpdates({ project: p }: { project: ProjectDto }) {
  const { t } = useTranslation();
  const role = useAppSelector((s) => s.session.user!.role);
  const [limit, setLimit] = useState(FIRST);
  const query = useFieldRecordsListQuery(
    { projectId: p.id, limit },
    { skip: p.chainState === 'local' },
  );
  if (p.chainState === 'local') return null;
  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('nav.farmUpdates')}</CardTitle>
        <CardDescription>{t('farmUpdates.projectText')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {role === 'field_officer' && <AddUpdate projectId={p.id} />}
        {query.isLoading && <LoadingState />}
        {query.error && (
          <ErrorState
            error={toApiError(query.error)!}
            onRetry={() => void query.refetch()}
          />
        )}
        {query.data && rows.length === 0 && (
          <p className="text-muted-foreground">{t('farmUpdates.noneYet')}</p>
        )}
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <RecordCard record={r} />
            </li>
          ))}
        </ul>
        {total > rows.length && (
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => setLimit((l) => l + MORE)}
          >
            {t('farmUpdates.showMore', {
              count: Math.min(MORE, total - rows.length),
            })}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** For the farmer's own officer while the project takes updates. */
function AddUpdate({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { projects } = useOfficerProjects();
  if (!projects.some((x) => x.id === projectId)) return null;
  return (
    <Link
      to="/farm-updates"
      search={{ project: projectId }}
      className={buttonVariants({ className: 'w-fit' })}
    >
      <Plus /> {t('farmUpdates.add')}
    </Link>
  );
}
