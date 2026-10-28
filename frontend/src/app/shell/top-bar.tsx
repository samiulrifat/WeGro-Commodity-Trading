import { Link } from '@tanstack/react-router';
import { LanguageSwitch } from '@/components/language-switch';
import { Logo } from '@/components/logo';
import { NotificationBell } from '@/features/notifications/bell';
import { AccountMenu } from './account-menu';

/** Language, notifications and the account, on every page. */
export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
      <Link
        to="/"
        aria-label="WeGro"
        className="flex min-h-11 items-center lg:hidden"
      >
        <Logo className="h-7" />
      </Link>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <LanguageSwitch />
        <NotificationBell />
        <AccountMenu />
      </div>
    </header>
  );
}
