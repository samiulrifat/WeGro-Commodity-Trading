import { BadgeCheck, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import {
  type BankAccountDto,
  useBankAccountsRejectMutation,
  useBankAccountsVerifyMutation,
} from '@/api/generated/bank-accounts';
import { FormError } from '@/app/auth/form-error';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { useAppSelector } from '@/store/hooks';
import { AccountLines } from './account-lines';

const REASON_MIN = 3;
const REASON_MAX = 500;

/**
 * Verify or reject a payee's waiting bank details. Whoever entered them
 * cannot verify them (the server refuses too); they may still reject.
 */
export function DecideBankDetails({
  personId,
  personName,
  pending,
  size,
}: {
  personId: string;
  personName: string;
  pending: BankAccountDto;
  size?: 'sm';
}) {
  const { t } = useTranslation();
  const me = useAppSelector((s) => s.session.user!.id);
  const [open, setOpen] = useState<'verify' | 'reject' | null>(null);
  const own = pending.enteredBy.id === me;
  const close = () => setOpen(null);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size={size} disabled={own} onClick={() => setOpen('verify')}>
          <BadgeCheck /> {t('bank.verify')}
        </Button>
        <Button
          size={size}
          variant="destructive"
          onClick={() => setOpen('reject')}
        >
          <X /> {t('bank.reject')}
        </Button>
      </div>
      {own && (
        <p className="text-sm text-muted-foreground">{t('bank.ownEntry')}</p>
      )}
      <VerifyDialog
        open={open === 'verify'}
        onClose={close}
        personId={personId}
        personName={personName}
        pending={pending}
      />
      <RejectDialog
        open={open === 'reject'}
        onClose={close}
        personId={personId}
      />
    </div>
  );
}

function VerifyDialog({
  open,
  onClose,
  personId,
  personName,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  personId: string;
  personName: string;
  pending: BankAccountDto;
}) {
  const { t } = useTranslation();
  const [verify, verifying] = useBankAccountsVerifyMutation();
  const [error, setError] = useState<ApiError | null>(null);

  async function submit() {
    setError(null);
    try {
      await verify({ id: personId }).unwrap();
      toast.success(t('bank.verifiedToast'));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('bank.verifyTitle')}</DialogTitle>
          <DialogDescription>
            {t('bank.verifyText', { name: personName })}
          </DialogDescription>
        </DialogHeader>
        <AccountLines account={pending} />
        <FormError error={error} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('bank.cancel')}
          </Button>
          <Button disabled={verifying.isLoading} onClick={() => void submit()}>
            {verifying.isLoading ? t('bank.working') : t('bank.verify')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  open,
  onClose,
  personId,
}: {
  open: boolean;
  onClose: () => void;
  personId: string;
}) {
  const { t } = useTranslation();
  const [reject, rejecting] = useBankAccountsRejectMutation();
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
        id: personId,
        rejectBankAccountDto: { reason: reason.trim() },
      }).unwrap();
      toast.success(t('bank.rejectedToast'));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('bank.rejectTitle')}</DialogTitle>
          <DialogDescription>{t('bank.rejectText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={(tried && short) || undefined}>
            <FieldLabel htmlFor="bank-reject-reason">
              {t('bank.rejectReason')}
            </FieldLabel>
            <Textarea
              id="bank-reject-reason"
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
              {t('bank.cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={rejecting.isLoading}
            >
              {rejecting.isLoading
                ? t('bank.working')
                : t('bank.rejectConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
