import { useTranslation } from 'react-i18next';
import type { ConsentDto } from '@/api/generated/track-record';
import { StatusPill } from '@/components/status-pill';

/** Whether the bank may look now, or why not. */
export function ConsentStatusPill({
  consent: c,
}: {
  consent: Pick<ConsentDto, 'status' | 'current'>;
}) {
  const { t } = useTranslation();
  const state = c.current
    ? 'current'
    : c.status === 'active'
      ? 'expired'
      : c.status;
  const tone =
    state === 'current'
      ? 'success'
      : state === 'revoked'
        ? 'danger'
        : 'neutral';
  return (
    <StatusPill tone={tone} appearance="soft">
      {t(`trackRecords.consentState.${state}`)}
    </StatusPill>
  );
}
