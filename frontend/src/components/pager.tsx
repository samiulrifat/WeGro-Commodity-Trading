import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** Previous and next through a list's pages, with where you are. */
export function Pager({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  if (pages <= 1) return null;
  return (
    <nav
      aria-label={t('pager.label')}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-muted-foreground">
        {t('pager.pageOf', { page, pages, count: total })}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          {t('pager.previous')}
        </Button>
        <Button
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          {t('pager.next')}
        </Button>
      </div>
    </nav>
  );
}
