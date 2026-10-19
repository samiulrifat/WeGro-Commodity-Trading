import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { EmailCard } from '@/features/account/email-card';
import { MyBankAccountCard } from '@/features/bank-details/bank-account-card';
import { MyDetails } from '@/features/account/my-details';
import {
  LedgerAccountCard,
  PasswordCard,
  SignOutEverywhereCard,
} from '@/features/account/security';
import { isStaff } from '@/app/navigation';
import { LanguageSwitch } from '@/components/language-switch';
import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAppSelector } from '@/store/hooks';

/** Open to everyone signed in: their details, language, password, sessions. */
export const Route = createFileRoute('/_app/account')({
  component: AccountPage,
});

function AccountPage() {
  const { t } = useTranslation();
  const role = useAppSelector((s) => s.session.user?.role);
  const payee = role === 'farmer' || role === 'investor';
  return (
    <div className="grid gap-6">
      <PageHeader title={t('account.title')} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <MyDetails />
        <div className="grid gap-6">
          {payee && <MyBankAccountCard />}
          <PasswordCard />
          <EmailCard />
        </div>
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {t('account.language.title')}
              </CardTitle>
              <CardDescription>{t('account.language.intro')}</CardDescription>
            </CardHeader>
            <CardContent>
              <LanguageSwitch />
            </CardContent>
          </Card>
          {role && isStaff(role) && <LedgerAccountCard />}
          <SignOutEverywhereCard />
        </div>
      </div>
    </div>
  );
}
