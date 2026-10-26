import { skipToken } from '@reduxjs/toolkit/query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useApiFile } from '@/api/files';
import {
  type ConsentDto,
  useTrackRecordConsentsQuery,
  useTrackRecordGrantMutation,
  useTrackRecordListBanksQuery,
  useTrackRecordPreviewQuery,
  useTrackRecordPublishMutation,
  useTrackRecordRecordQuery,
  useTrackRecordRevokeMutation,
  useTrackRecordVersionsQuery,
  useTrackRecordViewHistoryQuery,
} from '@/api/generated/track-record';
import { FormError } from '@/app/auth/form-error';
import { Pager } from '@/components/pager';
import { PhotoPicker } from '@/components/photo-picker';
import { ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SearchSelect } from '@/components/ui/combobox';
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
import { dayAfter } from '@/features/warehouse/receipt-utils';
import { useFormat } from '@/i18n/use-format';
import { todayBd } from '@/lib/format';
import { usePhotoPicks } from '@/lib/use-photo-picks';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { ConsentStatusPill } from './consent-status';
import { SummaryView } from './summary-view';
import { HistoryButton } from '@/features/audit/history-button';

const FRESH = { refetchOnMountOrArgChange: true } as const;
/**
 * A bank may see a track record for at most a year at a time: the ledger
 * refuses an end past a year from now, so the last day is today + 364.
 */
const MAX_DAYS = 364;

/**
 * A farmer's track record: the published versions (or a preview of the next
 * one), which banks may see it on whose signed form, and who looked. The
 * farmer's own field officer publishes, grants and withdraws, as does the
 * super admin (for a farmer whose officer is gone).
 */
export function FarmerRecordPage({
  farmerId,
  own = false,
}: {
  farmerId: string;
  /** The farmer's own page: no way back to a list. */
  own?: boolean;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const role = useAppSelector((s) => s.session.user!.role);
  const canAct = role === 'field_officer' || role === 'super_admin';
  const versions = useTrackRecordVersionsQuery({ farmerId }, FRESH);
  const preview = useTrackRecordPreviewQuery({ farmerId }, FRESH);
  // null: the preview of the next version.
  const [chosen, setChosen] = useState<number | null | undefined>(undefined);
  const latest = versions.data?.data[0]?.version;
  const shown = chosen === undefined ? (latest ?? null) : chosen;
  const record = useTrackRecordRecordQuery(
    shown !== null ? { farmerId, version: shown } : skipToken,
  );
  const back = !own && (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link
        to="/track-records"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('nav.sub.farmerRecords')}
      </Link>
      <HistoryButton type="track-record" id={farmerId} />
    </div>
  );
  if (versions.isLoading || preview.isLoading) return <LoadingState />;
  const failed = versions.error ?? preview.error;
  if (failed || !versions.data || !preview.data) {
    return (
      <div className="grid gap-4">
        {back}
        <ErrorState
          error={toApiError(failed)!}
          onRetry={() => {
            void versions.refetch();
            void preview.refetch();
          }}
        />
      </div>
    );
  }
  const farmer = preview.data.data.summary.farmer;
  const { officer, pendingProjects } = preview.data.data;
  const summary =
    shown === null ? preview.data.data.summary : record.data?.data.summary;
  return (
    <div className="grid gap-6">
      {back}
      <section className="grid gap-3 rounded-2xl bg-ink p-5 text-white sm:p-8">
        <span className="flex flex-wrap gap-1.5">
          {latest ? (
            <StatusPill tone="success" appearance="soft">
              {t('trackRecords.versionPublished', { version: latest })}
            </StatusPill>
          ) : (
            <StatusPill tone="neutral" appearance="soft">
              {t('trackRecords.notPublished')}
            </StatusPill>
          )}
        </span>
        <h1 className="text-2xl font-bold sm:text-4xl">
          {own ? t('nav.trackRecord') : farmer.name}
        </h1>
        {!own && (
          <p className="text-white/85">
            {[
              farmer.district?.name,
              officer
                ? t('trackRecords.fieldOfficer', { name: officer.name })
                : t('trackRecords.noFieldOfficer'),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        {own && farmer.district && (
          <p className="text-white/85">{farmer.district.name}</p>
        )}
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid gap-6">
          {shown === null ? (
            <Alert>
              <AlertDescription>
                {t('trackRecords.previewNote')}
              </AlertDescription>
            </Alert>
          ) : (
            record.data && (
              <p className="text-sm text-muted-foreground">
                {t('trackRecords.publishedBy', {
                  version: record.data.data.version,
                  name: record.data.data.publishedBy.name,
                })}{' '}
                ·{' '}
                {record.data.data.verified
                  ? t('payouts.verified')
                  : t('payouts.notVerified')}
              </p>
            )
          )}
          {summary ? <SummaryView summary={summary} /> : <LoadingState />}
        </div>
        <div className="grid gap-6 max-lg:order-first">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {t('trackRecords.versions')}
              </CardTitle>
              <CardDescription>
                {canAct
                  ? t('trackRecords.versionsTextOfficer')
                  : t('trackRecords.versionsText')}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <div
                role="tablist"
                aria-label={t('trackRecords.versions')}
                className="flex flex-wrap gap-2"
              >
                {versions.data.data.map((v) => (
                  <button
                    key={v.version}
                    type="button"
                    role="tab"
                    aria-selected={shown === v.version}
                    onClick={() => setChosen(v.version)}
                    className={cn(
                      'min-h-11 rounded-full border px-4 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      shown === v.version
                        ? 'border-ink bg-ink text-white'
                        : 'bg-card hover:bg-muted',
                    )}
                  >
                    {t('trackRecords.versionShort', { version: v.version })}
                  </button>
                ))}
                <button
                  type="button"
                  role="tab"
                  aria-selected={shown === null}
                  onClick={() => setChosen(null)}
                  className={cn(
                    'min-h-11 rounded-full border px-4 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    shown === null
                      ? 'border-ink bg-ink text-white'
                      : 'bg-card hover:bg-muted',
                  )}
                >
                  {t('trackRecords.preview')}
                </button>
              </div>
              {latest && pendingProjects > 0 && (
                <Alert>
                  <AlertDescription>
                    {t('trackRecords.pendingNote', {
                      count: pendingProjects,
                      n: fmt.number(pendingProjects),
                      version: latest,
                    })}
                  </AlertDescription>
                </Alert>
              )}
              {canAct && (
                <PublishButton
                  farmerId={farmerId}
                  projects={preview.data.data.summary.totals.projects}
                  onPublished={() => setChosen(undefined)}
                />
              )}
            </CardContent>
          </Card>
          <Permissions farmerId={farmerId} canAct={canAct} />
          <Viewers farmerId={farmerId} />
        </div>
      </div>
    </div>
  );
}

function PublishButton({
  farmerId,
  projects,
  onPublished,
}: {
  farmerId: string;
  projects: number;
  onPublished: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [publish, publishing] = useTrackRecordPublishMutation();
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    setError(null);
    try {
      const res = await publish({ farmerId }).unwrap();
      toast.success(t('trackRecords.published', { version: res.data.version }));
      setOpen(false);
      onPublished();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <>
      <Button disabled={projects === 0} onClick={() => setOpen(true)}>
        {t('trackRecords.publish')}
      </Button>
      {projects === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('trackRecords.nothingToPublish')}
        </p>
      )}
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('trackRecords.publishTitle')}</DialogTitle>
              <DialogDescription>
                {t('trackRecords.publishText', { count: projects })}
              </DialogDescription>
            </DialogHeader>
            <FormError error={error} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t('catalog.cancel')}
              </Button>
              <Button disabled={publishing.isLoading} onClick={() => void go()}>
                {publishing.isLoading
                  ? t('people.actions.working')
                  : t('trackRecords.publish')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Which banks may see the record, on whose signed form; the officer grants and withdraws. */
function Permissions({
  farmerId,
  canAct,
}: {
  farmerId: string;
  canAct: boolean;
}) {
  const { t } = useTranslation();
  const query = useTrackRecordConsentsQuery({ farmerId }, FRESH);
  const [granting, setGranting] = useState(false);
  const consents = query.data?.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t('nav.sub.bankPermissions')}
        </CardTitle>
        <CardDescription>{t('trackRecords.permissionsText')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {query.data && consents.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('trackRecords.noPermissionsYet')}
          </p>
        )}
        {consents.length > 0 && (
          <ul className="divide-y">
            {consents.map((c) => (
              <li key={c.id}>
                <PermissionItem
                  consent={c}
                  farmerId={farmerId}
                  canAct={canAct}
                />
              </li>
            ))}
          </ul>
        )}
        {canAct && (
          <Button variant="outline" onClick={() => setGranting(true)}>
            {t('trackRecords.grant')}
          </Button>
        )}
      </CardContent>
      {granting && (
        <GrantDialog farmerId={farmerId} onClose={() => setGranting(false)} />
      )}
    </Card>
  );
}

function PermissionItem({
  consent: c,
  farmerId,
  canAct,
}: {
  consent: ConsentDto;
  farmerId: string;
  canAct: boolean;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [withdrawing, setWithdrawing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const form = useApiFile(showForm ? c.evidencePhotoUrl : null);
  return (
    <div className="grid gap-1.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{c.bank.name}</span>
        <ConsentStatusPill consent={c} />
      </div>
      <p className="text-sm text-muted-foreground">
        {t('trackRecords.untilDay', { date: fmt.date(c.expiresOn) })} ·{' '}
        {t('trackRecords.views', { count: c.views, n: fmt.number(c.views) })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowForm((s) => !s)}
        >
          {showForm ? t('trackRecords.hideForm') : t('trackRecords.signedForm')}
        </Button>
        {canAct && c.current && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWithdrawing(true)}
          >
            {t('trackRecords.withdraw')}
          </Button>
        )}
      </div>
      {showForm && form.url && (
        <img
          src={form.url}
          alt={t('trackRecords.signedFormAlt')}
          className="max-h-72 rounded-lg bg-muted object-contain"
        />
      )}
      {withdrawing && (
        <WithdrawDialog
          consent={c}
          farmerId={farmerId}
          onClose={() => setWithdrawing(false)}
        />
      )}
    </div>
  );
}

function WithdrawDialog({
  consent: c,
  farmerId,
  onClose,
}: {
  consent: ConsentDto;
  farmerId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [revoke, revoking] = useTrackRecordRevokeMutation();
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    setError(null);
    try {
      await revoke({ farmerId, bankId: c.bank.id }).unwrap();
      toast.success(t('trackRecords.withdrawn'));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('trackRecords.withdrawTitle')}</DialogTitle>
          <DialogDescription>
            {t('trackRecords.withdrawText', { bank: c.bank.name })}
          </DialogDescription>
        </DialogHeader>
        <FormError error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('catalog.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={revoking.isLoading}
            onClick={() => void go()}
          >
            {revoking.isLoading
              ? t('people.actions.working')
              : t('trackRecords.withdraw')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The officer records a bank's permission: the bank, the last day it may
 * look (at most a year) and a photo of the farmer's signed form.
 */
function GrantDialog({
  farmerId,
  onClose,
}: {
  farmerId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const banks = useTrackRecordListBanksQuery({});
  const [grant, granting] = useTrackRecordGrantMutation();
  const picks = usePhotoPicks(1);
  const today = todayBd();
  const latestDay = dayAfter(MAX_DAYS, today);
  const [bankId, setBankId] = useState<string | null>(null);
  const [expiresOn, setExpiresOn] = useState(dayAfter(180, today));
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const options = useMemo(
    () =>
      (banks.data?.data ?? []).map((b) => ({
        value: b.id,
        label: `${b.name} · ${b.branchName}`,
      })),
    [banks.data],
  );
  const missing = {
    bank: !bankId,
    expiresOn: !expiresOn || expiresOn < today || expiresOn > latestDay,
    form: picks.ids.length === 0,
  };
  const show = (k: keyof typeof missing) => tried && missing[k];
  const busy = granting.isLoading || picks.uploading;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (picks.uploading || Object.values(missing).some(Boolean)) return;
    setError(null);
    try {
      await grant({
        farmerId,
        grantConsentDto: {
          bankId: bankId!,
          expiresOn,
          evidencePhotoId: picks.ids[0]!,
        },
      }).unwrap();
      toast.success(t('trackRecords.granted'));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('trackRecords.grant')}</DialogTitle>
          <DialogDescription>{t('trackRecords.grantText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={show('bank') || undefined}>
            <FieldLabel htmlFor="grant-bank">
              {t('trackRecords.bank')}
            </FieldLabel>
            <SearchSelect
              id="grant-bank"
              options={options}
              value={bankId}
              onValueChange={setBankId}
              placeholder={t('trackRecords.chooseBank')}
              emptyText={t('trackRecords.noBanks')}
              invalid={show('bank')}
            />
            {show('bank') && (
              <FieldError>{t('trackRecords.required.bank')}</FieldError>
            )}
          </Field>
          <Field data-invalid={show('expiresOn') || undefined}>
            <FieldLabel htmlFor="grant-until">
              {t('trackRecords.lastDay')}
            </FieldLabel>
            <Input
              id="grant-until"
              type="date"
              min={today}
              max={latestDay}
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              aria-invalid={show('expiresOn') || undefined}
            />
            {show('expiresOn') ? (
              <FieldError>{t('trackRecords.required.lastDay')}</FieldError>
            ) : (
              <FieldDescription>
                {t('trackRecords.lastDayHint')}
              </FieldDescription>
            )}
          </Field>
          <Field data-invalid={show('form') || undefined}>
            <FieldLabel>{t('trackRecords.signedForm')}</FieldLabel>
            <PhotoPicker picks={picks} invalid={show('form')} />
            {show('form') ? (
              <FieldError>{t('trackRecords.required.form')}</FieldError>
            ) : (
              <FieldDescription>
                {t('trackRecords.signedFormHint')}
              </FieldDescription>
            )}
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t('people.actions.working') : t('trackRecords.grant')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Each time a bank looked: logged on the ledger. */
function Viewers({ farmerId }: { farmerId: string }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [page, setPage] = useState(1);
  const query = useTrackRecordViewHistoryQuery(
    { farmerId, page, limit: 10 },
    FRESH,
  );
  const rows = query.data?.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('trackRecords.whoViewed')}</CardTitle>
        <CardDescription>{t('trackRecords.whoViewedText')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {query.data && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('trackRecords.noViews')}
          </p>
        )}
        {rows.length > 0 && (
          <ul className="divide-y">
            {rows.map((v, i) => (
              <li
                key={`${v.viewedAt}-${i}`}
                className="grid gap-0.5 py-2 text-sm"
              >
                <span className="font-medium">{v.bank.name}</span>
                <span className="text-muted-foreground">
                  {v.viewer.name} ·{' '}
                  {t('trackRecords.versionShort', { version: v.version })} ·{' '}
                  {fmt.dateTime(v.viewedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {query.data && query.data.meta.totalPages > 1 && (
          <Pager
            page={page}
            pages={query.data.meta.totalPages}
            total={query.data.meta.total}
            onPage={setPage}
          />
        )}
      </CardContent>
    </Card>
  );
}
