import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  CircleCheck,
  CircleX,
  EyeOff,
  Hourglass,
  ShieldQuestion,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import type { District } from '@/api/generated/codes';
import {
  type ParticipantDetailDto,
  useLazyParticipantsIntegrityQuery,
  useParticipantsFindOneQuery,
} from '@/api/generated/participants';
import type { Role } from '@/app/navigation';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { IdCheckList } from './id-check';
import { canManage } from './permissions';
import { type IdCheck, localPhone } from './person';
import { PersonActions, SyncButton } from './person-actions';
import { PersonStatus } from './person-status';

/**
 * One person: their details (partly hidden from the auditor), the ID check,
 * how they were registered and who looks after them, how their record
 * stands against the ledger, and what the reader may do.
 */
export function PersonPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const viewer = useAppSelector((s) => s.session.user!.role);
  const query = useParticipantsFindOneQuery({ id });
  const back = (
    <Link
      to="/people"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {viewer === 'field_officer' ? t('nav.sub.myFarmers') : t('nav.people')}
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
  const person = query.data.data;
  const manages = canManage(viewer, person.role as Role);

  return (
    <div className="grid gap-6">
      {back}
      <PageHeader
        title={person.fullName}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {t(`roles.${person.role as Role}`)}
            <PersonStatus person={person} />
          </span>
        }
        actions={manages && <PersonActions person={person} viewer={viewer} />}
      />

      {person.status === 'rejected' && person.statusReason && (
        <Alert>
          <CircleX />
          <AlertTitle>{t('people.rejectedBecause')}</AlertTitle>
          <AlertDescription>{person.statusReason}</AlertDescription>
        </Alert>
      )}
      {person.chainState === 'submitted' && (
        <Alert polite>
          <Hourglass />
          <AlertTitle>{t('people.ledgerPendingTitle')}</AlertTitle>
          <AlertDescription className="grid gap-3">
            <p>{t('people.ledgerPendingText')}</p>
            {manages && <SyncButton id={person.id} />}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <DetailsCard person={person} />
        <IdCheckCard person={person} />
        <RegistrationCard person={person} />
        {viewer !== 'field_officer' && <LedgerCard person={person} />}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}

function DetailsCard({ person }: { person: ParticipantDetailDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const shown = (value: string | null | undefined) => value || '—';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('people.details')}</CardTitle>
        {person.masked && (
          <CardDescription className="flex items-center gap-1.5">
            <EyeOff className="size-4" /> {t('people.masked')}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Row label={t('person.phone')}>
            {person.masked ? person.phone : localPhone(person.phone)}
          </Row>
          <Row label={t('person.email')}>{shown(person.email)}</Row>
          <Row label={t('person.nid')}>{shown(person.nid)}</Row>
          <Row label={t('person.dateOfBirth')}>
            {person.dateOfBirth ? fmt.date(person.dateOfBirth) : '—'}
          </Row>
          <Row label={t('person.district')}>
            {person.district
              ? t(`districts.${person.district as District}`)
              : '—'}
          </Row>
          <div className="sm:col-span-2">
            <Row label={t('person.address')}>{shown(person.address)}</Row>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function IdCheckCard({ person }: { person: ParticipantDetailDto }) {
  const { t } = useTranslation();
  const checks = (person.idCheck?.checks ?? []) as IdCheck[];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('people.idCheck')}</CardTitle>
        <CardDescription>
          {person.idCheckOutcome === 'flagged'
            ? t('people.idCheckFlagged')
            : person.idCheckOutcome === 'passed'
              ? t('people.idCheckPassed')
              : t('people.idCheckNone')}
        </CardDescription>
      </CardHeader>
      {checks.length > 0 && (
        <CardContent>
          <IdCheckList checks={checks} />
        </CardContent>
      )}
    </Card>
  );
}

function RegistrationCard({ person }: { person: ParticipantDetailDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const by = person.selfRegistered
    ? t('people.selfRegistered')
    : (person.registeredBy?.name ?? t('roles.super_admin'));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('people.registration')}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Row label={t('people.registeredOn')}>
            {fmt.dateTime(person.createdAt)}
          </Row>
          <Row label={t('people.registeredBy')}>{by}</Row>
          {person.role === 'farmer' && (
            <Row label={t('people.fieldOfficer')}>
              {person.fieldOfficer?.name ?? t('people.noOfficer')}
            </Row>
          )}
          {person.statusChangedAt && (
            <Row label={t('people.statusChanged')}>
              {fmt.dateTime(person.statusChangedAt)}
            </Row>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

/** The record against the ledger: its account, and a check of the fingerprint. */
function LedgerCard({ person }: { person: ParticipantDetailDto }) {
  const { t } = useTranslation();
  const [check, integrity] = useLazyParticipantsIntegrityQuery();
  const report = integrity.data?.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('people.ledger')}</CardTitle>
        <CardDescription>{t('people.ledgerIntro')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-4">
          <Row label={t('account.ledger.title')}>
            <code className="font-mono text-sm break-all">
              {person.account}
            </code>
          </Row>
        </dl>
        <Button
          variant="outline"
          className="justify-self-start"
          disabled={integrity.isFetching}
          onClick={() => void check({ id: person.id })}
        >
          <ShieldQuestion />
          {integrity.isFetching
            ? t('people.integrity.checking')
            : t('people.integrity.check')}
        </Button>
        {integrity.error && <ErrorState error={toApiError(integrity.error)!} />}
        {report &&
          (report.matches ? (
            <Alert polite>
              <CircleCheck />
              <AlertDescription>
                {t('people.integrity.matches')}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <CircleX />
              <AlertTitle>{t('people.integrity.differs')}</AlertTitle>
              <AlertDescription>
                {report.mismatches
                  .map((m) =>
                    t(`people.integrity.what.${m}` as never, {
                      defaultValue: m,
                    }),
                  )
                  .join(', ')}
              </AlertDescription>
            </Alert>
          ))}
      </CardContent>
    </Card>
  );
}
