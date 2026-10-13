import type { ContractName } from '../../../blockchain/contracts.registry';

/** How a record's id appears in event arguments. */
export type IdKind = 'uuid' | 'number' | 'bytes32';

interface Source {
  /** Null: any platform contract. */
  contract: ContractName | null;
  /** Argument names that hold the id; names ending in "Ids" are arrays. */
  keys: string[];
}

export interface HistoryType {
  kind: IdKind;
  sources: Source[];
}

/**
 * Every ledger record with a history, and where its id appears in events.
 * A project's history spans every contract that names it.
 */
export const HISTORY_TYPES = {
  participant: {
    kind: 'uuid',
    sources: [
      {
        contract: 'AccessRegistry',
        keys: ['participantId', 'farmerId', 'officerId'],
      },
    ],
  },
  project: {
    kind: 'uuid',
    sources: [
      { contract: null, keys: ['projectId'] },
      { contract: 'ConsentRegistry', keys: ['projectIds'] },
    ],
  },
  reservation: {
    kind: 'number',
    sources: [{ contract: 'ProjectLedger', keys: ['reservationId'] }],
  },
  voucher: {
    kind: 'uuid',
    sources: [{ contract: 'VoucherRegistry', keys: ['voucherId'] }],
  },
  'voucher-sale': {
    kind: 'number',
    sources: [{ contract: 'VoucherRegistry', keys: ['saleId'] }],
  },
  batch: {
    kind: 'uuid',
    sources: [{ contract: 'VoucherRegistry', keys: ['batchId', 'batchIds'] }],
  },
  'field-record': {
    kind: 'uuid',
    sources: [
      { contract: 'FieldRecordLog', keys: ['entryId', 'correctsEntryId'] },
    ],
  },
  'warehouse-site': {
    kind: 'uuid',
    sources: [{ contract: 'WarehouseReceipt', keys: ['siteId'] }],
  },
  receipt: {
    kind: 'bytes32',
    sources: [
      {
        contract: 'WarehouseReceipt',
        keys: ['receiptId', 'parentId', 'childId'],
      },
      { contract: 'TradeLedger', keys: ['receiptId', 'receiptPartId'] },
    ],
  },
  listing: {
    kind: 'number',
    sources: [{ contract: 'TradeLedger', keys: ['listingId'] }],
  },
  offer: {
    kind: 'number',
    sources: [{ contract: 'TradeLedger', keys: ['offerId'] }],
  },
  'buyer-request': {
    kind: 'number',
    sources: [{ contract: 'TradeLedger', keys: ['requestId'] }],
  },
  'weather-event': {
    kind: 'uuid',
    sources: [{ contract: 'InsuranceRegistry', keys: ['eventId'] }],
  },
  claim: {
    kind: 'uuid',
    sources: [{ contract: 'InsuranceRegistry', keys: ['claimId'] }],
  },
  round: {
    kind: 'number',
    sources: [{ contract: 'SettlementLedger', keys: ['roundId'] }],
  },
  cost: {
    kind: 'number',
    sources: [{ contract: 'SettlementLedger', keys: ['costId'] }],
  },
  bank: {
    kind: 'uuid',
    sources: [{ contract: 'ConsentRegistry', keys: ['bankId'] }],
  },
  /** A farmer's track records, bank permissions and the banks' views. */
  'track-record': {
    kind: 'uuid',
    sources: [{ contract: 'ConsentRegistry', keys: ['farmerId'] }],
  },
} as const satisfies Record<string, HistoryType>;

export type HistoryTypeName = keyof typeof HISTORY_TYPES;
export const HISTORY_TYPE_NAMES = Object.keys(
  HISTORY_TYPES,
) as HistoryTypeName[];
