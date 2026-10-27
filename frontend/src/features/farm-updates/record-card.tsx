import { Link } from '@tanstack/react-router';
import {
  CircleCheck,
  CircleX,
  MapPin,
  Pencil,
  ShieldQuestion,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import { useApiFile } from '@/api/files';
import {
  type FieldRecordDto,
  useLazyFieldRecordsVerifyQuery,
} from '@/api/generated/field-records';
import { FormError } from '@/app/auth/form-error';
import { StatusPill } from '@/components/status-pill';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useFormat } from '@/i18n/use-format';
import { useAppSelector } from '@/store/hooks';
import { mapLink } from './draft';
import { useAuditWords } from '@/features/audit/words';
import { useUnit } from '@/i18n/use-unit';

const LEDGER_CHECKERS = new Set(['super_admin', 'admin', 'auditor']);

/**
 * One farm update: what was seen, the readings, the photo and where; on
 * the ledger or on its way; corrected or a correction. The farmer's officer
 * can correct it; admins and auditors check it against the ledger.
 */
export function RecordCard({
  record: r,
  showProject = false,
}: {
  record: FieldRecordDto;
  showProject?: boolean;
}) {
  const unitWord = useUnit();
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const me = useAppSelector((s) => s.session.user!);
  const bengali = i18n.resolvedLanguage === 'bn';
  const { url } = useApiFile(r.photo?.url);
  const [enlarged, setEnlarged] = useState(false);
  const [broken, setBroken] = useState(false);
  const canCorrect =
    me.role === 'field_officer' &&
    (r.recordedBy.id === me.id || r.location?.exact === true);

  return (
    <article className="grid gap-3 rounded-2xl border bg-card p-4 shadow-xs sm:grid-cols-[6rem_minmax(0,1fr)]">
      {r.photo && (
        <button
          type="button"
          onClick={() => setEnlarged(true)}
          disabled={!url || broken}
          aria-label={t('farmUpdates.showPhoto')}
          className="size-24 overflow-hidden rounded-xl bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {url && !broken && (
            <img
              src={url}
              alt=""
              onError={() => setBroken(true)}
              className="size-full object-cover"
            />
          )}
        </button>
      )}
      <div
        className={
          r.photo ? 'grid min-w-0 gap-2' : 'grid min-w-0 gap-2 sm:col-span-2'
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">
            {bengali ? r.entryTypeNameBn : r.entryTypeName}
          </h3>
          <StatusPill
            tone={r.status === 'recorded' ? 'success' : 'neutral'}
            appearance="soft"
          >
            {t(`farmUpdates.status.${r.status}`)}
          </StatusPill>
          {r.correctsEntryId && (
            <StatusPill tone="neutral" appearance="soft">
              {t('farmUpdates.correction')}
            </StatusPill>
          )}
          {r.correctedBy.length > 0 && (
            <StatusPill tone="warning" appearance="soft">
              {t('farmUpdates.correctedLater')}
            </StatusPill>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {t('farmUpdates.observedBy', {
            at: fmt.dateTime(r.observedAt),
            name: r.recordedBy.name,
          })}
        </p>
        {showProject && (
          <p className="text-sm">
            <Link
              to="/projects/$projectId"
              params={{ projectId: r.projectId }}
              className="font-medium hover:underline"
            >
              {r.projectTitle}
            </Link>
            <span className="text-muted-foreground"> · {r.farmer.name}</span>
          </p>
        )}
        {r.measurements.length > 0 && (
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {r.measurements.map((m) => (
              <div key={m.key} className="flex gap-1.5">
                <dt className="text-muted-foreground">
                  {bengali ? m.labelBn : m.label}:
                </dt>
                <dd className="font-semibold">
                  {fmt.number(m.value)}
                  {m.unit && ` ${unitWord(m.unit)}`}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {r.notes && (
          <p translate="no" className="text-sm whitespace-pre-line">
            {r.notes}
          </p>
        )}
        {r.location && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <MapPin aria-hidden className="size-4" />
            {r.location.exact
              ? t('farmUpdates.exactSpot', {
                  lat: r.location.latitude,
                  lng: r.location.longitude,
                  accuracy:
                    r.location.accuracyMeters == null
                      ? ''
                      : t('farmUpdates.accuracy', {
                          metres: fmt.number(r.location.accuracyMeters),
                        }),
                })
              : t('farmUpdates.area', {
                  lat: r.location.latitude,
                  lng: r.location.longitude,
                })}
            <a
              href={mapLink(r.location.latitude, r.location.longitude)}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand hover:underline"
            >
              {t('farmUpdates.openMap')}
            </a>
          </p>
        )}
        {(canCorrect || LEDGER_CHECKERS.has(me.role)) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {canCorrect && (
              <Link
                to="/farm-updates"
                search={{ corrects: r.id }}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <Pencil /> {t('farmUpdates.correct')}
              </Link>
            )}
            {LEDGER_CHECKERS.has(me.role) && r.status === 'recorded' && (
              <LedgerCheck id={r.id} />
            )}
          </div>
        )}
      </div>
      {enlarged && url && (
        <Dialog open onOpenChange={(o) => !o && setEnlarged(false)}>
          <DialogContent className="sm:max-w-3xl">
            <DialogTitle>
              {bengali ? r.entryTypeNameBn : r.entryTypeName}
            </DialogTitle>
            <img
              src={url}
              alt={t('farmUpdates.photoAlt')}
              className="max-h-[75dvh] w-full rounded-lg object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
    </article>
  );
}

function LedgerCheck({ id }: { id: string }) {
  const { t } = useTranslation();
  const words = useAuditWords();
  const [check, result] = useLazyFieldRecordsVerifyQuery();
  const data = result.data?.data;
  return (
    <div className="grid w-full gap-2">
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={result.isFetching}
        onClick={() => void check({ id })}
      >
        <ShieldQuestion />
        {result.isFetching
          ? t('people.integrity.checking')
          : t('people.integrity.check')}
      </Button>
      {result.error && <FormError error={toApiError(result.error)} />}
      {data &&
        (data.matches ? (
          <Alert>
            <CircleCheck />
            <AlertTitle>{t('farmUpdates.ledgerMatches')}</AlertTitle>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <CircleX />
            <AlertTitle>{t('farmUpdates.ledgerDiffers')}</AlertTitle>
            <AlertDescription>
              {data.mismatches.map((m) => words.mismatch(m)).join(' · ')}
            </AlertDescription>
          </Alert>
        ))}
    </div>
  );
}
