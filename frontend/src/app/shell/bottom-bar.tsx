import { Link, useLocation } from '@tanstack/react-router';
import { Ellipsis } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { AREAS, type NavItem } from '../navigation';
import { NavEntry } from './nav-entry';

/** Up to five places on a phone; with more, four and a "More" sheet. */
const BAR_SLOTS = 5;

const slot =
  'flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-xs font-semibold text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[status=active]:text-brand';

/** Phone menu: fixed at the bottom, within thumb reach. */
export function BottomBar({ items }: { items: readonly NavItem[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const crowded = items.length > BAR_SLOTS;
  const shown = crowded ? items.slice(0, BAR_SLOTS - 1) : items;
  const rest = crowded ? items.slice(BAR_SLOTS - 1) : [];
  const inRest = rest.some(({ area }) => pathname.startsWith(AREAS[area].to));
  const columns = shown.length + (crowded ? 1 : 0);

  return (
    <nav
      aria-label={t('shell.menu')}
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {shown.map((item) => {
          const { to, icon: Icon } = AREAS[item.area];
          return (
            <li key={item.area}>
              <Link to={to} className={slot}>
                <Icon aria-hidden className="size-5" />
                <span className="max-w-full truncate">
                  {t(`nav.${item.label}`)}
                </span>
              </Link>
            </li>
          );
        })}
        {crowded && (
          <li>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                className={cn(slot, 'w-full')}
                data-status={inRest ? 'active' : undefined}
              >
                <Ellipsis aria-hidden className="size-5" />
                {t('shell.more')}
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="pb-[env(safe-area-inset-bottom)]"
              >
                <SheetHeader>
                  <SheetTitle>{t('shell.moreTitle')}</SheetTitle>
                </SheetHeader>
                <ul className="grid gap-1 px-3 pb-4">
                  {rest.map((item) => (
                    <li key={item.area}>
                      <NavEntry item={item} onClick={() => setOpen(false)} />
                    </li>
                  ))}
                </ul>
              </SheetContent>
            </Sheet>
          </li>
        )}
      </ul>
    </nav>
  );
}
