import { Link, useLocation } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/logo';
import { AREAS, type Area, type NavItem } from '../navigation';
import { NavEntry } from './nav-entry';
import { SectionEntry } from './section-entry';

/**
 * Desktop menu: always visible on the left. A section with several pages is
 * a dropdown; one is open at a time, the one you are in unless you open
 * another.
 */
export function Sidebar({ items }: { items: readonly NavItem[] }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const here = items.find(({ area }) => {
    const to: string = AREAS[area].to;
    return pathname === to || pathname.startsWith(`${to}/`);
  })?.area;
  // The reader's choice holds while they stay in the same section.
  const [choice, setChoice] = useState<{ at?: Area; open: Area | null }>({
    open: null,
  });
  const open = choice.at === here ? choice.open : (here ?? null);
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
              {item.pages && item.pages.length > 1 ? (
                <SectionEntry
                  item={{ ...item, pages: item.pages }}
                  open={open === item.area}
                  onToggle={() =>
                    setChoice({
                      at: here,
                      open: open === item.area ? null : item.area,
                    })
                  }
                />
              ) : (
                <NavEntry item={item} />
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
