import { useTranslation } from 'react-i18next';
import type { ProjectDto } from '@/api/generated/projects';
import { StatusPill } from '@/components/status-pill';

const TONE: Record<
  ProjectDto['stage'],
  'success' | 'neutral' | 'warning' | 'danger'
> = {
  draft: 'neutral',
  open_for_funding: 'success',
  funded: 'success',
  active: 'success',
  ready_for_sale: 'warning',
  paid_out: 'neutral',
  closed: 'neutral',
  cancelled: 'danger',
};

/** Where a project stands, in words. */
export function StagePill({ stage }: { stage: ProjectDto['stage'] }) {
  const { t } = useTranslation();
  return (
    <StatusPill tone={TONE[stage]} appearance="soft">
      {t(`projects.stage.${stage}`)}
    </StatusPill>
  );
}
