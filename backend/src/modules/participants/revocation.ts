/** Why a verified person's access was revoked; kept off-chain with a note. */
export enum RevocationReason {
  /** Staff who left of their own accord. */
  RESIGNED = 'resigned',
  /** Staff let go. */
  DISMISSED = 'dismissed',
  /** A contract or engagement came to its end (staff or business). */
  CONTRACT_ENDED = 'contract_ended',
  /** A participant who no longer works with WeGro. */
  LEFT_PLATFORM = 'left_platform',
  /** Broke the platform's terms. */
  TERMS_BREACH = 'terms_breach',
  /** Anything else: the note says what. */
  OTHER = 'other',
}

/**
 * Things a person still has open, shown before their access is revoked so
 * nothing is left stuck. Only farmers assigned to a field officer block it:
 * they move to another officer in the same step.
 */
export enum OpenWorkKind {
  /** Farmers this field officer looks after (they must be moved). */
  FARMERS_ASSIGNED = 'farmers_assigned',
  /** Insurance claims they opened, not decided yet. */
  CLAIMS_OPEN = 'claims_open',
  /** Vouchers they proposed, waiting for approval. */
  VOUCHERS_PROPOSED = 'vouchers_proposed',
  /** Payout rounds they prepared, waiting for approval. */
  ROUNDS_PREPARED = 'rounds_prepared',
  /** Bank details they entered for payees, waiting for verification. */
  BANK_DETAILS_ENTERED = 'bank_details_entered',
  /** Projects they drafted, not published. */
  DRAFT_PROJECTS = 'draft_projects',
  /** Their own projects (a farmer's) still running. */
  PROJECTS_RUNNING = 'projects_running',
  /** Their slots (an investor's) in projects still running. */
  HOLDINGS_RUNNING = 'holdings_running',
  /** Offers or deals (a buyer's) not finished. */
  OFFERS_OPEN = 'offers_open',
  /** Active vouchers they (a supplier) are to fill. */
  VOUCHERS_TO_FILL = 'vouchers_to_fill',
  /** The bank they (a bank officer) work for. */
  BANK_ASSIGNED = 'bank_assigned',
  /** The warehouse site they (an operator) run. */
  SITE_ASSIGNED = 'site_assigned',
}
