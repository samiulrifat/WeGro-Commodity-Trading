import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useProjectsListQuery } from '@/api/generated/projects';
import { useSettlementAddCostMutation } from '@/api/generated/settlement';
import { FormError } from '@/app/auth/form-error';
import { PhotoPicker } from '@/components/photo-picker';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { typedTaka } from '@/features/projects/project-math';
import { todayBd } from '@/lib/format';
import { usePhotoPicks } from '@/lib/use-photo-picks';
import { cn } from '@/lib/utils';
import { COST_CATEGORIES, type CostCategory } from './payouts-utils';

/**
 * Accounts enters a cost of a project (transport, labour, storage…) with a
 * photo of its bill, which is required. It is fingerprinted on the ledger
 * and counts against the project's profit; a wrong one is voided, not edited.
 */
export function AddCostDialog({
  projectId: fixed,
  onClose,
}: {
  projectId?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const funded = useProjectsListQuery(
    { stage: 'funded', limit: 100 },
    { skip: !!fixed },
  );
  const active = useProjectsListQuery(
    { stage: 'active', limit: 100 },
    { skip: !!fixed },
  );
  const ready = useProjectsListQuery(
    { stage: 'ready_for_sale', limit: 100 },
    { skip: !!fixed },
  );
  const [add, adding] = useSettlementAddCostMutation();
  const picks = usePhotoPicks(1);
  const today = todayBd();
  const [projectId, setProjectId] = useState<string | null>(fixed ?? null);
  const [category, setCategory] = useState<CostCategory | null>(null);
  const [amount, setAmount] = useState('');
  const [incurredOn, setIncurredOn] = useState(today);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const projects = useMemo(
    () =>
      [funded.data, active.data, ready.data]
        .flatMap((d) => d?.data ?? [])
        .map((p) => ({
          value: p.id,
          label: `${p.title} · ${p.farmer.fullName}`,
        })),
    [funded.data, active.data, ready.data],
  );
  const taka = typedTaka(amount);
  const missing = {
    project: !projectId,
    category: !category,
    amount: !taka || taka === '0' || /^0(\.0+)?$/.test(taka),
    incurredOn: !incurredOn || incurredOn > today,
    note: !note.trim(),
    bill: picks.ids.length === 0,
  };
  const show = (k: keyof typeof missing) => tried && missing[k];
  const busy = adding.isLoading || picks.uploading;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (picks.uploading || Object.values(missing).some(Boolean)) return;
    setError(null);
    try {
      await add({
        projectId: projectId!,
        addCostDto: {
          category: category!,
          amount: taka!,
          incurredOn,
          note: note.trim(),
          photoId: picks.ids[0]!,
        },
      }).unwrap();
      toast.success(t('payouts.costAdded'));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('payouts.addCost')}</DialogTitle>
          <DialogDescription>{t('payouts.addCostText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          {!fixed && (
            <Field data-invalid={show('project') || undefined}>
              <FieldLabel htmlFor="cost-project">
                {t('warehouse.project')}
              </FieldLabel>
              <SearchSelect
                id="cost-project"
                options={projects}
                value={projectId}
                onValueChange={setProjectId}
                placeholder={t('warehouse.chooseProject')}
                emptyText={t('payouts.noOpenProjects')}
                invalid={show('project')}
              />
              {show('project') && (
                <FieldError>{t('warehouse.required.project')}</FieldError>
              )}
            </Field>
          )}
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">
              {t('payouts.category')}
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {COST_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    'min-h-11 rounded-lg border px-3 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    category === c
                      ? 'border-ink bg-ink text-white'
                      : 'bg-card hover:bg-muted',
                    show('category') && 'border-danger',
                  )}
                >
                  {t(`payouts.costCategory.${c}`)}
                </button>
              ))}
            </div>
            {show('category') && (
              <p className="text-sm text-danger">
                {t('payouts.required.category')}
              </p>
            )}
          </fieldset>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={show('amount') || undefined}>
              <FieldLabel htmlFor="cost-amount">
                {t('payouts.amount')}
              </FieldLabel>
              <Input
                id="cost-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={show('amount') || undefined}
              />
              {show('amount') && (
                <FieldError>{t('payouts.required.amount')}</FieldError>
              )}
            </Field>
            <Field data-invalid={show('incurredOn') || undefined}>
              <FieldLabel htmlFor="cost-date">
                {t('payouts.incurredOn')}
              </FieldLabel>
              <Input
                id="cost-date"
                type="date"
                max={today}
                value={incurredOn}
                onChange={(e) => setIncurredOn(e.target.value)}
                aria-invalid={show('incurredOn') || undefined}
              />
              {show('incurredOn') && (
                <FieldError>{t('payouts.required.incurredOn')}</FieldError>
              )}
            </Field>
          </div>
          <Field data-invalid={show('note') || undefined}>
            <FieldLabel htmlFor="cost-note">{t('payouts.note')}</FieldLabel>
            <Textarea
              id="cost-note"
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-invalid={show('note') || undefined}
            />
            {show('note') ? (
              <FieldError>{t('payouts.required.note')}</FieldError>
            ) : (
              <FieldDescription>{t('payouts.noteHint')}</FieldDescription>
            )}
          </Field>
          <Field data-invalid={show('bill') || undefined}>
            <FieldLabel>{t('payouts.bill')}</FieldLabel>
            <PhotoPicker picks={picks} invalid={show('bill')} />
            {show('bill') ? (
              <FieldError>{t('payouts.required.bill')}</FieldError>
            ) : (
              <FieldDescription>{t('payouts.billHint')}</FieldDescription>
            )}
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t('people.actions.working') : t('payouts.addCost')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
