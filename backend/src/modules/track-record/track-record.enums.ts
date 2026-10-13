export enum ConsentStatus {
  /** Sent, not yet on the ledger. */
  Submitted = 'submitted',
  /** The bank's current permission (it may still have expired: see expiresAt). */
  Active = 'active',
  /** Renewed: a later grant for the same bank took its place. */
  Replaced = 'replaced',
  /** Withdrawn by the farmer. */
  Revoked = 'revoked',
}

/** ProjectLedger stages that count as finished for a track record. */
export const FINISHED_STAGES = ['paid_out', 'closed'] as const;

/** ConsentRegistry.MAX_PROJECTS_PER_RECORD. */
export const MAX_PROJECTS_PER_RECORD = 50;

/** ConsentRegistry.MAX_CONSENT_DURATION, in seconds. */
export const MAX_CONSENT_SECONDS = 365 * 86_400;
