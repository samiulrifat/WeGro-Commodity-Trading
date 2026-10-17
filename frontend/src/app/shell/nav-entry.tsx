import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { AREAS, type NavItem } from '../navigation';

/** One menu entry; marked as the current page on it and on its sub-pages. */
export function NavEntry({
  item,
  onClick,
  className,
}: {
  item: NavItem;
  onClick?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const { to, icon: Icon } = AREAS[item.area];
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[status=active]:bg-brand/10 data-[status=active]:text-brand',
        className,
      )}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      {t(`nav.${item.label}`)}
    </Link>
  );
}
