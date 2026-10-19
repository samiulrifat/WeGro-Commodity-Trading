import {
  BadgeCheck,
  Ellipsis,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  UserCog,
  UserX,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import type { District } from '@/api/generated/codes';
import {
  type ParticipantDetailDto,
  useParticipantsAssignFieldOfficerMutation,
  useParticipantsListQuery,
  useParticipantsRejectMutation,
  useParticipantsReplaceKeyMutation,
  useParticipantsResetPasswordMutation,
  useParticipantsSyncMutation,
  useParticipantsVerifyMutation,
} from '@/api/generated/participants';
import { FormError } from '@/app/auth/form-error';
import type { Role } from '@/app/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { SearchBox } from '@/components/search-box';
import { cn } from '@/lib/utils';
import { errorText } from '@/i18n/text';
import { IdCheckList } from './id-check';
import type { IdCheck } from './person';
import { TemporaryPassword } from './temporary-password';

type Person = ParticipantDetailDto;
type Open = 'verify' | 'reject' | 'reset' | 'replace-key' | 'assign' | null;

/**
 * What the reader may do to this person (they manage them): verify, reject,
 * and under More: assign a field officer (farmers), reset the password,
 * replace the key, bring the record in line with the ledger.
 */
export function PersonActions({
  person,
  viewer,
}: {
  person: Person;
  viewer: Role;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState<Open>(null);
  const [sync, syncing] = useParticipantsSyncMutation();
  const close = () => setOpen(null);

  async function syncNow() {
    try {
      await sync({ id: person.id }).unwrap();
      toast.success(t('people.actions.synced'));
    } catch (e) {
      toast.error(errorText(toApiError(e as never)!, i18n));
    }
  }

  return (
    <>
      {person.status !== 'verified' && (
        <Button onClick={() => setOpen('verify')}>
          <BadgeCheck /> {t('people.actions.verify')}
        </Button>
      )}
      {person.status !== 'rejected' && (
        <Button variant="destructive" onClick={() => setOpen('reject')}>
          <UserX /> {t('people.actions.reject')}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" aria-label={t('people.actions.more')} />
          }
        >
          <Ellipsis /> {t('people.actions.more')}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {person.role === 'farmer' && viewer === 'admin' && (
            <DropdownMenuItem onClick={() => setOpen('assign')}>
              <UserCog /> {t('people.actions.assign')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setOpen('reset')}>
            <KeyRound /> {t('people.actions.reset')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen('replace-key')}>
            <ShieldCheck /> {t('people.actions.replaceKey')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={syncing.isLoading}
            onClick={() => void syncNow()}
          >
            <RefreshCw /> {t('people.actions.sync')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <VerifyDialog person={person} open={open === 'verify'} onClose={close} />
      <RejectDialog person={person} open={open === 'reject'} onClose={close} />
      <ResetDialog person={person} open={open === 'reset'} onClose={close} />
      <ReplaceKeyDialog
        person={person}
        open={open === 'replace-key'}
        onClose={close}
      />
      {person.role === 'farmer' && (
        <AssignDialog
          person={person}
          open={open === 'assign'}
          onClose={close}
        />
      )}
    </>
  );
}

/** Bring a submitted registration onto the ledger (shown where it waits). */
export function SyncButton({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const [sync, syncing] = useParticipantsSyncMutation();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={syncing.isLoading}
      onClick={() =>
        void sync({ id })
          .unwrap()
          .then(() => toast.success(t('people.actions.synced')))
          .catch((e: unknown) =>
            toast.error(errorText(toApiError(e as never)!, i18n)),
          )
      }
    >
      <RefreshCw /> {t('people.actions.sync')}
    </Button>
  );
}

function ActionDialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function VerifyDialog({
  person,
  open,
  onClose,
}: {
  person: Person;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [verify, verifying] = useParticipantsVerifyMutation();
  const [acknowledged, setAcknowledged] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const flagged = person.idCheckOutcome === 'flagged';
  const warnings = ((person.idCheck?.checks ?? []) as IdCheck[]).filter(
    (c) => c.result === 'warn',
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (flagged && !acknowledged) return;
    setError(null);
    try {
      await verify({
        id: person.id,
        verifyParticipantDto: flagged ? { acknowledgeFlags: true } : {},
      }).unwrap();
      toast.success(t('people.actions.verified', { name: person.fullName }));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title={t('people.actions.verifyTitle', { name: person.fullName })}
      description={t('people.actions.verifyText')}
    >
      <form noValidate onSubmit={(e) => void submit(e)} className="grid gap-5">
        {flagged && (
          <>
            <IdCheckList checks={warnings} />
            <Field
              orientation="horizontal"
              data-invalid={(tried && !acknowledged) || undefined}
            >
              <Checkbox
                id="verify-acknowledge"
                checked={acknowledged}
                onCheckedChange={(v) => setAcknowledged(v)}
              />
              <FieldLabel htmlFor="verify-acknowledge" className="font-normal">
                {t('people.actions.acknowledge')}
              </FieldLabel>
            </Field>
            {tried && !acknowledged && (
              <FieldError>{t('people.actions.acknowledgeFirst')}</FieldError>
            )}
          </>
        )}
        <FormError error={error} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('people.actions.cancel')}
          </Button>
          <Button type="submit" disabled={verifying.isLoading}>
            {verifying.isLoading
              ? t('people.actions.working')
              : t('people.actions.verify')}
          </Button>
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

const REASON_MIN = 3;
const REASON_MAX = 300;

function RejectDialog({
  person,
  open,
  onClose,
}: {
  person: Person;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reject, rejecting] = useParticipantsRejectMutation();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const short = reason.trim().length < REASON_MIN;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (short) return;
    setError(null);
    try {
      await reject({
        id: person.id,
        rejectParticipantDto: { reason: reason.trim() },
      }).unwrap();
      toast.success(t('people.actions.rejected', { name: person.fullName }));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title={t('people.actions.rejectTitle', { name: person.fullName })}
      description={
        person.status === 'verified'
          ? t('people.actions.rejectVerifiedText')
          : t('people.actions.rejectText')
      }
    >
      <form noValidate onSubmit={(e) => void submit(e)} className="grid gap-5">
        <Field data-invalid={(tried && short) || undefined}>
          <FieldLabel htmlFor="reject-reason">
            {t('people.actions.reason')}
          </FieldLabel>
          <Textarea
            id="reject-reason"
            rows={3}
            maxLength={REASON_MAX}
            value={reason}
            aria-invalid={(tried && short) || undefined}
            onChange={(e) => setReason(e.target.value)}
          />
          {tried && short && (
            <FieldError>
              {t('people.actions.reasonShort', { min: REASON_MIN })}
            </FieldError>
          )}
        </Field>
        <FormError error={error} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('people.actions.cancel')}
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={rejecting.isLoading}
          >
            {rejecting.isLoading
              ? t('people.actions.working')
              : t('people.actions.reject')}
          </Button>
        </DialogFooter>
      </form>
    </ActionDialog>
  );
}

function ResetDialog({
  person,
  open,
  onClose,
}: {
  person: Person;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reset, resetting] = useParticipantsResetPasswordMutation();
  const [result, setResult] = useState<{
    temporaryPassword: string;
    smsSent: boolean;
  } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    setError(null);
    try {
      setResult((await reset({ id: person.id }).unwrap()).data);
    } catch (e) {
      setError(toApiError(e as never));
    }
  }
  const done = () => {
    setResult(null);
    onClose();
  };

  return (
    <ActionDialog
      open={open}
      onClose={done}
      title={t('people.actions.resetTitle', { name: person.fullName })}
      description={result ? undefined : t('people.actions.resetText')}
    >
      {result ? (
        <>
          <TemporaryPassword
            password={result.temporaryPassword}
            smsSent={result.smsSent}
          />
          <DialogFooter>
            <Button onClick={done}>{t('people.actions.done')}</Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <FormError error={error} />
          <DialogFooter>
            <Button variant="ghost" onClick={done}>
              {t('people.actions.cancel')}
            </Button>
            <Button disabled={resetting.isLoading} onClick={() => void go()}>
              {resetting.isLoading
                ? t('people.actions.working')
                : t('people.actions.reset')}
            </Button>
          </DialogFooter>
        </>
      )}
    </ActionDialog>
  );
}

function ReplaceKeyDialog({
  person,
  open,
  onClose,
}: {
  person: Person;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [replace, replacing] = useParticipantsReplaceKeyMutation();
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    setError(null);
    try {
      await replace({ id: person.id }).unwrap();
      toast.success(t('people.actions.keyReplaced'));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title={t('people.actions.replaceKeyTitle', { name: person.fullName })}
      description={t('people.actions.replaceKeyText')}
    >
      <FormError error={error} />
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {t('people.actions.cancel')}
        </Button>
        <Button disabled={replacing.isLoading} onClick={() => void go()}>
          {replacing.isLoading
            ? t('people.actions.working')
            : t('people.actions.replaceKey')}
        </Button>
      </DialogFooter>
    </ActionDialog>
  );
}

function AssignDialog({
  person,
  open,
  onClose,
}: {
  person: Person;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState<string | undefined>();
  const officers = useParticipantsListQuery(
    { role: 'field_officer', status: 'verified', q, limit: 20 },
    { skip: !open },
  );
  const [assign, assigning] = useParticipantsAssignFieldOfficerMutation();
  const [officerId, setOfficerId] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const shown = (officers.data?.data ?? []).filter(
    (o) => o.id !== person.fieldOfficer?.id,
  );
  const more = (officers.data?.meta.total ?? 0) > shown.length + 1;

  async function go() {
    if (!officerId) return;
    setError(null);
    try {
      await assign({
        id: person.id,
        assignFieldOfficerDto: { officerId },
      }).unwrap();
      toast.success(t('people.actions.assigned'));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <ActionDialog
      open={open}
      onClose={onClose}
      title={t('people.actions.assignTitle', { name: person.fullName })}
      description={
        person.fieldOfficer
          ? t('people.actions.assignNow', { name: person.fieldOfficer.name })
          : t('people.actions.assignNone')
      }
    >
      <SearchBox
        value={q}
        onSearch={(next) => {
          setQ(next);
          setOfficerId(null);
        }}
        placeholder={t('people.actions.findOfficer')}
      />
      <fieldset className="grid max-h-72 gap-1.5 overflow-y-auto">
        <legend className="sr-only">{t('people.fieldOfficer')}</legend>
        {officers.isFetching && (
          <p className="text-sm text-muted-foreground">{t('states.loading')}</p>
        )}
        {!officers.isFetching && shown.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('people.noMatch')}</p>
        )}
        {shown.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={officerId === o.id}
            onClick={() => setOfficerId(o.id)}
            className={cn(
              'flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              officerId === o.id
                ? 'border-ink bg-nav-active/40 ring-1 ring-ink'
                : 'hover:bg-muted',
            )}
          >
            <span className="font-medium">{o.fullName}</span>
            <span className="text-sm text-muted-foreground">
              {o.district ? t(`districts.${o.district as District}`) : ''}
            </span>
          </button>
        ))}
        {more && (
          <p className="text-sm text-muted-foreground">
            {t('people.actions.narrowOfficers')}
          </p>
        )}
      </fieldset>
      <FormError error={error} />
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {t('people.actions.cancel')}
        </Button>
        <Button
          disabled={!officerId || assigning.isLoading}
          onClick={() => void go()}
        >
          {assigning.isLoading
            ? t('people.actions.working')
            : t('people.actions.assign')}
        </Button>
      </DialogFooter>
    </ActionDialog>
  );
}
