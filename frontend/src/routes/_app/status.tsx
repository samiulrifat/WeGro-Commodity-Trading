import { createFileRoute } from '@tanstack/react-router';
import { Hourglass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/states';
import { useAppSelector } from '@/store/hooks';

/** Where someone registered but not yet verified lands. */
export const Route = createFileRoute('/_app/status')({
  staticData: { area: 'status' },
  component: StatusPage,
});

function StatusPage() {
  const { t } = useTranslation();
  const role = useAppSelector((s) => s.session.user?.role);
  return (
    <EmptyState
      icon={Hourglass}
      title={t('statusPage.pendingTitle')}
      description={
        <>
          {t('statusPage.pendingHint')}
          {role && (
            <span className="mt-2 block">
              {t('statusPage.role')}: <strong>{t(`roles.${role}`)}</strong>
            </span>
          )}
        </>
      }
    />
  );
}
