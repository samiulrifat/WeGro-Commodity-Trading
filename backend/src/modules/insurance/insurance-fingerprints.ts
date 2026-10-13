import { fingerprint } from '../../blockchain/utils/fingerprint';
import type { CoverageTerms } from './entities/coverage-terms.entity';
import type { WeatherEvent } from './entities/weather-event.entity';

/** The ledger's termsHash: one version of the cover, chained to the one it replaced. */
export function coverageFingerprint(
  t: Pick<
    CoverageTerms,
    | 'projectId'
    | 'insurerId'
    | 'maxAmount'
    | 'coveredEventTypes'
    | 'notes'
    | 'previousTermsHash'
  >,
): string {
  return fingerprint('insurance.terms', {
    v: 1,
    projectId: t.projectId,
    insurerId: t.insurerId,
    maxAmount: t.maxAmount,
    coveredEventTypes: t.coveredEventTypes,
    notes: t.notes,
    previousTermsHash: t.previousTermsHash,
  });
}

/** The ledger's detailsHash for a weather event. */
export function weatherEventFingerprint(
  e: Pick<
    WeatherEvent,
    | 'id'
    | 'districtCode'
    | 'eventTypeCode'
    | 'occurredOn'
    | 'severity'
    | 'notes'
  >,
): string {
  return fingerprint('insurance.event', {
    v: 1,
    eventId: e.id,
    districtCode: e.districtCode,
    eventTypeCode: e.eventTypeCode,
    occurredOn: e.occurredOn,
    severity: e.severity,
    notes: e.notes,
  });
}

/** The ledger's claimHash: the officer's evidence, photos in the order given. */
export function claimFingerprint(c: {
  claimId: string;
  projectId: string;
  eventId: string;
  damagePercent: string;
  notes: string;
  photoHashes: string[];
}): string {
  return fingerprint('insurance.claim', { v: 1, ...c });
}

/** The ledger's assessmentHash: the insurer's decision and findings. */
export function assessmentFingerprint(a: {
  claimId: string;
  decision: 'approved' | 'rejected';
  approvedAmount: bigint | null;
  damagePercent: string | null;
  notes: string;
  photoHash: string | null;
}): string {
  return fingerprint('insurance.assessment', { v: 1, ...a });
}

/** "40.5" -> "40.5", "40" -> "40.0": one decimal place, as the database stores it. */
export function normalisePercent(value: string | number): string {
  return Number(value).toFixed(1);
}
