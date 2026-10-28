import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink, Plus } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import {
  type RoundEligibilityDto,
  type SettlementSummaryDto,
  useSettlementListCostsQuery,
  useSettlementPrepareMutation,
  useSettlementSummaryQuery,
} from '@/api/generated/settlement';
import { FormError } from '@/app/auth/form-error';
import { actsAs } from '@/app/navigation';
import { ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StagePill } from '@/features/projects/stage-pill';
import type { ProjectDto } from '@/api/generated/projects';
import { useFormat } from '@/i18n/use-format';
import { useAppSelector } from '@/store/hooks';
import { AddCostDialog } from './add-cost-dialog';
import { CostRow } from './costs-list';
import { DownloadButton } from './download-button';
import { FRESH } from './payouts-utils';
import { RoundRow } from './rounds-list';

/**
 * One project's settlement: income and costs so far, what has been split,
 * whether a staged or the final round can be prepared now (what it would
 * pay, or why not), its rounds and its costs with their bills.
 */
export function ProjectSettlementPage({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const query = useSettlementSummaryQuery({ projectId }, FRESH);
  const back = (
    <Link
      to="/payouts/projects"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {t('nav.sub.settleProjects')}
    </Link>
  );
  if (query.isLoading) return <LoadingState />;
  if (query.error || !query.data) {
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
  const s = query.data.data;
  return (
    <div className="grid gap-6">
      {back}
      <Header summary={s} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="grid gap-6">
          <Figures summary={s} />
          <Costs summary={s} />
        </div>
        {/* On phones what can be done comes first. */}
        <div className="grid gap-6 max-lg:order-first">
          <NextRound summary={s} final={false} />
          <NextRound summary={s} final />
          <Rounds summary={s} />
        </div>
      </div>
    </div>
  );
}

function Header({ summary: s }: { summary: SettlementSummaryDto }) {
  const { t } = useTranslation();
  return (
    <section className="grid gap-4 rounded-2xl bg-ink p-5 text-white sm:p-8">
      <span className="flex flex-wrap gap-1.5">
        <StagePill stage={s.stage as ProjectDto['stage']} />
        {s.settled && (
          <StatusPill tone="success" appearance="soft">
            {t('payouts.settled')}
          </StatusPill>
        )}
      </span>
      <h1 className="text-2xl font-bold sm:text-4xl">{s.project.name}</h1>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/projects/$projectId"
          params={{ projectId: s.project.id }}
          className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-white hover:underline"
        >
          <ExternalLink className="size-4" /> {t('insurance.openProject')}
        </Link>
      </div>
      <DownloadButton
        path={`/api/settlement/projects/${s.project.id}/report.csv`}
        variant="default"
        className="w-fit bg-white text-ink hover:bg-white/90"
      >
        {t('payouts.projectReport')}
      </DownloadButton>
    </section>
  );
}

function Row({
  label,
  children,
  strong = false,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className={strong ? 'font-semibold' : 'text-muted-foreground'}>
        {label}
      </dt>
      <dd
        className={strong ? 'text-right font-bold' : 'text-right font-medium'}
      >
        {children}
      </dd>
    </div>
  );
}

function Figures({ summary: s }: { summary: SettlementSummaryDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('payouts.soFar')}</CardTitle>
        <CardDescription>{t('payouts.soFarText')}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          <Row label={t('payouts.sales')}>{fmt.taka(s.income.sales)}</Row>
          <Row label={t('payouts.insurance')}>
            {fmt.taka(s.income.insurance)}
          </Row>
          <Row label={t('payouts.income')} strong>
            {fmt.taka(s.income.total)}
          </Row>
          <Row label={t('payouts.inputs')}>{fmt.taka(s.costs.inputs)}</Row>
          <Row label={t('payouts.otherCosts')}>{fmt.taka(s.costs.other)}</Row>
          <Row label={t('payouts.costsTotal')} strong>
            {fmt.taka(s.costs.total)}
          </Row>
          <Row label={t('payouts.net')} strong>
            {fmt.taka(s.net)}
          </Row>
          <Row label={t('payouts.distributed')}>
            {fmt.taka(s.distributedProfit)}
          </Row>
        </dl>
      </CardContent>
    </Card>
  );
}

/** Whether a staged or the final round can be prepared, and what it would pay. */
function NextRound({
  summary: s,
  final,
}: {
  summary: SettlementSummaryDto;
  final: boolean;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const role = useAppSelector((st) => st.session.user!.role);
  const [preparing, setPreparing] = useState(false);
  const e: RoundEligibilityDto = final ? s.final : s.staged;
  // A staged round only matters for projects that pay part-way.
  if (!final && e.reason === 'NOT_STAGED') return null;
  if (s.settled && !final) return null;
  const p = e.preview;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {final ? t('payouts.finalRound') : t('payouts.stagedRound')}
        </CardTitle>
        <CardDescription>
          {e.allowed ? t('payouts.canPrepare') : <BlockText eligibility={e} />}
        </CardDescription>
      </CardHeader>
      {p && (
        <CardContent className="grid gap-4">
          <dl className="divide-y">
            <Row label={t('payouts.profitToSplit')} strong>
              {fmt.taka(p.profit)}
            </Row>
            <Row label={t('payouts.farmerShare')}>
              {fmt.taka(p.farmerShare)}
            </Row>
            <Row label={t('payouts.investorShare')}>
              {fmt.taka(p.investorShare)}
            </Row>
            <Row label={t('payouts.wegroShare')}>{fmt.taka(p.wegroShare)}</Row>
            {final && (
              <Row label={t('payouts.capitalReturn')}>
                {fmt.taka(p.capitalReturn)}
              </Row>
            )}
            {p.leftover !== '0.00' && (
              <Row label={t('payouts.leftover')}>{fmt.taka(p.leftover)}</Row>
            )}
            <Row label={t('payouts.payees')}>{fmt.number(p.payees)}</Row>
          </dl>
          {e.allowed && actsAs(role, 'accounts') && (
            <Button onClick={() => setPreparing(true)}>
              {final ? t('payouts.prepareFinal') : t('payouts.prepareStaged')}
            </Button>
          )}
        </CardContent>
      )}
      {preparing && (
        <PrepareDialog
          summary={s}
          final={final}
          onClose={() => setPreparing(false)}
        />
      )}
    </Card>
  );
}

/** Why a round cannot be prepared now, in words. */
function BlockText({ eligibility: e }: { eligibility: RoundEligibilityDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  if (!e.reason) return null;
  if (e.reason === 'TOO_EARLY')
    return t('payouts.block.TOO_EARLY', {
      date: e.nextAllowedAt ? fmt.date(e.nextAllowedAt) : '—',
    });
  if (e.reason === 'STILL_OUTSTANDING')
    return t('payouts.block.STILL_OUTSTANDING', {
      what: e.outstanding
        .map((w) => t(`payouts.outstanding.${w as 'CLAIMS'}`))
        .join(', '),
    });
  return t(`payouts.block.${e.reason}`);
}

function PrepareDialog({
  summary: s,
  final,
  onClose,
}: {
  summary: SettlementSummaryDto;
  final: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [prepare, preparing] = useSettlementPrepareMutation();
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    setError(null);
    try {
      const res = await prepare({
        projectId: s.project.id,
        prepareRoundDto: { final },
      }).unwrap();
      toast.success(t('payouts.prepared'));
      onClose();
      void navigate({
        to: '/payouts/rounds/$roundId',
        params: { roundId: String(res.data.id) },
      });
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {final ? t('payouts.prepareFinal') : t('payouts.prepareStaged')}
          </DialogTitle>
          <DialogDescription>
            {final ? t('payouts.prepareFinalText') : t('payouts.prepareText')}
          </DialogDescription>
        </DialogHeader>
        <FormError error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('catalog.cancel')}
          </Button>
          <Button disabled={preparing.isLoading} onClick={() => void go()}>
            {preparing.isLoading
              ? t('people.actions.working')
              : t('payouts.prepare')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Rounds({ summary: s }: { summary: SettlementSummaryDto }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('nav.sub.payoutRounds')}</CardTitle>
        {s.rounds.length === 0 && (
          <CardDescription>{t('payouts.noRoundsYet')}</CardDescription>
        )}
      </CardHeader>
      {s.rounds.length > 0 && (
        <CardContent>
          <ul className="divide-y">
            {s.rounds.map((r) => (
              <li key={r.id}>
                <RoundRow round={r} />
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

function Costs({ summary: s }: { summary: SettlementSummaryDto }) {
  const { t } = useTranslation();
  const role = useAppSelector((st) => st.session.user!.role);
  const [adding, setAdding] = useState(false);
  const query = useSettlementListCostsQuery(
    { projectId: s.project.id, includeVoided: true },
    FRESH,
  );
  const costs = query.data?.data ?? [];
  // Costs change until the final round is prepared (an open final round freezes them).
  const open =
    !s.settled && !(s.openRoundId && s.final.reason === 'ROUND_OPEN');
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle className="text-lg">{t('nav.sub.costs')}</CardTitle>
          <CardDescription>
            {costs.length === 0 && query.data
              ? t('payouts.noCostsYet')
              : t('payouts.costsText')}
          </CardDescription>
        </div>
        {open && actsAs(role, 'accounts') && (
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus /> {t('payouts.addCost')}
          </Button>
        )}
      </CardHeader>
      {costs.length > 0 && (
        <CardContent>
          <ul className="divide-y">
            {costs.map((c) => (
              <li key={c.id}>
                <CostRow cost={c} />
              </li>
            ))}
          </ul>
        </CardContent>
      )}
      {adding && (
        <AddCostDialog
          projectId={s.project.id}
          onClose={() => setAdding(false)}
        />
      )}
    </Card>
  );
}
