import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useInsuranceCoverageQuery } from '@/api/generated/insurance';
import type { ProjectDto } from '@/api/generated/projects';
import { navFor } from '@/app/navigation';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useFormat } from '@/i18n/use-format';
import { useAppSelector } from '@/store/hooks';
import { coverStateOf } from './insurance-utils';
import { CoverPill } from './status';

/**
 * An insured project's insurance at a glance, on the project page: the
 * insurer, the cover left, claims waiting. For those whose menu has
 * insurance; the full view is one click away.
 */
export function ProjectInsurance({ project: p }: { project: ProjectDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const user = useAppSelector((s) => s.session.user!);
  const shown = p.insured && navFor(user).some((n) => n.area === 'insurance');
  const query = useInsuranceCoverageQuery(
    { projectId: p.id },
    { skip: !shown },
  );
  const c = query.data?.data;
  if (!shown || !c) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('projects.insurance')}</CardTitle>
        <CardDescription>
          {c.insurer
            ? t('insurance.insuredBy', { insurer: c.insurer.name })
            : t('insurance.waitingForInsurer')}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <span className="flex flex-wrap gap-1.5">
          <CoverPill state={coverStateOf(c)} />
        </span>
        {c.current && (
          <p className="text-sm">
            {t('insurance.coverLeft', {
              remaining: fmt.taka(c.remaining),
              max: fmt.taka(c.current.maxAmount),
            })}
          </p>
        )}
        {c.openClaims + c.unpaidClaims > 0 && (
          <p className="text-sm text-muted-foreground">
            {t('insurance.claimsWaiting', {
              count: c.openClaims + c.unpaidClaims,
            })}
          </p>
        )}
        <Link
          to="/insurance/projects/$projectId"
          params={{ projectId: p.id }}
          className={buttonVariants({ variant: 'outline' })}
        >
          {t('insurance.viewInsurance')}
        </Link>
      </CardContent>
    </Card>
  );
}
