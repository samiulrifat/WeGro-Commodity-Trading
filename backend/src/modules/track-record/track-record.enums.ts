export enum ConsentStatus {
  /** Sent, not yet on the ledger. */
  SUBMITTED = 'submitted',
  /** The bank's current permission (it may still have expired: see expiresAt). */
  ACTIVE = 'active',
  /** Renewed: a later grant for the same bank took its place. */
  REPLACED = 'replaced',
  /** Withdrawn by the farmer. */
  REVOKED = 'revoked',
}

/** ProjectLedger stages that count as finished for a track record. */
export const FINISHED_STAGES = ['paid_out', 'closed'] as const;

/** ConsentRegistry.MAX_PROJECTS_PER_RECORD. */
export const MAX_PROJECTS_PER_RECORD = 50;

/** ConsentRegistry.MAX_CONSENT_DURATION, in seconds. */
export const MAX_CONSENT_SECONDS = 365 * 86_400;
