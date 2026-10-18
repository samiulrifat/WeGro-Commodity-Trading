import { id } from 'ethers';

/** Mirrors WarehouseReceipt.Status; `submitted` = sent, not yet on the ledger. */
export enum ReceiptStatus {
  SUBMITTED = 'submitted',
  ISSUED = 'issued',
  PENDING_HANDOVER = 'pending_handover',
  LISTED = 'listed',
  SOLD = 'sold',
  COLLECTED = 'collected',
  SOLD_OUT = 'sold_out',
}

export enum StorageType {
  WAREHOUSE = 'warehouse',
  COLD_STORAGE = 'cold_storage',
}

/** WarehouseReceipt.WEGRO: the owner id WeGro holds receipts under after a buy-back. */
export const WEGRO_OWNER = id('WEGRO');

/** Receipts are bytes32 on the ledger: 0x + 64 hex. */
export const RECEIPT_ID = /^0x[0-9a-f]{64}$/;
