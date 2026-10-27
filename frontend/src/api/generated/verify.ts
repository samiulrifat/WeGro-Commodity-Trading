import { baseApi as api } from '../base-api';
export const addTagTypes = ['Verify'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      verifyBatch: build.query<VerifyBatchApiResponse, VerifyBatchApiArg>({
        query: (queryArg) => ({ url: `/api/verify/batches/${queryArg.id}` }),
        providesTags: ['Verify'],
      }),
      receiptVerifyVerify: build.query<
        ReceiptVerifyVerifyApiResponse,
        ReceiptVerifyVerifyApiArg
      >({
        query: (queryArg) => ({ url: `/api/verify/receipts/${queryArg.id}` }),
        providesTags: ['Verify'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as verifyApi };
export type VerifyBatchApiResponse = /** status 200  */ {
  data: BatchVerificationDto;
};
export type VerifyBatchApiArg = {
  id: string;
};
export type ReceiptVerifyVerifyApiResponse = /** status 200  */ {
  data: ReceiptVerificationDto;
};
export type ReceiptVerifyVerifyApiArg = {
  id: string;
};
export type InputRefDto = {
  code: string;
  name: string;
  nameBn: string;
  unit: string;
  unitBn: string;
};
export type BatchVerificationDto = {
  /** Registered on the ledger, and the details here match it */
  genuine: boolean;
  product?: InputRefDto | null;
  lotNumber?: string | null;
  manufacturer?: string | null;
  producedOn?: string | null;
  expiresOn?: string | null;
  expired: boolean;
  supplierName?: string | null;
  registeredAt?: string | null;
};
export type ProduceRefDto = {
  code: string;
  name: string;
  nameBn?: string;
  unit: string;
  unitBn: string;
};
export type ReceiptSiteDto = {
  name: string;
  district: string;
};
export type ReceiptVerificationDto = {
  /** On the ledger, and its intake record here still matches */
  genuine: boolean;
  produce?: ProduceRefDto | null;
  quantity?: number | null;
  site?: ReceiptSiteDto | null;
  status?:
    | (
        | 'submitted'
        | 'issued'
        | 'pending_handover'
        | 'listed'
        | 'sold'
        | 'collected'
        | 'sold_out'
      )
    | null;
  expiresOn?: string | null;
  expired: boolean;
  issuedAt?: string | null;
  /** A part sold off a larger receipt */
  partOfLargerReceipt: boolean;
};
export const {
  useVerifyBatchQuery,
  useLazyVerifyBatchQuery,
  useReceiptVerifyVerifyQuery,
  useLazyReceiptVerifyVerifyQuery,
} = injectedRtkApi;
