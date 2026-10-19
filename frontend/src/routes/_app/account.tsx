import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { MyDetails } from '@/app/account/my-details';
import {
  LedgerAccountCard,
  PasswordCard,
  SignOutEverywhereCard,
} from '@/app/account/security';
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
  return (
    <div className="grid gap-6">
      <PageHeader title={t('account.title')} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <MyDetails />
        <PasswordCard />
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
