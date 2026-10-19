import { CircleX, Hourglass, Landmark, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { toApiError } from '@/api/errors';
import {
  type BankAccountDto,
  type BankAccountsDto,
  type BankDetailsDto,
  useBankAccountsForParticipantQuery,
  useBankAccountsMineQuery,
  useBankAccountsSubmitForMutation,
  useBankAccountsSubmitMineMutation,
} from '@/api/generated/bank-accounts';
import { ErrorState, LoadingState } from '@/components/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAppSelector } from '@/store/hooks';
import { BankDetailsForm } from './bank-details-form';
import { AccountLines } from './account-lines';
import { DecideBankDetails } from './decide';

/** A farmer's or investor's own bank details, on My account. */
export function MyBankAccountCard() {
  const query = useBankAccountsMineQuery();
  const [submit] = useBankAccountsSubmitMineMutation();
  return (
    <BankAccountCard
      self
      query={query}
      onSubmit={async (bankDetailsDto) => {
        await submit({ bankDetailsDto }).unwrap();
      }}
    />
  );
}

/**
 * A payee's bank details on their page: admins enter them, and the super
 * admin or another admin verifies them; Accounts and the auditor look.
 */
export function PersonBankAccountCard({
  personId,
  personName,
}: {
  personId: string;
  personName: string;
}) {
  const viewer = useAppSelector((s) => s.session.user!.role);
  const query = useBankAccountsForParticipantQuery({ id: personId });
  const [submit] = useBankAccountsSubmitForMutation();
  return (
    <BankAccountCard
      query={query}
      decide={
        viewer === 'super_admin' || viewer === 'admin'
          ? { personId, personName }
          : undefined
      }
      onSubmit={
        viewer === 'admin'
          ? async (bankDetailsDto) => {
              await submit({ id: personId, bankDetailsDto }).unwrap();
            }
          : undefined
      }
    />
  );
}

function BankAccountCard({
  self = false,
  query,
  decide,
  onSubmit,
}: {
  self?: boolean;
  query: {
    data?: { data: BankAccountsDto };
    isLoading: boolean;
    error?: unknown;
    refetch: () => unknown;
  };
  /** Whose details, when the reader may verify or reject them. */
  decide?: { personId: string; personName: string };
  /** Present when the reader may enter new details. */
  onSubmit?: (details: BankDetailsDto) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const accounts = query.data?.data;
  const verified = accounts?.verified ?? null;
  const pending = accounts?.pending ?? null;
  const history = accounts?.history ?? [];
  const lastRejected =
    !pending && history[0]?.status === 'rejected' ? history[0] : null;
  const latest = pending ?? verified;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('bank.title')}</CardTitle>
        <CardDescription className="col-start-1">
          {self ? t('bank.introSelf') : t('bank.introOther')}
        </CardDescription>
        {onSubmit && accounts && !editing && (
          <CardAction>
            <Button variant="outline" onClick={() => setEditing(true)}>
              {latest ? <Pencil /> : <Plus />}
              {latest ? t('bank.change') : t('bank.add')}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-5">
        {query.isLoading && <LoadingState />}
        {query.error !== undefined && (
          <ErrorState
            error={toApiError(query.error as never)!}
            onRetry={() => void query.refetch()}
          />
        )}
        {accounts && editing && onSubmit && (
          <BankDetailsForm
            current={latest}
            onCancel={() => setEditing(false)}
            onSubmit={async (details) => {
              await onSubmit(details);
              toast.success(t('bank.sent'));
              setEditing(false);
            }}
          />
        )}
        {accounts && !editing && (
          <>
            {!verified && !pending && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Landmark aria-hidden className="size-4" />
                {t('bank.none')}
              </p>
            )}
            {lastRejected && (
              <Alert>
                <CircleX />
                <AlertTitle>{t('bank.lastRejected')}</AlertTitle>
                {lastRejected.rejectionReason && (
                  <AlertDescription>
                    {t('bank.reason', { reason: lastRejected.rejectionReason })}
                  </AlertDescription>
                )}
              </Alert>
            )}
            {verified && (
              <Version title={t('bank.current')} account={verified} />
            )}
            {pending && (
              <div className="grid gap-3 rounded-lg border border-dashed p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Hourglass aria-hidden className="size-4" />
                  {t('bank.waiting')}
                </p>
                <AccountLines account={pending} />
                {decide && (
                  <DecideBankDetails
                    personId={decide.personId}
                    personName={decide.personName}
                    pending={pending}
                  />
                )}
              </div>
            )}
            {history.length > 0 && <History versions={history} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Version({
  title,
  account,
}: {
  title: string;
  account: BankAccountDto;
}) {
  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <AccountLines account={account} />
    </div>
  );
}

/** Earlier versions, newest first, folded away. */
function History({ versions }: { versions: BankAccountDto[] }) {
  const { t } = useTranslation();
  return (
    <details className="group rounded-lg border">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-4 text-sm font-medium">
        {t('bank.history')}
        <Badge variant="secondary">{versions.length}</Badge>
      </summary>
      <ol className="grid gap-4 border-t p-4">
        {versions.map((v) => (
          <li key={v.id} className="grid gap-2">
            <Badge variant="outline">{t(`bank.status.${v.status}`)}</Badge>
            <AccountLines account={v} />
            {v.rejectionReason && (
              <p className="text-sm">
                {t('bank.reason', { reason: v.rejectionReason })}
              </p>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
