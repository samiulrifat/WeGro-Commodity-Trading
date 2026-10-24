import { useTranslation } from 'react-i18next';
import type { ClaimDto } from '@/api/generated/insurance';
import { StatusPill } from '@/components/status-pill';
import type { CoverState, Severity } from './insurance-utils';

const CLAIM_TONE = {
  submitted: 'neutral',
  triggered: 'warning',
  under_review: 'warning',
  approved: 'warning',
  paid: 'success',
  rejected: 'danger',
} as const;

/** Where a claim stands; an approved one waits for the insurer's payment. */
export function ClaimStatusPill({
  claim,
}: {
  claim: Pick<ClaimDto, 'status'>;
}) {
  const { t } = useTranslation();
  return (
    <StatusPill tone={CLAIM_TONE[claim.status]} appearance="soft">
      {t(`insurance.claimStatus.${claim.status}`)}
    </StatusPill>
  );
}

const SEVERITY_TONE = {
  low: 'neutral',
  moderate: 'warning',
  severe: 'danger',
} as const;

export function SeverityPill({ severity }: { severity: Severity }) {
  const { t } = useTranslation();
  return (
    <StatusPill tone={SEVERITY_TONE[severity]} appearance="soft">
      {t(`insurance.severity.${severity}`)}
    </StatusPill>
  );
}

const COVER_TONE = {
  unassigned: 'warning',
  no_cover: 'warning',
  covered: 'success',
} as const;

export function CoverPill({ state }: { state: CoverState }) {
  const { t } = useTranslation();
  return (
    <StatusPill tone={COVER_TONE[state]} appearance="soft">
      {t(`insurance.coverState.${state}`)}
    </StatusPill>
  );
}
