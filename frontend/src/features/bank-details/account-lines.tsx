import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { BankAccountDto } from '@/api/generated/bank-accounts';

/** One version of the details: where, which account, who entered and decided. */
export function AccountLines({ account }: { account: BankAccountDto }) {
  const { t } = useTranslation();
  const where = [account.branchName, account.districtName]
    .filter(Boolean)
    .join(', ');
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <Line label={t('bank.bank')}>{account.bankName}</Line>
      <Line label={t('bank.branch')}>{where}</Line>
      <Line label={t('bank.account')}>
        <span className="font-mono tracking-wider">
          {account.accountNumber}
        </span>
      </Line>
      <Line label={t('bank.routing')}>
        <span className="font-mono tracking-wider">
          {account.routingNumber}
        </span>
      </Line>
      <Line label={t('bank.holder')}>{account.holderName}</Line>
      <div className="grid gap-0.5 text-sm text-muted-foreground sm:col-span-2">
        <p>
          {t('bank.entered', {
            name: account.enteredBy.name,
            at: account.enteredAt,
          })}
        </p>
        {account.decidedBy && account.decidedAt && (
          <p>
            {t(
              account.status === 'rejected'
                ? 'bank.rejectedBy'
                : 'bank.verifiedBy',
              { name: account.decidedBy.name, at: account.decidedAt },
            )}
          </p>
        )}
      </div>
    </dl>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}
