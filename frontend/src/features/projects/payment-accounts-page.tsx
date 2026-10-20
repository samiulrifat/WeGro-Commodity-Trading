import { skipToken } from '@reduxjs/toolkit/query';
import { useNavigate } from '@tanstack/react-router';
import { Landmark, Pencil, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useBankListBranchQuery } from '@/api/generated/bank-list';
import {
  type PaymentAccountDto,
  usePaymentAccountsAllQuery,
  usePaymentAccountsCreateMutation,
  usePaymentAccountsUpdateMutation,
} from '@/api/generated/payment-accounts';
import { FormError } from '@/app/auth/form-error';
import { PageHeader } from '@/components/page-header';
import { SearchBox } from '@/components/search-box';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  accountDigits,
  isAccountNumber,
} from '@/features/bank-details/bank-details';
import {
  BranchPicker,
  type Choice,
} from '@/features/bank-details/branch-picker';
import { CheckField, TextField } from '@/features/catalog/entry-form';
import type { RefundsSearch } from './projects-search';

/** Words typed must each start a word of the bank, branch, account name or number. */
function matches(a: PaymentAccountDto, q: string | undefined): boolean {
  const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const have = [
    a.bankName,
    a.branchName,
    a.accountName,
    a.accountNumber,
    a.routingNumber,
  ]
    .join(' ')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u);
  return words.every((w) => have.some((h) => h.startsWith(w)));
}

/**
 * WeGro's accounts investors pay into: added and changed by the super
 * admin and Accounts, the branch picked from the bank list. Retired ones
 * stay listed here but investors no longer see them.
 */
export function PaymentAccountsPage({ search }: { search: RefundsSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const query = usePaymentAccountsAllQuery();
  const [editing, setEditing] = useState<PaymentAccountDto | 'new' | null>(
    null,
  );
  const rows = (query.data?.data ?? []).filter((a) => matches(a, search.q));
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.paymentAccounts')}
        description={t('paymentAccounts.intro')}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> {t('paymentAccounts.add')}
          </Button>
        }
      />
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) =>
          void navigate({ to: '/projects/payment-accounts', search: { q } })
        }
        placeholder={t('paymentAccounts.search')}
      />
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && rows.length === 0 && (
        <EmptyState
          icon={Landmark}
          title={search.q ? t('catalog.noMatch') : t('paymentAccounts.none')}
          description={search.q ? undefined : t('paymentAccounts.noneHint')}
        />
      )}
      <ul className="grid gap-4 md:grid-cols-2">
        {rows.map((a) => (
          <li key={a.id} className="grid gap-3 rounded-2xl border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="grid gap-0.5">
                <p className="font-semibold">{a.bankName}</p>
                <p className="text-sm text-muted-foreground">
                  {[a.branchName, a.districtName].filter(Boolean).join(', ')} ·{' '}
                  {a.routingNumber}
                </p>
              </div>
              <StatusPill
                tone={a.active ? 'success' : 'neutral'}
                appearance="soft"
              >
                {a.active
                  ? t('catalog.status.active')
                  : t('catalog.status.retired')}
              </StatusPill>
            </div>
            <dl className="grid gap-1">
              <dt className="sr-only">{t('bank.holder')}</dt>
              <dd className="font-medium">{a.accountName}</dd>
              <dt className="sr-only">{t('bank.account')}</dt>
              <dd className="font-mono tracking-wide">{a.accountNumber}</dd>
            </dl>
            <div>
              <Button variant="outline" size="sm" onClick={() => setEditing(a)}>
                <Pencil /> {t('catalog.edit')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <AccountDialog
          account={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function AccountDialog({
  account,
  onClose,
}: {
  account: PaymentAccountDto | null;
  onClose: () => void;
}) {
  // Changing an account starts from its branch on the list.
  const branch = useBankListBranchQuery(
    account ? { routingNumber: account.routingNumber } : skipToken,
  );
  if (account && branch.isLoading) return null;
  const found = branch.data?.data;
  return (
    <AccountForm
      account={account}
      initial={{
        bankCode: found?.bank.code ?? null,
        districtCode: found?.district.code ?? null,
        routingNumber: found?.routingNumber ?? null,
      }}
      onClose={onClose}
    />
  );
}

function AccountForm({
  account,
  initial,
  onClose,
}: {
  account: PaymentAccountDto | null;
  initial: Choice;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [create] = usePaymentAccountsCreateMutation();
  const [update] = usePaymentAccountsUpdateMutation();
  const [choice, setChoice] = useState<Choice>(initial);
  const [name, setName] = useState(account?.accountName ?? '');
  const [number, setNumber] = useState(account?.accountNumber ?? '');
  const [order, setOrder] = useState(String(account?.sortOrder ?? 0));
  const [active, setActive] = useState(account?.active ?? true);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const missing = {
    bank: choice.bankCode === null,
    district: choice.districtCode === null,
    branch: choice.routingNumber === null,
    name: name.trim() === '',
    number: !isAccountNumber(number),
  };
  const show = (k: keyof typeof missing) => tried && missing[k];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(missing).some(Boolean)) return;
    setError(null);
    setBusy(true);
    const body = {
      routingNumber: choice.routingNumber!,
      accountName: name.trim(),
      accountNumber: accountDigits(number),
      sortOrder: Math.min(1000, Math.max(0, Number(order) || 0)),
    };
    try {
      if (account) {
        await update({
          id: account.id,
          updatePaymentAccountDto: { ...body, active },
        }).unwrap();
      } else {
        await create({ createPaymentAccountDto: body }).unwrap();
      }
      toast.success(t('paymentAccounts.saved'));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {account ? t('paymentAccounts.edit') : t('paymentAccounts.add')}
          </DialogTitle>
          <DialogDescription>{t('paymentAccounts.formText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <BranchPicker
            choice={choice}
            onChange={(patch) => setChoice((c) => ({ ...c, ...patch }))}
            invalid={{
              bank: show('bank'),
              district: show('district'),
              branch: show('branch'),
            }}
          />
          <TextField
            id="payment-account-name"
            label={t('bank.holder')}
            value={name}
            maxLength={100}
            onChange={setName}
            error={show('name') ? t('bank.required.holder') : undefined}
          />
          <TextField
            id="payment-account-number"
            label={t('bank.account')}
            value={number}
            inputMode="numeric"
            maxLength={30}
            mono
            onChange={setNumber}
            error={show('number') ? t('bank.required.account') : undefined}
          />
          <TextField
            id="payment-account-order"
            label={t('catalog.fields.sortOrder')}
            value={order}
            inputMode="numeric"
            maxLength={4}
            onChange={setOrder}
            hint={t('paymentAccounts.orderHint')}
          />
          {account && (
            <CheckField
              id="payment-account-active"
              label={t('catalog.fields.active')}
              hint={t('paymentAccounts.activeHint')}
              checked={active}
              onChange={setActive}
            />
          )}
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t('catalog.saving') : t('catalog.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
