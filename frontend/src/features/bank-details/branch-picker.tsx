import { skipToken } from '@reduxjs/toolkit/query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toApiError } from '@/api/errors';
import {
  useBankListBanksQuery,
  useBankListBranchesQuery,
  useBankListDistrictsQuery,
} from '@/api/generated/bank-list';
import { FormError } from '@/app/auth/form-error';
import { SearchSelect } from '@/components/ui/combobox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { branchOptions } from './bank-details';

/** Where the payee's account is: each choice narrows the next. */
export interface Choice {
  bankCode: number | null;
  districtCode: number | null;
  routingNumber: string | null;
}

/** Bank, district, branch; the branch's routing number shown as it comes. */
export function BranchPicker({
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
