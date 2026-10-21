import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProjectDto } from '@/api/generated/projects';
import {
  useVouchersListQuery,
  useVouchersSummaryQuery,
} from '@/api/generated/vouchers';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useFormat } from '@/i18n/use-format';
import { useAppSelector } from '@/store/hooks';
import { ProposeDialog } from './propose-dialog';
import { VoucherStatus } from './status';
import { canProposeVouchers } from './voucher-search';

const STAFF = new Set([
  'super_admin',
  'admin',
  'operations',
  'accounts',
  'auditor',
]);
/** Stages once the money is in: vouchers can exist from here on. */
const FUNDED = new Set([
  'funded',
  'active',
  'ready_for_sale',
  'paid_out',
  'closed',
]);
const PROPOSABLE = new Set(['funded', 'active']);

/** Staff: what the project's vouchers commit and spend, and each voucher. */
export function ProjectVouchers({ project: p }: { project: ProjectDto }) {
  const role = useAppSelector((s) => s.session.user!.role);
  if (!STAFF.has(role) || p.chainState === 'local' || !FUNDED.has(p.stage))
    return null;
  return (
    <VouchersCard
      project={p}
      canPropose={canProposeVouchers(role) && PROPOSABLE.has(p.stage)}
    />
  );
}

function VouchersCard({
  project: p,
  canPropose,
}: {
  project: ProjectDto;
  canPropose: boolean;
}) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const bengali = i18n.resolvedLanguage === 'bn';
  const summary = useVouchersSummaryQuery({ projectId: p.id });
  const list = useVouchersListQuery({ projectId: p.id, limit: 50 });
  const [proposing, setProposing] = useState(false);
  const s = summary.data?.data;
  const vouchers = list.data?.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('nav.vouchers')}</CardTitle>
        <CardDescription>{t('vouchers.projectText')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {s && (
          <dl className="grid gap-1 text-sm">
            {(
              [
                ['committed', s.committed],
                ['spent', s.spent],
                ['pendingSales', s.pendingSales],
                ['room', s.room],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t(`vouchers.summary.${k}`)}
                </dt>
                <dd className="font-semibold">{fmt.taka(v)}</dd>
              </div>
            ))}
          </dl>
        )}
        {vouchers.length > 0 && (
          <ul className="divide-y border-t">
            {vouchers.map((v) => (
              <li key={v.id} className="grid gap-1 py-2">
                <Link
                  to="/vouchers/$voucherId"
                  params={{ voucherId: v.id }}
                  className="font-medium hover:underline"
                >
                  {bengali ? v.input.nameBn : v.input.name} ·{' '}
                  {t('vouchers.quantityOf', {
                    quantity: fmt.number(v.quantity),
                    unit: v.input.unit,
                  })}
                </Link>
                <VoucherStatus voucher={v} />
              </li>
            ))}
          </ul>
        )}
        {list.data && vouchers.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('vouchers.none')}</p>
        )}
        {canPropose && (
          <Button onClick={() => setProposing(true)}>
            <Plus /> {t('vouchers.propose')}
          </Button>
        )}
      </CardContent>
      {proposing && (
        <ProposeDialog projectId={p.id} onClose={() => setProposing(false)} />
      )}
    </Card>
  );
}
