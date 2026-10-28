import { Link } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useCatalogGetQuery } from '@/api/generated/catalog';
import {
  type CoverageDto,
  type CoverageVersionDto,
  useInsuranceAssignInsurerMutation,
  useInsuranceCoverageQuery,
  useInsuranceListClaimsQuery,
  useInsuranceSetCoverageMutation,
} from '@/api/generated/insurance';
import { FormError } from '@/app/auth/form-error';
import { actsAs, navFor } from '@/app/navigation';
import { ErrorState, LoadingState } from '@/components/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { OfficerPicker } from '@/features/people/officer-picker';
import { toPoisha, typedTaka } from '@/features/projects/project-math';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { ClaimRow } from './claims-list';
import { coverStateOf, FRESH } from './insurance-utils';
import { OpenClaimDialog } from './open-claim-dialog';
import { CoverPill } from './status';
import { useDistrictName, useEventTypeName, useProduceName } from './use-names';

type Move = 'assign' | 'cover' | 'claim';

/**
 * One insured project's insurance: its insurer, the cover with what is left
 * of it and earlier versions, its claims, and each role's moves (an admin
 * assigns the insurer, the insurer sets the cover, the farmer's officer or
 * an admin opens a claim).
 */
export function InsuredProjectPage({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const user = useAppSelector((s) => s.session.user!);
  const query = useInsuranceCoverageQuery({ projectId }, FRESH);
  const listsProjects =
    user.role === 'insurer' ||
    actsAs(user.role, 'admin') ||
    ['operations', 'accounts', 'auditor'].includes(user.role);
  const back = (
    <Link
      to={listsProjects ? '/insurance' : '/insurance/claims'}
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {listsProjects ? t('nav.sub.insuredProjects') : t('nav.sub.claims')}
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
  const c = query.data.data;
  return (
    <div className="grid gap-6">
      {back}
      <Header coverage={c} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid gap-6">
          <Cover coverage={c} />
          <ProjectClaims projectId={projectId} />
          <History versions={c.history} />
        </div>
        {/* On phones the moves come first, before the details. */}
        <div className="grid gap-6 max-lg:order-first">
          <Moves coverage={c} />
        </div>
      </div>
    </div>
  );
}

function Header({ coverage: c }: { coverage: CoverageDto }) {
  const { t } = useTranslation();
  const user = useAppSelector((s) => s.session.user!);
  const produce = useProduceName();
  const district = useDistrictName();
  const seesProject = navFor(user).some((n) => n.area === 'projects');
  return (
    <section className="grid gap-4 rounded-2xl bg-ink p-5 text-white sm:p-8">
      <span className="flex flex-wrap gap-1.5">
        <CoverPill state={coverStateOf(c)} />
      </span>
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold sm:text-4xl">{c.project.name}</h1>
        <p className="text-white/85">
          {produce(c.produceCode)} · {district(c.district)} ·{' '}
          {t(`insurance.stage.${c.inField ? 'inField' : 'harvested'}`)}
        </p>
      </div>
      <p className="text-white/85">
        {t('insurance.farmer')}:{' '}
        <span className="font-semibold text-white">{c.farmer.name}</span>
        {' · '}
        {t('insurance.insurer')}:{' '}
        <span className="font-semibold text-white">
          {c.insurer?.name ?? t('insurance.noInsurer')}
        </span>
      </p>
      {seesProject && (
        <Link
          to="/projects/$projectId"
          params={{ projectId: c.projectId }}
          className="inline-flex min-h-11 w-fit items-center gap-1.5 font-semibold text-white hover:underline"
        >
          <ExternalLink className="size-4" /> {t('insurance.openProject')}
        </Link>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

/** The covered event types, as chips. */
function EventChips({ version }: { version: CoverageVersionDto }) {
  const name = useEventTypeName();
  return (
    <span className="flex flex-wrap justify-end gap-1.5">
      {version.coveredEventTypes.map((e) => (
        <span
          key={e.code}
          className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium"
        >
          {name(e)}
        </span>
      ))}
    </span>
  );
}

function Cover({ coverage: c }: { coverage: CoverageDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const v = c.current;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('insurance.cover')}</CardTitle>
        {!v && (
          <CardDescription>
            {c.insurer
              ? t('insurance.waitingForCover', { insurer: c.insurer.name })
              : t('insurance.waitingForInsurer')}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          {v && (
            <>
              <Row label={t('insurance.maxCover')}>{fmt.taka(v.maxAmount)}</Row>
              <Row label={t('insurance.coveredEvents')}>
                <EventChips version={v} />
              </Row>
            </>
          )}
          <Row label={t('insurance.approvedTotal')}>
            {fmt.taka(c.approvedTotal)}
          </Row>
          <Row label={t('insurance.paidTotal')}>{fmt.taka(c.paidTotal)}</Row>
          {v && (
            <Row label={t('insurance.remaining')}>
              <span className="font-bold">{fmt.taka(c.remaining)}</span>
            </Row>
          )}
          <Row label={t('insurance.openClaims')}>
            {fmt.number(c.openClaims)}
          </Row>
          {c.unpaidClaims > 0 && (
            <Row label={t('insurance.unpaidClaims')}>
              {fmt.number(c.unpaidClaims)}
            </Row>
          )}
          {v?.recordedAt && (
            <Row label={t('insurance.coverSetOn')}>
              {fmt.dateTime(v.recordedAt)}
            </Row>
          )}
        </dl>
        {v?.notes && (
          <p
            translate="no"
            className="mt-4 whitespace-pre-line text-muted-foreground"
          >
            {v.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Earlier versions of the cover, newest first. */
function History({ versions }: { versions: CoverageVersionDto[] }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  if (versions.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('insurance.earlierCover')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative grid gap-4 border-l pl-5">
          {versions.map((v) => (
            <li key={v.termsHash} className="relative grid gap-1">
              <span
                aria-hidden
                className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full bg-muted-foreground"
              />
              <p className="font-medium">
                {t('insurance.upTo', { amount: fmt.taka(v.maxAmount) })}
                {v.recordedAt && (
                  <span className="text-muted-foreground">
                    {' · '}
                    {fmt.dateTime(v.recordedAt)}
                  </span>
                )}
              </p>
              <div className="flex">
                <EventChips version={v} />
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function ProjectClaims({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const query = useInsuranceListClaimsQuery({ projectId, limit: 50 }, FRESH);
  const claims = query.data?.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('nav.sub.claims')}</CardTitle>
        {query.data && claims.length === 0 && (
          <CardDescription>{t('insurance.noClaimsYet')}</CardDescription>
        )}
      </CardHeader>
      {claims.length > 0 && (
        <CardContent>
          <ul className="divide-y">
            {claims.map((c) => (
              <li key={c.id}>
                <ClaimRow claim={c} />
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

/** Each role's moves; the ledger checks them again. */
function Moves({ coverage: c }: { coverage: CoverageDto }) {
  const { t } = useTranslation();
  const user = useAppSelector((s) => s.session.user!);
  const [open, setOpen] = useState<Move | null>(null);
  const admin = actsAs(user.role, 'admin');
  const moves: Move[] = [];
  if (c.inField && admin) moves.push('assign');
  if (c.inField && user.role === 'insurer' && c.insurer?.id === user.id)
    moves.push('cover');
  if (c.inField && c.current && (admin || user.role === 'field_officer'))
    moves.push('claim');
  if (moves.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('insurance.manage')}</CardTitle>
        <CardDescription>
          {t(`insurance.manageText.${coverStateOf(c)}`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {moves.map((m) => (
          <Button
            key={m}
            variant={m === 'claim' ? 'outline' : 'default'}
            disabled={m === 'assign' && c.insurerFixed}
            onClick={() => setOpen(m)}
          >
            {m === 'assign'
              ? c.insurer
                ? t('insurance.move.changeInsurer')
                : t('insurance.move.assignInsurer')
              : m === 'cover'
                ? c.current
                  ? t('insurance.move.changeCover')
                  : t('insurance.move.setCover')
                : t('insurance.move.openClaim')}
          </Button>
        ))}
        {moves.includes('assign') && c.insurerFixed && (
          <p className="text-sm text-muted-foreground">
            {t('insurance.insurerFixed')}
          </p>
        )}
      </CardContent>
      {open === 'assign' && (
        <AssignDialog coverage={c} onClose={() => setOpen(null)} />
      )}
      {open === 'cover' && (
        <CoverDialog coverage={c} onClose={() => setOpen(null)} />
      )}
      {open === 'claim' && (
        <OpenClaimDialog
          projectId={c.projectId}
          onClose={() => setOpen(null)}
        />
      )}
    </Card>
  );
}

/** An admin picks the insurer; switching clears the old insurer's terms. */
function AssignDialog({
  coverage: c,
  onClose,
}: {
  coverage: CoverageDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [assign, assigning] = useInsuranceAssignInsurerMutation();
  const [insurerId, setInsurerId] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    if (!insurerId) return;
    setError(null);
    try {
      await assign({
        projectId: c.projectId,
        assignInsurerDto: { insurerId },
      }).unwrap();
      toast.success(t('insurance.assigned'));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {c.insurer
              ? t('insurance.move.changeInsurer')
              : t('insurance.move.assignInsurer')}
          </DialogTitle>
          <DialogDescription>
            {c.insurer
              ? t('insurance.changeInsurerText', { insurer: c.insurer.name })
              : t('insurance.assignInsurerText')}
          </DialogDescription>
        </DialogHeader>
        <OfficerPicker
          open
          personRole="insurer"
          exclude={c.insurer ? [c.insurer.id] : []}
          value={insurerId}
          onChange={setInsurerId}
          placeholder={t('insurance.findInsurer')}
        />
        <FormError error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('catalog.cancel')}
          </Button>
          <Button
            disabled={!insurerId || assigning.isLoading}
            onClick={() => void go()}
          >
            {assigning.isLoading
              ? t('people.actions.working')
              : t('insurance.assign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The assigned insurer sets the cover: the most it pays in total, the
 * weather events it pays for, and the terms in words. Never below what is
 * already approved.
 */
function CoverDialog({
  coverage: c,
  onClose,
}: {
  coverage: CoverageDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const name = useEventTypeName();
  const catalog = useCatalogGetQuery({});
  const [save, saving] = useInsuranceSetCoverageMutation();
  const v = c.current;
  const [amount, setAmount] = useState(v?.maxAmount.replace(/\.00$/, '') ?? '');
  const [types, setTypes] = useState<string[]>(
    v?.coveredEventTypes.map((e) => e.code) ?? [],
  );
  const [notes, setNotes] = useState(v?.notes ?? '');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const eventTypes = useMemo(
    () => (catalog.data?.data.weatherEventTypes ?? []).filter((e) => e.active),
    [catalog.data],
  );
  const max = typedTaka(amount);
  const missing = {
    amount:
      !max || toPoisha(max) <= 0n || toPoisha(max) < toPoisha(c.approvedTotal),
    types: types.length === 0,
  };
  const show = (k: keyof typeof missing) => tried && missing[k];
  const toggle = (code: string) =>
    setTypes((ts) =>
      ts.includes(code) ? ts.filter((x) => x !== code) : [...ts, code],
    );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(missing).some(Boolean)) return;
    setError(null);
    try {
      await save({
        projectId: c.projectId,
        setCoverageDto: {
          maxAmount: max!,
          coveredEventTypes: types,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      }).unwrap();
      toast.success(t('insurance.coverSaved'));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {v ? t('insurance.move.changeCover') : t('insurance.move.setCover')}
          </DialogTitle>
          <DialogDescription>{t('insurance.coverText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={show('amount') || undefined}>
            <FieldLabel htmlFor="cover-amount">
              {t('insurance.maxCover')}
            </FieldLabel>
            <Input
              id="cover-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={show('amount') || undefined}
            />
            {show('amount') ? (
              <FieldError>
                {toPoisha(c.approvedTotal) > 0n
                  ? t('insurance.required.amountAbove', {
                      amount: fmt.taka(c.approvedTotal),
                    })
                  : t('insurance.required.amount')}
              </FieldError>
            ) : (
              <FieldDescription>{t('insurance.maxCoverHint')}</FieldDescription>
            )}
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">
              {t('insurance.coveredEvents')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {eventTypes.map((e) => (
                <button
                  key={e.code}
                  type="button"
                  aria-pressed={types.includes(e.code)}
                  onClick={() => toggle(e.code)}
                  className={cn(
                    'min-h-11 rounded-full border px-4 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    types.includes(e.code)
                      ? 'border-ink bg-ink text-white'
                      : 'bg-card hover:bg-muted',
                    show('types') && 'border-danger',
                  )}
                >
                  {name(e)}
                </button>
              ))}
            </div>
            {show('types') && (
              <p className="text-sm text-danger">
                {t('insurance.required.types')}
              </p>
            )}
          </fieldset>
          <Field>
            <FieldLabel htmlFor="cover-notes">
              {t('insurance.terms')}
            </FieldLabel>
            <Textarea
              id="cover-notes"
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <FieldDescription>{t('insurance.termsHint')}</FieldDescription>
          </Field>
          {v && (
            <Alert>
              <AlertDescription>
                {t('insurance.coverVersionNote')}
              </AlertDescription>
            </Alert>
          )}
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={saving.isLoading}>
              {saving.isLoading
                ? t('people.actions.working')
                : t('insurance.saveCover')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
