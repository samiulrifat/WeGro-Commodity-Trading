import { id } from 'ethers';

/** Mirrors WarehouseReceipt.Status; `submitted` = sent, not yet on the ledger. */
export enum ReceiptStatus {
  Submitted = 'submitted',
  Issued = 'issued',
  PendingHandover = 'pending_handover',
  Listed = 'listed',
  Sold = 'sold',
  Collected = 'collected',
  SoldOut = 'sold_out',
}

export enum StorageType {
  Warehouse = 'warehouse',
  ColdStorage = 'cold_storage',
}

/** WarehouseReceipt.WEGRO: the owner id WeGro holds receipts under after a buy-back. */
export const WEGRO_OWNER = id('WEGRO');

/** Receipts are bytes32 on the ledger: 0x + 64 hex. */
export const RECEIPT_ID = /^0x[0-9a-f]{64}$/;
