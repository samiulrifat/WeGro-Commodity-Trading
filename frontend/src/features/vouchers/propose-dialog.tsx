import { skipToken } from '@reduxjs/toolkit/query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useCatalogGetQuery } from '@/api/generated/catalog';
import { useProjectsListQuery } from '@/api/generated/projects';
import {
  useVouchersProposeMutation,
  useVouchersSummaryQuery,
  useVouchersSuppliersQuery,
} from '@/api/generated/vouchers';
import { FormError } from '@/app/auth/form-error';
import { SearchBox } from '@/components/search-box';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { typedTaka } from '@/features/projects/project-math';
import { useFormat } from '@/i18n/use-format';
import { latinDigits } from '@/lib/format';
import { voucherValue } from './voucher-search';

const MAX_SUPPLIERS = 20;

/**
 * Operations proposes a voucher: inputs for a funded or active project's
 * farmer, at today's price, from chosen suppliers. It waits for Accounts;
 * its value must fit in what the project has left for inputs.
 */
export function ProposeDialog({
  projectId: fixed,
  onClose,
}: {
  projectId?: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const navigate = useNavigate();
  const bengali = i18n.resolvedLanguage === 'bn';
  const funded = useProjectsListQuery(
    { stage: 'funded', limit: 100 },
    { skip: !!fixed },
  );
  const active = useProjectsListQuery(
    { stage: 'active', limit: 100 },
    { skip: !!fixed },
  );
  const catalog = useCatalogGetQuery({});
  const [projectId, setProjectId] = useState<string | null>(fixed ?? null);
  const [input, setInput] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [q, setQ] = useState<string | undefined>();
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [propose, proposing] = useVouchersProposeMutation();
  const summary = useVouchersSummaryQuery(
    projectId ? { projectId } : skipToken,
  );
  const supplierList = useVouchersSuppliersQuery({ q, limit: 50 });

  const projects = useMemo(
    () =>
      [...(funded.data?.data ?? []), ...(active.data?.data ?? [])].map((p) => ({
        value: p.id,
        label: `${p.title} · ${p.farmer.fullName}`,
      })),
    [funded.data, active.data],
  );
  const inputs = useMemo(
    () =>
      (catalog.data?.data.inputTypes ?? []).map((i) => ({
        value: i.code,
        label: bengali ? i.nameBn : i.name,
      })),
    [catalog.data, bengali],
  );
  const unit = catalog.data?.data.inputTypes.find((i) => i.code === input);
  const unitSymbol =
    catalog.data?.data.units.find((u) => u.code === unit?.unitCode)?.symbol ??
    '';
  const qty = Number(latinDigits(quantity));
  const unitPrice = typedTaka(price);
  const value =
    unitPrice && Number.isInteger(qty) && qty > 0
      ? voucherValue(qty, unitPrice)
      : null;
  const missing = {
    project: !projectId,
    input: !input,
    quantity: !Number.isInteger(qty) || qty < 1,
    price: !unitPrice || unitPrice === '0',
    suppliers: suppliers.length === 0,
  };
  const show = (k: keyof typeof missing) => tried && missing[k];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(missing).some(Boolean)) return;
    setError(null);
    try {
      const res = await propose({
        projectId: projectId!,
        proposeVoucherDto: {
          inputTypeCode: input!,
          quantity: qty,
          unitPrice: unitPrice!,
          supplierIds: suppliers,
        },
      }).unwrap();
      toast.success(t('vouchers.proposed'));
      onClose();
      void navigate({
        to: '/vouchers/$voucherId',
        params: { voucherId: res.data.id },
      });
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  const toggle = (id: string, on: boolean) =>
    setSuppliers((now) =>
      on ? [...now, id].slice(0, MAX_SUPPLIERS) : now.filter((x) => x !== id),
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('vouchers.propose')}</DialogTitle>
          <DialogDescription>{t('vouchers.proposeText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          {!fixed && (
            <Field data-invalid={show('project') || undefined}>
              <FieldLabel htmlFor="voucher-project">
                {t('vouchers.project')}
              </FieldLabel>
              <SearchSelect
                id="voucher-project"
                options={projects}
                value={projectId}
                onValueChange={setProjectId}
                placeholder={t('vouchers.chooseProject')}
                emptyText={t('vouchers.noProjects')}
                invalid={show('project')}
              />
              {show('project') && (
                <FieldError>{t('vouchers.required.project')}</FieldError>
              )}
            </Field>
          )}
          {summary.data && (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm">
              {t('vouchers.room', { amount: fmt.taka(summary.data.data.room) })}
            </p>
          )}
          <Field data-invalid={show('input') || undefined}>
            <FieldLabel htmlFor="voucher-input">
              {t('vouchers.input')}
            </FieldLabel>
            <SearchSelect
              id="voucher-input"
              options={inputs}
              value={input}
              onValueChange={setInput}
              placeholder={t('vouchers.chooseInput')}
              emptyText={t('bank.noMatch')}
              invalid={show('input')}
            />
            {show('input') && (
              <FieldError>{t('vouchers.required.input')}</FieldError>
            )}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={show('quantity') || undefined}>
              <FieldLabel htmlFor="voucher-quantity">
                {t('vouchers.quantity')}
                {unitSymbol && ` (${unitSymbol})`}
              </FieldLabel>
              <Input
                id="voucher-quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-invalid={show('quantity') || undefined}
              />
              {show('quantity') && (
                <FieldError>{t('vouchers.required.quantity')}</FieldError>
              )}
            </Field>
            <Field data-invalid={show('price') || undefined}>
              <FieldLabel htmlFor="voucher-price">
                {t('vouchers.unitPrice')}
              </FieldLabel>
              <Input
                id="voucher-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-invalid={show('price') || undefined}
              />
              {show('price') ? (
                <FieldError>{t('vouchers.required.price')}</FieldError>
              ) : (
                <FieldDescription>{t('vouchers.priceHint')}</FieldDescription>
              )}
            </Field>
          </div>
          {value && (
            <p className="flex justify-between rounded-lg bg-success-soft px-4 py-3 text-success">
              <span className="font-medium">{t('vouchers.value')}</span>
              <span className="font-bold">{fmt.taka(value)}</span>
            </p>
          )}
          <fieldset
            className="grid gap-3"
            aria-invalid={show('suppliers') || undefined}
          >
            <legend className="mb-2 text-sm font-medium">
              {t('vouchers.suppliers')}
            </legend>
            <SearchBox
              inForm
              value={q}
              onSearch={setQ}
              placeholder={t('vouchers.findSupplier')}
            />
            <ul className="grid max-h-56 gap-1.5 overflow-y-auto">
              {(supplierList.data?.data ?? []).map((s) => (
                <li key={s.id}>
                  <Field
                    orientation="horizontal"
                    className="rounded-lg border px-3 py-2"
                  >
                    <Checkbox
                      id={`supplier-${s.id}`}
                      checked={suppliers.includes(s.id)}
                      onCheckedChange={(v) => toggle(s.id, v)}
                    />
                    <FieldLabel
                      htmlFor={`supplier-${s.id}`}
                      className="font-normal"
                    >
                      {s.name}
                    </FieldLabel>
                  </Field>
                </li>
              ))}
            </ul>
            {show('suppliers') ? (
              <FieldError>{t('vouchers.required.suppliers')}</FieldError>
            ) : (
              <FieldDescription>
                {t('vouchers.suppliersChosen', { count: suppliers.length })}
              </FieldDescription>
            )}
          </fieldset>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={proposing.isLoading}>
              {proposing.isLoading
                ? t('people.actions.working')
                : t('vouchers.submitProposal')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
