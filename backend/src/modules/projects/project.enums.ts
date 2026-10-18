/** Mirrors ProjectLedger.Stage; `draft` before publishing exists only in the database. */
export enum ProjectStage {
  DRAFT = 'draft',
  OPEN_FOR_FUNDING = 'open_for_funding',
  FUNDED = 'funded',
  ACTIVE = 'active',
  READY_FOR_SALE = 'ready_for_sale',
  PAID_OUT = 'paid_out',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

/** ProjectLedger.Stage index -> stage (0 = None is never stored). */
export const STAGE_BY_CHAIN: Readonly<Record<number, ProjectStage>> = {
  1: ProjectStage.DRAFT,
  2: ProjectStage.OPEN_FOR_FUNDING,
  3: ProjectStage.FUNDED,
  4: ProjectStage.ACTIVE,
  5: ProjectStage.READY_FOR_SALE,
  6: ProjectStage.PAID_OUT,
  7: ProjectStage.CLOSED,
  8: ProjectStage.CANCELLED,
};

export enum DurationType {
  SHORT_TERM = 'short_term',
  LONG_TERM = 'long_term',
}

export const CHAIN_DURATION_TYPE: Readonly<Record<DurationType, number>> = {
  [DurationType.SHORT_TERM]: 0,
  [DurationType.LONG_TERM]: 1,
};

/** Where the project's terms stand relative to the ledger. */
export enum ProjectChainState {
  /** Draft in the database only; terms can still change. */
  LOCAL = 'local',
  /** Publishing sent; terms are fixed. */
  SUBMITTED = 'submitted',
  /** Created on the ledger. */
  CONFIRMED = 'confirmed',
}

/** Mirrors ProjectLedger.ReservationStatus. */
export enum ReservationStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export const RESERVATION_STATUS_BY_CHAIN: Readonly<
  Record<number, ReservationStatus>
> = {
  1: ReservationStatus.PENDING,
  2: ReservationStatus.CONFIRMED,
  3: ReservationStatus.EXPIRED,
  4: ReservationStatus.CANCELLED,
};
