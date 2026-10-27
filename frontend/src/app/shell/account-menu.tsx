import { useNavigate } from '@tanstack/react-router';
import { LogOut, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthMeQuery } from '@/api/generated/auth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppSelector } from '@/store/hooks';
import { InstallApp, InstallIcon } from '../pwa/install-app';
import { store } from '@/store/store';
import { signOut } from '../session';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

/** Who is signed in, their account, and signing out. */
export function AccountMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user?.role);
  const { data } = useAuthMeQuery();
  const name = data?.data.fullName;
  const roleName = role ? t(`roles.${role}`) : '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('shell.account')}
        className="flex min-h-11 items-center gap-2 rounded-md px-1.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Avatar>
          <AvatarFallback className="bg-brand text-brand-foreground font-bold">
            {name ? initials(name) : <UserRound className="size-4" />}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-40 truncate text-left text-sm leading-tight md:block">
          <span className="block font-semibold" translate="no">
            {name}
          </span>
          <span className="block text-muted-foreground">{roleName}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span
              className="block font-semibold text-foreground"
              translate="no"
            >
              {name}
            </span>
            <span className="block font-normal">{roleName}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void navigate({ to: '/account' })}>
          <UserRound /> {t('nav.account')}
        </DropdownMenuItem>
        <InstallApp
          render={(open) => (
            <DropdownMenuItem onClick={open}>
              <InstallIcon /> {t('pwa.install')}
            </DropdownMenuItem>
          )}
        />
        <DropdownMenuItem
          onClick={() =>
            void signOut(store).then(() => navigate({ to: '/sign-in' }))
          }
        >
          <LogOut /> {t('shell.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
