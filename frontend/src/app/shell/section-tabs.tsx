import { Link, useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { AREAS, currentPage, navFor } from '../navigation';

/**
 * On phones, the pages of the section you are in, as tabs under the page
 * title (the sidebar's dropdown does this on desktops). Nothing for a
 * section of one page.
 */
export function SectionTabs({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const user = useAppSelector((s) => s.session.user);
  const section = user
    ? navFor(user).find((n) => {
        const to: string = AREAS[n.area].to;
        return pathname === to || pathname.startsWith(`${to}/`);
      })
    : undefined;
  if (!section?.pages || section.pages.length < 2) return null;
  const current = currentPage(section.pages, pathname);
  return (
    <nav
      aria-label={t(`nav.${section.label}`)}
      className={cn('-mx-4 overflow-x-auto px-4', className)}
    >
      <ul className="flex w-max gap-1 rounded-lg bg-muted p-1">
        {section.pages.map((page) => (
          <li key={page.to}>
            <Link
              to={page.to}
              aria-current={current === page ? 'page' : undefined}
              activeOptions={{ exact: true }}
              activeProps={{}}
              className={cn(
                'flex min-h-10 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                current === page &&
                  'bg-nav-active text-nav-active-foreground shadow-sm',
              )}
            >
              {t(`nav.sub.${page.label}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
