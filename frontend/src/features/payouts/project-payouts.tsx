import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ProjectDto } from '@/api/generated/projects';
import { useSettlementSummaryQuery } from '@/api/generated/settlement';
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

/** Stages with money to settle. */
const SETTLING: ReadonlySet<ProjectDto['stage']> = new Set([
  'funded',
  'active',
  'ready_for_sale',
  'paid_out',
  'closed',
]);

/**
 * A project's settlement at a glance, on the project page: net so far and
 * profit already paid out. For those whose menu has payouts; the full view
 * is one click away.
 */
export function ProjectPayouts({ project: p }: { project: ProjectDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const user = useAppSelector((s) => s.session.user!);
  const shown =
    SETTLING.has(p.stage) && navFor(user).some((n) => n.area === 'payouts');
  const query = useSettlementSummaryQuery(
    { projectId: p.id },
    { skip: !shown },
  );
  const s = query.data?.data;
  if (!shown || !s) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('nav.payouts')}</CardTitle>
        <CardDescription>
          {s.settled ? t('payouts.settled') : t('payouts.soFarText')}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm">
          {t('payouts.netSoFar', {
            net: fmt.taka(s.net),
            distributed: fmt.taka(s.distributedProfit),
          })}
        </p>
        <Link
          to="/payouts/projects/$projectId"
          params={{ projectId: p.id }}
          className={buttonVariants({ variant: 'outline' })}
        >
          {t('payouts.viewSettlement')}
        </Link>
      </CardContent>
    </Card>
  );
}
