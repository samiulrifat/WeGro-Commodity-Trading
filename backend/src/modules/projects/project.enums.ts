/** Mirrors ProjectLedger.Stage; `draft` before publishing exists only in the database. */
export enum ProjectStage {
  Draft = 'draft',
  OpenForFunding = 'open_for_funding',
  Funded = 'funded',
  Active = 'active',
  ReadyForSale = 'ready_for_sale',
  PaidOut = 'paid_out',
  Closed = 'closed',
  Cancelled = 'cancelled',
}

/** ProjectLedger.Stage index -> stage (0 = None is never stored). */
export const STAGE_BY_CHAIN: Readonly<Record<number, ProjectStage>> = {
  1: ProjectStage.Draft,
  2: ProjectStage.OpenForFunding,
  3: ProjectStage.Funded,
  4: ProjectStage.Active,
  5: ProjectStage.ReadyForSale,
  6: ProjectStage.PaidOut,
  7: ProjectStage.Closed,
  8: ProjectStage.Cancelled,
};

export enum DurationType {
  ShortTerm = 'short_term',
  LongTerm = 'long_term',
}

export const CHAIN_DURATION_TYPE: Readonly<Record<DurationType, number>> = {
  [DurationType.ShortTerm]: 0,
  [DurationType.LongTerm]: 1,
};

/** Where the project's terms stand relative to the ledger. */
export enum ProjectChainState {
  /** Draft in the database only; terms can still change. */
  Local = 'local',
  /** Publishing sent; terms are fixed. */
  Submitted = 'submitted',
  /** Created on the ledger. */
  Confirmed = 'confirmed',
}

/** Mirrors ProjectLedger.ReservationStatus. */
export enum ReservationStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Expired = 'expired',
  Cancelled = 'cancelled',
}

export const RESERVATION_STATUS_BY_CHAIN: Readonly<
  Record<number, ReservationStatus>
> = {
  1: ReservationStatus.Pending,
  2: ReservationStatus.Confirmed,
  3: ReservationStatus.Expired,
  4: ReservationStatus.Cancelled,
};
