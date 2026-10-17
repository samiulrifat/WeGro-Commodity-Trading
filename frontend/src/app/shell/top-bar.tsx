import { Link } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '@/components/language-switch';
import { Logo } from '@/components/logo';
import { buttonVariants } from '@/components/ui/button';
import { AccountMenu } from './account-menu';

/** Language, notifications and the account, on every page. */
export function TopBar() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
      <Link to="/" aria-label="WeGro" className="lg:hidden">
        <Logo className="h-7" />
      </Link>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <LanguageSwitch />
        <Link
          to="/notifications"
          aria-label={t('nav.notifications')}
          className={buttonVariants({ variant: 'ghost', size: 'icon' })}
        >
          <Bell className="size-5" />
        </Link>
        <AccountMenu />
      </div>
    </header>
  );
}
