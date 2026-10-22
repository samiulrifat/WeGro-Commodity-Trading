import { isAddress } from 'ethers';
import { bytes32ToCode, bytes32ToUuid } from '../../../blockchain/utils/ids';
import { poishaToTaka } from '../../../blockchain/utils/money';
import { CLAIM_STATUS_BY_CHAIN } from '../../insurance/insurance.enums';
import { STAGE_BY_CHAIN } from '../../projects/project.enums';
import { WEGRO_OWNER } from '../../warehouse/warehouse.enums';
import { ROLE_BY_CHAIN_ID, STATUS_BY_CHAIN } from '../../users/roles';

/** A plain-language line for each ledger event. */
const TITLES: Readonly<Record<string, string>> = {
  // AccessRegistry
  ParticipantRegistered: 'Participant registered',
  ParticipantSelfRegistered: 'Signed up themselves',
  ParticipantStatusChanged: 'Participant status changed',
  ParticipantDetailsUpdated: 'Participant details updated',
  FieldOfficerAssigned: 'Field officer assigned',
  ParticipantAccountChanged: 'Participant key replaced',
  RoleGranted: 'Role granted',
  RoleRevoked: 'Role revoked',
  RoleAdminChanged: 'Role administrator changed',
  // ProjectLedger
  ProjectCreated: 'Project created on the ledger',
  ProjectStageChanged: 'Project stage changed',
  SlotsReserved: 'Slots reserved',
  ReservationConfirmed: 'Reservation paid and slots issued',
  ReservationExpired: 'Reservation expired unpaid',
  ReservationCancelled: 'Reservation cancelled',
  ReservationPaused: 'Payment proof received; reservation clock stopped',
  ReservationResumed: 'Reservation clock running again',
  RefundsRequired: 'Project cancelled; refunds due',
  RefundRecorded: 'Refund paid',
  ReservationTtlUpdated: 'Reservation time limit changed',
  LinkedContractSet: 'Linked contract changed',
  // VoucherRegistry
  VoucherProposed: 'Voucher proposed',
  VoucherApproved: 'Voucher approved',
  VoucherRejected: 'Voucher rejected',
  VoucherCancelled: 'Voucher cancelled',
  BatchRegistered: 'Input batch registered',
  SaleRecorded: 'Input sale recorded by supplier',
  SaleConfirmed: 'Input sale confirmed',
  SaleCancelled: 'Input sale cancelled',
  SaleExpired: 'Input sale expired unconfirmed',
  SaleTtlUpdated: 'Sale confirmation time limit changed',
  // FieldRecordLog
  EntryAdded: 'Field record added',
  // WarehouseReceipt
  SiteRegistered: 'Warehouse site registered',
  SiteUpdated: 'Warehouse site details changed',
  SiteClosedSet: 'Warehouse site closed or reopened',
  OperatorAssigned: 'Warehouse operator assigned',
  ReceiptIssued: 'Warehouse receipt issued',
  HandoverOffered: 'Receipt handover offered',
  HandoverCancelled: 'Receipt handover cancelled',
  ReceiptTransferred: 'Receipt transferred',
  ExpiryExtended: 'Storage term extended after re-check',
  ReceiptListed: 'Receipt listing changed',
  ReceiptSplit: 'Receipt split for a buyer',
  ReceiptCollected: 'Goods collected from the warehouse',
  // TradeLedger
  ListingCreated: 'Listed for sale',
  ListingCancelled: 'Listing cancelled',
  ListingSoldOut: 'Listing sold out',
  OfferMade: 'Offer made',
  OfferWithdrawn: 'Offer withdrawn',
  OfferRejected: 'Offer rejected',
  OfferApproved: 'Offer approved: deal made',
  DealCancelled: 'Deal cancelled',
  DealExpired: 'Deal expired unpaid',
  DealTtlUpdated: 'Deal payment time limit changed',
  BuyerPaymentConfirmed: 'Buyer payment confirmed',
  DeliveryConfirmed: 'Delivery confirmed',
  DealDelivered: 'Deal delivered',
  RequestPosted: 'Buyer request posted',
  RequestCancelled: 'Buyer request cancelled',
  // InsuranceRegistry
  CoverageSet: 'Insurance cover set',
  WeatherEventRecorded: 'Weather event recorded',
  ClaimOpened: 'Insurance claim opened',
  ClaimStatusChanged: 'Insurance claim status changed',
  // SettlementLedger
  CostAdded: 'Cost entered',
  CostVoided: 'Cost voided',
  RoundPrepared: 'Payout round prepared',
  PayoutLine: 'Payout line',
  RoundApproved: 'Payout round approved',
  RoundRejected: 'Payout round sent back',
  PaymentRecorded: 'Payout paid',
  RoundPaid: 'Payout round fully paid',
  // ConsentRegistry
  BankRegistered: 'Bank registered',
  BankOfficerAssigned: 'Bank officer assigned',
  TrackRecordPublished: 'Track record published',
  ConsentGranted: 'Bank permission granted',
  ConsentRevoked: 'Bank permission withdrawn',
  SummaryViewed: 'Track record viewed by a bank',
};

/** Expiries run by the platform's own jobs: shown as done by the system. */
export const SYSTEM_EVENTS: ReadonlySet<string> = new Set([
  'ReservationExpired',
  'SaleExpired',
  'DealExpired',
]);

/** Amounts in poisha, shown as taka. */
const MONEY = new Set([
  'amount',
  'unitPrice',
  'askingUnitPrice',
  'maxUnitPrice',
  'slotPrice',
  'maxAmount',
  'approvedAmount',
  'income',
  'costs',
  'profit',
  'capitalReturn',
  'totalRefund',
  'voidedAmount',
]);
/** Ledger seconds, shown as ISO times. */
const TIMES = new Set([
  'expiresAt',
  'producedAt',
  'observedAt',
  'paymentDueAt',
  'newExpiresAt',
  'validUntil',
]);
/** Short readable codes kept as bytes32. */
const CODES = new Set([
  'produceCode',
  'productCode',
  'entryType',
  'inputType',
  'regionCode',
  'eventType',
  'category',
]);
/** Participant ids: their names are looked up. */
export const PARTY_KEYS: ReadonlySet<string> = new Set([
  'participantId',
  'farmerId',
  'officerId',
  'investorId',
  'buyerId',
  'supplierId',
  'supplierIds',
  'insurerId',
  'operatorId',
  'payeeId',
  'viewerId',
  'owner',
  'seller',
  'from',
  'to',
  'preparedBy',
  'approvedBy',
  'grantedBy',
  'revokedBy',
  'publishedBy',
  'confirmedBy',
  'openedBy',
  'recordedBy',
  'issuedBy',
  'extendedBy',
  'collectedBy',
]);

const ZERO = `0x${'0'.repeat(64)}`;
const BYTES32 = /^0x[0-9a-f]{64}$/i;
const UUID_SHAPED = /^0x0{32}[0-9a-f]{32}$/i;

export const hasTitle = (eventName: string) => eventName in TITLES;

export const titleOf = (eventName: string) =>
  TITLES[eventName] ?? eventName.replace(/([a-z])([A-Z])/g, '$1 $2');

/**
 * An event's arguments made readable: money in taka, times as ISO, codes as
 * text, statuses and stages by name, uuid-shaped ids as uuids. Hashes and
 * everything else stay as on the ledger.
 */
export function readableArgs(
  contract: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key,
      readable(contract, key, value),
    ]),
  );
}

function readable(contract: string, key: string, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => readable(contract, key, v));
  if (typeof value !== 'string') return value;
  if (MONEY.has(key) && /^\d+$/.test(value)) return poishaToTaka(BigInt(value));
  if (TIMES.has(key) && /^\d+$/.test(value)) {
    return value === '0' ? null : new Date(Number(value) * 1000).toISOString();
  }
  if (key === 'newStage' || key === 'previousStage') {
    return STAGE_BY_CHAIN[Number(value)] ?? 'none';
  }
  if (
    contract === 'AccessRegistry' &&
    (key === 'newStatus' || key === 'previousStatus')
  ) {
    return STATUS_BY_CHAIN[Number(value)] ?? 'none';
  }
  if (contract === 'InsuranceRegistry' && key === 'status') {
    return CLAIM_STATUS_BY_CHAIN[Number(value)] ?? 'none';
  }
  if (key === 'role') return ROLE_BY_CHAIN_ID.get(value) ?? value;
  if (!BYTES32.test(value)) return value;
  if (value === ZERO) return null;
  if (value === WEGRO_OWNER) return 'WEGRO';
  if (CODES.has(key)) return safe(() => bytes32ToCode(value)) ?? value;
  if (UUID_SHAPED.test(value)) return safe(() => bytes32ToUuid(value)) ?? value;
  // "WEGRO" and similar named owners are codes; anything else is a hash.
  return (
    safe(() => {
      const code = bytes32ToCode(value);
      return /^[A-Z0-9_-]+$/.test(code) ? code : null;
    }) ?? value
  );
}

/** Addresses in the arguments (actors), for resolving to participants. */
export function addressesIn(args: Record<string, unknown>): string[] {
  return Object.values(args).filter(
    (v): v is string => typeof v === 'string' && isAddress(v),
  );
}

function safe<T>(f: () => T): T | null {
  try {
    return f();
  } catch {
    return null;
  }
}
