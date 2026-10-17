import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/logo';
import type { NavItem } from '../navigation';
import { NavEntry } from './nav-entry';

/** Desktop menu: always visible on the left. */
export function Sidebar({ items }: { items: readonly NavItem[] }) {
  const { t } = useTranslation();
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card lg:flex">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link to="/" aria-label="WeGro">
          <Logo className="h-8" />
        </Link>
      </div>
      <nav
        aria-label={t('shell.menu')}
        className="flex-1 overflow-y-auto px-3 py-2"
      >
        <ul className="grid gap-1">
          {items.map((item) => (
            <li key={item.area}>
              <NavEntry item={item} />
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
