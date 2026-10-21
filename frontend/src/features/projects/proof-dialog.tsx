import { Paperclip, Upload, X } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useBankListBanksQuery } from '@/api/generated/bank-list';
import type { ReservationDto } from '@/api/generated/projects';
import { FormError } from '@/app/auth/form-error';
import { Button } from '@/components/ui/button';
import { SearchSelect } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useFormat } from '@/i18n/use-format';
import { todayBd } from '@/lib/format';
import { cn } from '@/lib/utils';
import { usePaymentProofsSubmitMutation } from './api';
import { toPoisha, typedTaka } from './project-math';

const METHODS = ['bank_deposit', 'cash', 'cheque'] as const;
type Method = (typeof METHODS)[number];
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

/**
 * Sending proof of a transfer: how much (at most what is left), when, how,
 * from which bank, and 1 to 3 photos or PDFs. The booking's clock stops
 * while Accounts checks it.
 */
export function ProofDialog({
  reservation: r,
  onClose,
}: {
  reservation: ReservationDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const banks = useBankListBanksQuery();
  const [submit, submitting] = usePaymentProofsSubmitMutation();
  const [amount, setAmount] = useState(r.remaining.replace(/\.00$/, ''));
  const [date, setDate] = useState(todayBd());
  const [method, setMethod] = useState<Method>('bank_deposit');
  const [bank, setBank] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const left = toPoisha(r.remaining);
  const typed = typedTaka(amount);
  const value = typed ? toPoisha(typed) : null;
  const banked = method !== 'cash';
  const bankOptions = useMemo(
    () =>
      (banks.data?.data ?? []).map((b) => ({
        value: String(b.code),
        label: b.name,
      })),
    [banks.data],
  );
  const problems = {
    amount: value === null || value <= 0n || value > left,
    date: !date || date > todayBd(),
    bank: banked && bank === null,
    files: files.length === 0,
  };
  const show = (k: keyof typeof problems) => tried && problems[k];

  function add(list: FileList | null) {
    const chosen = [...(list ?? [])];
    const bad = chosen.find((f) => !TYPES.has(f.type) || f.size > MAX_BYTES);
    if (bad) {
      toast.error(t('booking.fileRule'));
      return;
    }
    setFiles((now) => [...now, ...chosen].slice(0, MAX_FILES));
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (Object.values(problems).some(Boolean)) return;
    setError(null);
    try {
      await submit({
        id: r.id,
        body: {
          files,
          amount: typed!,
          transferredOn: date,
          method,
          ...(banked && bank !== null && { bankCode: Number(bank) }),
          ...(reference.trim() && { reference: reference.trim() }),
          ...(note.trim() && { note: note.trim() }),
        },
      }).unwrap();
      toast.success(t('booking.sent'));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('booking.upload')}</DialogTitle>
          <DialogDescription>{t('booking.uploadText')}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(e) => void send(e)} className="grid gap-5">
          <Field data-invalid={show('amount') || undefined}>
            <FieldLabel htmlFor="proof-amount">
              {t('booking.amount')}
            </FieldLabel>
            <div className="relative">
              <Input
                id="proof-amount"
                inputMode="decimal"
                value={amount}
                aria-invalid={show('amount') || undefined}
                onChange={(e) => setAmount(e.target.value)}
                className="pr-16 text-lg font-bold"
              />
              {value === left && (
                <span className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-success-soft px-2 py-0.5 text-xs font-bold text-success">
                  {t('booking.full')}
                </span>
              )}
            </div>
            {show('amount') ? (
              <FieldError>
                {t('booking.amountRule', { left: fmt.taka(r.remaining) })}
              </FieldError>
            ) : (
              <FieldDescription>
                {t('booking.leftToPay', { left: fmt.taka(r.remaining) })}
              </FieldDescription>
            )}
          </Field>

          <Field data-invalid={show('date') || undefined}>
            <FieldLabel htmlFor="proof-date">{t('booking.date')}</FieldLabel>
            <Input
              id="proof-date"
              type="date"
              max={todayBd()}
              value={date}
              aria-invalid={show('date') || undefined}
              onChange={(e) => setDate(e.target.value)}
            />
            {show('date') && <FieldError>{t('booking.dateRule')}</FieldError>}
          </Field>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">
              {t('booking.methodLabel')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={method === m}
                  onClick={() => setMethod(m)}
                  className={cn(
                    'min-h-11 rounded-full border px-5 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    method === m
                      ? 'border-brand bg-brand text-white'
                      : 'bg-card hover:bg-muted',
                  )}
                >
                  {t(`booking.method.${m}`)}
                </button>
              ))}
            </div>
          </fieldset>

          {banked && (
            <Field data-invalid={show('bank') || undefined}>
              <FieldLabel htmlFor="proof-bank">
                {t('booking.bankFrom')}
              </FieldLabel>
              <SearchSelect
                id="proof-bank"
                options={bankOptions}
                value={bank}
                onValueChange={setBank}
                placeholder={t('bank.chooseBank')}
                emptyText={t('bank.noMatch')}
                invalid={show('bank')}
              />
              {show('bank') && (
                <FieldError>{t('bank.required.bank')}</FieldError>
              )}
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="proof-reference">
              {t('booking.reference')}
            </FieldLabel>
            <Input
              id="proof-reference"
              maxLength={64}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <FieldDescription>{t('booking.referenceHint')}</FieldDescription>
          </Field>

          <Field data-invalid={show('files') || undefined}>
            <FieldLabel htmlFor="proof-files">{t('booking.proof')}</FieldLabel>
            <label
              htmlFor="proof-files"
              className={cn(
                'flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/50 text-sm text-muted-foreground hover:bg-muted',
                files.length >= MAX_FILES && 'pointer-events-none opacity-50',
              )}
            >
              <Paperclip aria-hidden className="size-4" />
              {t('booking.attach')}
            </label>
            <input
              id="proof-files"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              disabled={files.length >= MAX_FILES}
              onChange={(e) => {
                add(e.target.files);
                e.target.value = '';
              }}
            />
            {files.length > 0 && (
              <ul className="grid gap-1.5">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span className="truncate">{f.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('booking.removeFile', { name: f.name })}
                      onClick={() =>
                        setFiles((now) => now.filter((_, j) => j !== i))
                      }
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {show('files') ? (
              <FieldError>{t('booking.filesRule')}</FieldError>
            ) : (
              <FieldDescription>{t('booking.fileRule')}</FieldDescription>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="proof-note">{t('booking.note')}</FieldLabel>
            <Textarea
              id="proof-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <FormError error={error} />
          <Button
            type="submit"
            className="min-h-12"
            disabled={submitting.isLoading}
          >
            <Upload />
            {submitting.isLoading ? t('bank.submitting') : t('booking.submit')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
