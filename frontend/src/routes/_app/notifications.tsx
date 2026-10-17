import { createFileRoute } from '@tanstack/react-router';
import { Construction } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/states';

/** Open to everyone signed in; built in a later item. */
export const Route = createFileRoute('/_app/notifications')({
  component: Page,
});

function Page() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('nav.notifications')} />
      <EmptyState
        icon={Construction}
        title={t('states.comingSoon')}
        description={t('states.comingSoonHint')}
      />
    </>
  );
}
