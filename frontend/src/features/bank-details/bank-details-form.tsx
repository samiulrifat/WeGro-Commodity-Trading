import { skipToken } from '@reduxjs/toolkit/query';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, toApiError } from '@/api/errors';
import type { BankDetailsDto } from '@/api/generated/bank-accounts';
import {
  useBankListBanksQuery,
  useBankListBranchQuery,
  useBankListBranchesQuery,
  useBankListDistrictsQuery,
} from '@/api/generated/bank-list';
import { FormError } from '@/app/auth/form-error';
import { LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { SearchSelect } from '@/components/ui/combobox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  accountDigits,
  branchOptions,
  holderName,
  isAccountNumber,
} from './bank-details';

/** Where the payee's account is: each choice narrows the next. */
interface Choice {
  bankCode: number | null;
  districtCode: number | null;
  routingNumber: string | null;
}

interface Draft extends Choice {
  holderName: string;
  accountNumber: string;
}

const EMPTY: Draft = {
  bankCode: null,
  districtCode: null,
  routingNumber: null,
  holderName: '',
  accountNumber: '',
};

/**
 * New bank details: bank, then district, then branch from the official
 * list, whose routing number comes from the server; then the account
 * number and the name on it. Changing details starts from the current ones.
 */
export function BankDetailsForm({
  current,
  onSubmit,
  onCancel,
}: {
  current?: BankDetailsDto | null;
  onSubmit: (details: BankDetailsDto) => Promise<void>;
  onCancel: () => void;
}) {
  // The current branch is looked up first, to start from its bank and district.
  const branch = useBankListBranchQuery(
    current ? { routingNumber: current.routingNumber } : skipToken,
  );
  if (current && branch.isLoading) return <LoadingState />;
  const found = branch.data?.data;
  const initial: Draft = current
    ? {
        holderName: current.holderName,
        accountNumber: current.accountNumber,
        // A branch no longer on the list is picked again.
        bankCode: found?.bank.code ?? null,
        districtCode: found?.district.code ?? null,
        routingNumber: found?.routingNumber ?? null,
      }
    : EMPTY;
  return <Form initial={initial} onSubmit={onSubmit} onCancel={onCancel} />;
}

function Form({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  onSubmit: (details: BankDetailsDto) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(initial);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const missing = {
    bank: draft.bankCode === null,
    district: draft.districtCode === null,
    branch: draft.routingNumber === null,
    holder: holderName(draft.holderName) === '',
    account: !isAccountNumber(draft.accountNumber),
  };
  const show = (key: keyof typeof missing) => tried && missing[key];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (Object.values(missing).some(Boolean)) return;
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        holderName: holderName(draft.holderName),
        accountNumber: accountDigits(draft.accountNumber),
        routingNumber: draft.routingNumber!,
      });
    } catch (e) {
      setError(toApiError(e as never));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="grid gap-5">
      <BranchPicker
        choice={draft}
        onChange={set}
        invalid={{
          bank: show('bank'),
          district: show('district'),
          branch: show('branch'),
        }}
      />
      <Field data-invalid={show('account') || undefined}>
        <FieldLabel htmlFor="bank-account-number">
          {t('bank.account')}
        </FieldLabel>
        <Input
          id="bank-account-number"
          inputMode="numeric"
          autoComplete="off"
          maxLength={30}
          value={draft.accountNumber}
          aria-invalid={show('account') || undefined}
          onChange={(e) => set({ accountNumber: e.target.value })}
        />
        {show('account') ? (
          <FieldError>{t('bank.required.account')}</FieldError>
        ) : (
          <FieldDescription>{t('bank.accountHint')}</FieldDescription>
        )}
      </Field>
      <Field data-invalid={show('holder') || undefined}>
        <FieldLabel htmlFor="bank-holder">{t('bank.holder')}</FieldLabel>
        <Input
          id="bank-holder"
          autoComplete="off"
          maxLength={100}
          value={draft.holderName}
          aria-invalid={show('holder') || undefined}
          onChange={(e) => set({ holderName: e.target.value })}
        />
        {show('holder') ? (
          <FieldError>{t('bank.required.holder')}</FieldError>
        ) : (
          <FieldDescription>{t('bank.holderHint')}</FieldDescription>
        )}
      </Field>
      <FieldDescription>{t('bank.replaces')}</FieldDescription>
      <FormError error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('bank.cancel')}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? t('bank.submitting') : t('bank.submit')}
        </Button>
      </div>
    </form>
  );
}

/** Bank, district, branch; the branch's routing number shown as it comes. */
function BranchPicker({
  choice,
  onChange,
  invalid,
}: {
  choice: Choice;
  onChange: (patch: Partial<Choice>) => void;
  invalid: { bank: boolean; district: boolean; branch: boolean };
}) {
  const { t } = useTranslation();
  const { bankCode, districtCode, routingNumber } = choice;
  const banks = useBankListBanksQuery();
  const districts = useBankListDistrictsQuery(
    bankCode === null ? skipToken : { bankCode },
  );
  const branches = useBankListBranchesQuery(
    bankCode === null || districtCode === null
      ? skipToken
      : { bankCode, districtCode },
  );

  const bankOptions = useMemo(
    () =>
      (banks.data?.data ?? []).map((b) => ({
        value: String(b.code),
        label: b.name,
      })),
    [banks.data],
  );
  const districtOptions = useMemo(
    () =>
      (districts.data?.data ?? []).map((d) => ({
        value: String(d.code),
        label: d.name,
      })),
    [districts.data],
  );
  const branchItems = useMemo(
    () => branchOptions(branches.data?.data ?? []),
    [branches.data],
  );
  const listError = toApiError(
    banks.error ?? districts.error ?? branches.error,
  );

  return (
    <>
      <Field data-invalid={invalid.bank || undefined}>
        <FieldLabel htmlFor="bank-bank">{t('bank.bank')}</FieldLabel>
        <SearchSelect
          id="bank-bank"
          options={bankOptions}
          value={bankCode === null ? null : String(bankCode)}
          onValueChange={(v) =>
            onChange({
              bankCode: v === null ? null : Number(v),
              districtCode: null,
              routingNumber: null,
            })
          }
          placeholder={t('bank.chooseBank')}
          emptyText={t('bank.noMatch')}
          disabled={banks.isLoading}
          invalid={invalid.bank}
        />
        {invalid.bank && <FieldError>{t('bank.required.bank')}</FieldError>}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field data-invalid={invalid.district || undefined}>
          <FieldLabel htmlFor="bank-district">{t('bank.district')}</FieldLabel>
          <SearchSelect
            id="bank-district"
            options={districtOptions}
            value={districtCode === null ? null : String(districtCode)}
            onValueChange={(v) =>
              onChange({
                districtCode: v === null ? null : Number(v),
                routingNumber: null,
              })
            }
            placeholder={
              bankCode === null ? t('bank.bankFirst') : t('bank.chooseDistrict')
            }
            emptyText={t('bank.noMatch')}
            disabled={bankCode === null || districts.isFetching}
            invalid={invalid.district}
          />
          {invalid.district && (
            <FieldError>{t('bank.required.district')}</FieldError>
          )}
        </Field>
        <Field data-invalid={invalid.branch || undefined}>
          <FieldLabel htmlFor="bank-branch">{t('bank.branch')}</FieldLabel>
          <SearchSelect
            id="bank-branch"
            options={branchItems}
            value={routingNumber}
            onValueChange={(v) => onChange({ routingNumber: v })}
            placeholder={
              districtCode === null
                ? t('bank.districtFirst')
                : t('bank.chooseBranch')
            }
            emptyText={t('bank.noMatch')}
            disabled={districtCode === null || branches.isFetching}
            invalid={invalid.branch}
          />
          {invalid.branch && (
            <FieldError>{t('bank.required.branch')}</FieldError>
          )}
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="bank-routing">{t('bank.routing')}</FieldLabel>
        <Input
          id="bank-routing"
          readOnly
          tabIndex={-1}
          value={routingNumber ?? ''}
          placeholder="—"
          className="bg-muted font-mono tracking-wider"
        />
        <FieldDescription>{t('bank.routingHint')}</FieldDescription>
      </Field>
      <FormError error={listError} />
    </>
  );
}
