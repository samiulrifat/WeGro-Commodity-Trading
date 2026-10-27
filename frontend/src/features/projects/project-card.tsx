import { Link } from '@tanstack/react-router';
import { Heart, MapPin, Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { toApiError } from '@/api/errors';
import { useApiFile } from '@/api/files';
import type { District } from '@/api/generated/codes';
import {
  type ProjectDto,
  useProjectsAddFavouriteMutation,
  useProjectsRemoveFavouriteMutation,
} from '@/api/generated/projects';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useFormat } from '@/i18n/use-format';
import { errorText } from '@/i18n/text';
import { cn } from '@/lib/utils';
import { annualized, shortPercent } from './project-math';
import { StagePill } from './stage-pill';

/** A project's photo, or the crop's mark while it has none. */
export function ProjectPhoto({
  project,
  className,
}: {
  project: Pick<ProjectDto, 'coverPhotoUrl' | 'title'>;
  className?: string;
}) {
  const { url } = useApiFile(project.coverPhotoUrl);
  return url ? (
    <img
      src={url}
      alt=""
      className={cn('object-cover', className)}
      loading="lazy"
    />
  ) : (
    <div
      aria-hidden
      className={cn(
        'flex items-center justify-center bg-success-soft text-success',
        className,
      )}
    >
      <Sprout className="size-1/3" />
    </div>
  );
}

/** Where: the place and the district. */
export function Place({ project }: { project: ProjectDto }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
      <MapPin aria-hidden className="size-3.5 shrink-0 text-danger" />
      <span translate="no" className="truncate">
        {project.location},{' '}
        {t(`districts.${project.district.code as District}`)}
      </span>
    </span>
  );
}

/** Save or unsave, for investors. */
export function FavouriteButton({
  project,
  className,
}: {
  project: ProjectDto;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const [add, adding] = useProjectsAddFavouriteMutation();
  const [remove, removing] = useProjectsRemoveFavouriteMutation();
  if (project.favourite === undefined) return null;
  const on = project.favourite;
  async function toggle() {
    try {
      await (
        on ? remove({ id: project.id }) : add({ id: project.id })
      ).unwrap();
    } catch (e) {
      toast.error(errorText(toApiError(e as never)!, i18n));
    }
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-pressed={on}
      aria-label={on ? t('projects.unsave') : t('projects.save')}
      disabled={adding.isLoading || removing.isLoading}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle();
      }}
      className={className}
    >
      <Heart className={cn(on && 'fill-danger text-danger')} />
    </Button>
  );
}

/** One project in the list: as on WeGro's investor app. */
export function ProjectCard({
  project,
  staff,
}: {
  project: ProjectDto;
  staff: boolean;
}) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const bengali = i18n.resolvedLanguage === 'bn';
  const r = project.estimatedReturn;
  const funded = Number(project.fundedPercent);
  return (
    <article className="relative grid gap-3 rounded-2xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md">
      <div className="flex gap-4">
        <div className="relative shrink-0">
          <ProjectPhoto
            project={project}
            className="size-24 rounded-xl sm:size-28"
          />
          {project.stage === 'open_for_funding' && (
            <span
              aria-hidden
              className="absolute top-1.5 left-1.5 size-3 rounded-full border-2 border-white bg-success"
            />
          )}
          <FavouriteButton
            project={project}
            className="absolute -right-2 -bottom-2 z-10 size-9 rounded-full border bg-card shadow-xs"
          />
        </div>
        <div className="grid min-w-0 flex-1 content-start gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 font-bold leading-snug">
              <Link
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="line-clamp-2 outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
              >
                {project.title}
              </Link>
            </h3>
            <div className="shrink-0 text-right">
              <p className="font-bold">{fmt.takaShort(project.slotPrice)}</p>
              <p className="text-xs text-muted-foreground">
                {t('projects.perUnit')}
              </p>
            </div>
          </div>
          <Place project={project} />
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium">
              {t('projects.range', {
                min: fmt.number(shortPercent(r.minPercent)),
                max: fmt.number(shortPercent(r.maxPercent)),
              })}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium">
              {t('projects.months', { count: project.durationMonths })}
            </span>
            {staff && <StagePill stage={project.stage} />}
          </div>
          <p className="text-xs text-muted-foreground italic">
            {t('projects.annualized', {
              value: fmt.number(annualized(project), 1),
            })}
            {' · '}
            {bengali
              ? (project.produce.nameBn ?? project.produce.name)
              : project.produce.name}
          </p>
        </div>
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t('projects.investors', { count: project.investorCount })}
          </span>
          <span className="font-semibold">
            {t('projects.funded', { percent: fmt.number(funded, 2) })}
          </span>
        </div>
        <Progress value={funded} aria-label={t('projects.fundingProgress')} />
      </div>
    </article>
  );
}
