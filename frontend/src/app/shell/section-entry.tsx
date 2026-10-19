import { Link, useLocation } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { AREAS, currentPage, type NavItem } from '../navigation';

const entry =
  'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * A section with several pages, as a dropdown: its name opens and closes
 * it; the page you are on is filled green.
 */
export function SectionEntry({
  item,
  open,
  onToggle,
  onNavigate,
}: {
  item: NavItem & { pages: NonNullable<NavItem['pages']> };
  open: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { to, icon: Icon } = AREAS[item.area];
  const inside = pathname === to || pathname.startsWith(`${to}/`);
  const current = inside ? currentPage(item.pages, pathname) : undefined;
  const listId = `section-${item.area}`;
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={onToggle}
        className={cn(entry, inside && 'text-foreground')}
      >
        <Icon aria-hidden className="size-5 shrink-0" />
        {t(`nav.${item.label}`)}
        <ChevronDown
          aria-hidden
          className={cn(
            'ml-auto size-4 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <ul id={listId} className="mt-0.5 ml-5 grid gap-0.5 border-l pl-3">
          {item.pages.map((page) => (
            <li key={page.to}>
              <Link
                to={page.to}
                onClick={onNavigate}
                aria-current={current === page ? 'page' : undefined}
                activeOptions={{ exact: true }}
                activeProps={{}}
                className={cn(
                  entry,
                  'min-h-10 font-medium',
                  current === page &&
                    'bg-nav-active text-nav-active-foreground hover:bg-nav-active',
                )}
              >
                {t(`nav.sub.${page.label}`)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
