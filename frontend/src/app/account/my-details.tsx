import { Clock, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { toApiError } from '@/api/errors';
import { authApi } from '@/api/generated/auth';
import type { District } from '@/api/generated/codes';
import {
  type DetailChangeDto,
  type DetailField,
  type MyDetailsDto,
  type OwnDetailsDto,
  useDetailChangesMineQuery,
  useDetailChangesWithdrawMutation,
} from '@/api/generated/participants';
import { isStaff } from '@/app/navigation';
import { ErrorState, LoadingState } from '@/components/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { errorText } from '@/i18n/text';
import { useFormat } from '@/i18n/use-format';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { DETAIL_FIELDS, localPhone, OPERATOR_FIELDS } from './details';
import { DetailsForm } from './details-form';

/**
 * The person's own details, and changing them: through an admin (the super
 * admin for staff), or at once for the super admin.
 */
export function MyDetails() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const role = useAppSelector((s) => s.session.user?.role);
  const query = useDetailChangesMineQuery();
  const [editing, setEditing] = useState(false);
  const mine = query.data?.data;

  const intro = !mine
    ? undefined
    : !mine.needsApproval
      ? t('account.details.atOnce')
      : role && isStaff(role)
        ? t('account.details.bySuperAdmin')
        : t('account.details.byAdmin');

  const editButton = (
    <Button variant="outline" onClick={() => setEditing(true)}>
      {mine?.change?.status === 'pending'
        ? t('account.details.editAgain')
        : t('account.details.edit')}
    </Button>
  );

  function done(result: MyDetailsDto) {
    setEditing(false);
    if (result.needsApproval) {
      toast.success(t('account.details.sent'));
    } else {
      toast.success(t('account.details.saved'));
      // The name in the top bar.
      dispatch(authApi.util.invalidateTags(['Auth']));
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-lg">{t('account.details.title')}</CardTitle>
        {intro && (
          <CardDescription className="col-start-1">{intro}</CardDescription>
        )}
        {mine && !editing && (
          // On phones it goes below the details, leaving the intro its width.
          <CardAction className="hidden sm:block">{editButton}</CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-5">
        {query.isLoading && <LoadingState />}
        {query.error && (
          <ErrorState
            error={toApiError(query.error)!}
            onRetry={() => void query.refetch()}
          />
        )}
        {mine && editing && (
          <DetailsForm
            mine={mine}
            onDone={done}
            onCancel={() => setEditing(false)}
          />
        )}
        {mine && !editing && (
          <>
            {mine.change && <ChangeStatus change={mine.change} />}
            <Details
              values={mine.current}
              fields={mine.needsApproval ? DETAIL_FIELDS : OPERATOR_FIELDS}
            />
            <div className="sm:hidden">{editButton}</div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** One detail as shown: the number as typed, the date and district worded. */
function useShown() {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (field: DetailField, value: string | null | undefined) => {
    if (!value) return '—';
    if (field === 'phone') return localPhone(value);
    if (field === 'dateOfBirth') return fmt.date(value);
    if (field === 'district') return t(`districts.${value as District}`);
    return value;
  };
}

function Details({
  values,
  fields,
  className,
}: {
  values: Partial<OwnDetailsDto>;
  fields: readonly DetailField[];
  className?: string;
}) {
  const { t } = useTranslation();
  const shown = useShown();
  return (
    <dl
      className={
        className ?? 'grid gap-x-8 gap-y-4 sm:grid-cols-2 [&_dd]:break-words'
      }
    >
      {fields.map((f) => (
        <div key={f} className={f === 'address' ? 'sm:col-span-2' : undefined}>
          <dt className="text-sm text-muted-foreground">
            {t(`account.details.${f}`)}
          </dt>
          <dd className="font-medium">{shown(f, values[f])}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The latest change: waiting (with what was asked for), or how it ended. */
function ChangeStatus({ change }: { change: DetailChangeDto }) {
  const { t, i18n } = useTranslation();
  const [withdraw, withdrawing] = useDetailChangesWithdrawMutation();

  async function takeBack() {
    try {
      await withdraw().unwrap();
      toast.success(t('account.details.withdrawn'));
    } catch (e) {
      toast.error(errorText(toApiError(e as never)!, i18n));
    }
  }

  if (change.status === 'pending') {
    return (
      <Alert polite className="border-warning/40 bg-warning-soft/40">
        <Clock />
        <AlertTitle>
          {t('account.details.pending', { at: change.createdAt })}
        </AlertTitle>
        <AlertDescription className="grid gap-3 text-foreground">
          <div className="text-muted-foreground">
            {t('account.details.newValues')}
          </div>
          <Details
            values={change.requested}
            fields={change.changedFields}
            className="grid gap-x-8 gap-y-3 sm:grid-cols-2 [&_dd]:break-words"
          />
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            disabled={withdrawing.isLoading}
            onClick={() => void takeBack()}
          >
            {withdrawing.isLoading
              ? t('account.details.withdrawing')
              : t('account.details.withdraw')}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (change.status === 'rejected' && change.decidedAt) {
    return (
      <Alert>
        <TriangleAlert />
        <AlertTitle>
          {t('account.details.rejected', { at: change.decidedAt })}
        </AlertTitle>
        {change.reason && (
          <AlertDescription>
            {t('account.details.reason', { reason: change.reason })}
          </AlertDescription>
        )}
      </Alert>
    );
  }
  if (change.status === 'approved' && change.decidedAt) {
    return (
      <output className="block text-sm text-muted-foreground">
        {t('account.details.approved', { at: change.decidedAt })}
      </output>
    );
  }
  return null;
}
