import { Link } from '@tanstack/react-router';
import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { mayOpen } from '@/app/navigation';
import { buttonVariants } from '@/components/ui/button';
import { useAppSelector } from '@/store/hooks';
import type { HistoryType } from './audit-utils';

/**
 * "History" on a record's own page: its full ledger history, for those who
 * may read it (office staff and auditors). Nothing for anyone else.
 */
export function HistoryButton({ type, id }: { type: HistoryType; id: string }) {
  const { t } = useTranslation();
  const user = useAppSelector((s) => s.session.user!);
  if (!mayOpen(user, `/audit/history/${type}/${id}`)) return null;
  return (
    <Link
      to="/audit/history/$type/$id"
      params={{ type, id }}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      <History />
      {t('audit.history')}
    </Link>
  );
}
