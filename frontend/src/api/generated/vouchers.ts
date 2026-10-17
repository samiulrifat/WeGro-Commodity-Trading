import { baseApi as api } from '../base-api';
export const addTagTypes = ['Vouchers'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      vouchersPropose: build.mutation<
        VouchersProposeApiResponse,
        VouchersProposeApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects/${queryArg.projectId}/vouchers`,
          method: 'POST',
          body: queryArg.proposeVoucherDto,
        }),
        invalidatesTags: ['Vouchers'],
      }),
      vouchersSummary: build.query<
        VouchersSummaryApiResponse,
        VouchersSummaryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects/${queryArg.projectId}/voucher-summary`,
        }),
        providesTags: ['Vouchers'],
      }),
      vouchersList: build.query<VouchersListApiResponse, VouchersListApiArg>({
        query: (queryArg) => ({
          url: `/api/vouchers`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            projectId: queryArg.projectId,
            status: queryArg.status,
            inactive: queryArg.inactive,
            inputTypeCode: queryArg.inputTypeCode,
          },
        }),
        providesTags: ['Vouchers'],
      }),
      vouchersFindOne: build.query<
        VouchersFindOneApiResponse,
        VouchersFindOneApiArg
      >({
        query: (queryArg) => ({ url: `/api/vouchers/${queryArg.id}` }),
        providesTags: ['Vouchers'],
      }),
      vouchersDiscard: build.mutation<
        VouchersDiscardApiResponse,
        VouchersDiscardApiArg
      >({
        query: (queryArg) => ({
          url: `/api/vouchers/${queryArg.id}`,
          method: 'DELETE',
        }),
        invalidatesTags: ['Vouchers'],
      }),
      vouchersApprove: build.mutation<
        VouchersApproveApiResponse,
        VouchersApproveApiArg
      >({
        query: (queryArg) => ({
          url: `/api/vouchers/${queryArg.id}/approve`,
          method: 'POST',
        }),
        invalidatesTags: ['Vouchers'],
      }),
      vouchersReject: build.mutation<
        VouchersRejectApiResponse,
        VouchersRejectApiArg
      >({
        query: (queryArg) => ({
          url: `/api/vouchers/${queryArg.id}/reject`,
          method: 'POST',
        }),
        invalidatesTags: ['Vouchers'],
      }),
      vouchersCancel: build.mutation<
        VouchersCancelApiResponse,
        VouchersCancelApiArg
      >({
        query: (queryArg) => ({
          url: `/api/vouchers/${queryArg.id}/cancel`,
          method: 'POST',
        }),
        invalidatesTags: ['Vouchers'],
      }),
      vouchersSetInactivityLimit: build.mutation<
        VouchersSetInactivityLimitApiResponse,
        VouchersSetInactivityLimitApiArg
      >({
        query: (queryArg) => ({
          url: `/api/vouchers/${queryArg.id}/inactivity-limit`,
          method: 'PUT',
          body: queryArg.inactivityLimitDto,
        }),
        invalidatesTags: ['Vouchers'],
      }),
      vouchersRecordSale: build.mutation<
        VouchersRecordSaleApiResponse,
        VouchersRecordSaleApiArg
      >({
        query: (queryArg) => ({
          url: `/api/vouchers/${queryArg.id}/sales`,
          method: 'POST',
          body: queryArg.recordSaleDto,
        }),
        invalidatesTags: ['Vouchers'],
      }),
      vouchersListSales: build.query<
        VouchersListSalesApiResponse,
        VouchersListSalesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/voucher-sales`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            status: queryArg.status,
            voucherId: queryArg.voucherId,
          },
        }),
        providesTags: ['Vouchers'],
      }),
      vouchersConfirmSale: build.mutation<
        VouchersConfirmSaleApiResponse,
        VouchersConfirmSaleApiArg
      >({
        query: (queryArg) => ({
          url: `/api/voucher-sales/${queryArg.id}/confirm`,
          method: 'POST',
        }),
        invalidatesTags: ['Vouchers'],
      }),
      vouchersCancelSale: build.mutation<
        VouchersCancelSaleApiResponse,
        VouchersCancelSaleApiArg
      >({
        query: (queryArg) => ({
          url: `/api/voucher-sales/${queryArg.id}/cancel`,
          method: 'POST',
        }),
        invalidatesTags: ['Vouchers'],
      }),
      batchesRegister: build.mutation<
        BatchesRegisterApiResponse,
        BatchesRegisterApiArg
      >({
        query: (queryArg) => ({
          url: `/api/batches`,
          method: 'POST',
          body: queryArg.registerBatchDto,
        }),
        invalidatesTags: ['Vouchers'],
      }),
      batchesList: build.query<BatchesListApiResponse, BatchesListApiArg>({
        query: (queryArg) => ({
          url: `/api/batches`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            inputTypeCode: queryArg.inputTypeCode,
          },
        }),
        providesTags: ['Vouchers'],
      }),
      batchesFindOne: build.query<
        BatchesFindOneApiResponse,
        BatchesFindOneApiArg
      >({
        query: (queryArg) => ({ url: `/api/batches/${queryArg.id}` }),
        providesTags: ['Vouchers'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as vouchersApi };
export type VouchersProposeApiResponse =
  /** status 201 Proposed; usable once Accounts approves */ {
    data: VoucherDetailDto;
  };
export type VouchersProposeApiArg = {
  projectId: string;
  proposeVoucherDto: ProposeVoucherDto;
};
export type VouchersSummaryApiResponse =
  /** status 200 From the ledger: what the project's vouchers commit and spend */ {
    data: VoucherSummaryDto;
  };
export type VouchersSummaryApiArg = {
  projectId: string;
};
export type VouchersListApiResponse = /** status 200  */ {
  data: VoucherDto[];
  meta: PageMetaDto;
};
export type VouchersListApiArg = {
  page?: number;
  limit?: number;
  projectId?: string;
  status?: 'submitted' | 'proposed' | 'active' | 'rejected' | 'cancelled';
  /** Only vouchers past their inactivity limit */
  inactive?: boolean;
  inputTypeCode?: string;
};
export type VouchersFindOneApiResponse = /** status 200  */ {
  data: VoucherDetailDto;
};
export type VouchersFindOneApiArg = {
  id: string;
};
export type VouchersDiscardApiResponse = unknown;
export type VouchersDiscardApiArg = {
  id: string;
};
export type VouchersApproveApiResponse =
  /** status 200 Usable; a funded project becomes active */ {
    data: VoucherDetailDto;
  };
export type VouchersApproveApiArg = {
  id: string;
};
export type VouchersRejectApiResponse = /** status 200  */ {
  data: VoucherDetailDto;
};
export type VouchersRejectApiArg = {
  id: string;
};
export type VouchersCancelApiResponse =
  /** status 200 Voids the unused balance */ {
    data: VoucherDetailDto;
  };
export type VouchersCancelApiArg = {
  id: string;
};
export type VouchersSetInactivityLimitApiResponse = /** status 200  */ {
  data: VoucherDetailDto;
};
export type VouchersSetInactivityLimitApiArg = {
  id: string;
  inactivityLimitDto: InactivityLimitDto;
};
export type VouchersRecordSaleApiResponse =
  /** status 201 Held until the farmer's field officer confirms */ {
    data: VoucherSaleDto;
  };
export type VouchersRecordSaleApiArg = {
  id: string;
  recordSaleDto: RecordSaleDto;
};
export type VouchersListSalesApiResponse = /** status 200  */ {
  data: VoucherSaleDto[];
  meta: PageMetaDto;
};
export type VouchersListSalesApiArg = {
  page?: number;
  limit?: number;
  status?: 'pending' | 'confirmed' | 'cancelled' | 'expired';
  voucherId?: string;
};
export type VouchersConfirmSaleApiResponse = /** status 200  */ {
  data: VoucherSaleDto;
};
export type VouchersConfirmSaleApiArg = {
  id: number;
};
export type VouchersCancelSaleApiResponse = /** status 200  */ {
  data: VoucherSaleDto;
};
export type VouchersCancelSaleApiArg = {
  id: number;
};
export type BatchesRegisterApiResponse = /** status 201  */ {
  data: BatchDto;
};
export type BatchesRegisterApiArg = {
  registerBatchDto: RegisterBatchDto;
};
export type BatchesListApiResponse = /** status 200  */ {
  data: BatchDto[];
  meta: PageMetaDto;
};
export type BatchesListApiArg = {
  page?: number;
  limit?: number;
  inputTypeCode?: string;
};
export type BatchesFindOneApiResponse = /** status 200  */ {
  data: BatchDto;
};
export type BatchesFindOneApiArg = {
  id: string;
};
export type RefDto = {
  id: string;
  name: string;
};
export type InputRefDto = {
  code: string;
  name: string;
  nameBn: string;
  unit: string;
};
export type BatchRefDto = {
  id: string;
  lotNumber: string;
};
export type VoucherSaleDto = {
  id: number;
  voucherId: string;
  supplier: RefDto;
  quantity: number;
  amount: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
  recordedAt: string;
  /** Must be confirmed by the farmer's field officer before this */
  expiresAt: string;
  closedAt?: string | null;
  batches: BatchRefDto[];
};
export type VoucherDetailDto = {
  id: string;
  project: RefDto;
  farmer: RefDto;
  input: InputRefDto;
  quantity: number;
  unitPrice: string;
  value: string;
  spentQuantity: number;
  heldQuantity: number;
  /** Usable now: zero unless the voucher is active */
  availableQuantity: number;
  availableBalance: string;
  status: 'submitted' | 'proposed' | 'active' | 'rejected' | 'cancelled';
  suppliers: RefDto[];
  proposedAt?: string | null;
  lastActivityAt?: string | null;
  inactivityLimitDays?: number | null;
  /** When the inactivity limit was passed, if it was */
  inactiveSince?: string | null;
  voidedAmount?: string | null;
  sales: VoucherSaleDto[];
};
export type ProposeVoucherDto = {
  inputTypeCode: string;
  /** Whole units of the input (its catalog unit) */
  quantity: number;
  /** Taka per unit at today's market price */
  unitPrice: string;
  /** 1 to 20 verified suppliers */
  supplierIds: string[];
};
export type VoucherSummaryDto = {
  fundingTarget: string;
  /** Value of proposed and active vouchers, as the ledger counts it */
  committed: string;
  /** Still free for new vouchers */
  room: string;
  /** Confirmed input spending: the project's input cost */
  spent: string;
  /** In sales awaiting confirmation */
  pendingSales: string;
};
export type VoucherDto = {
  id: string;
  project: RefDto;
  farmer: RefDto;
  input: InputRefDto;
  quantity: number;
  unitPrice: string;
  value: string;
  spentQuantity: number;
  heldQuantity: number;
  /** Usable now: zero unless the voucher is active */
  availableQuantity: number;
  availableBalance: string;
  status: 'submitted' | 'proposed' | 'active' | 'rejected' | 'cancelled';
  suppliers: RefDto[];
  proposedAt?: string | null;
  lastActivityAt?: string | null;
  inactivityLimitDays?: number | null;
  /** When the inactivity limit was passed, if it was */
  inactiveSince?: string | null;
  voidedAmount?: string | null;
};
export type PageMetaDto = {
  page: number;
  limit: number;
  /** Matching items on all pages */
  total: number;
  totalPages: number;
};
export type InactivityLimitDto = {
  /** Days without activity before the voucher is flagged; null removes the limit */
  days?: number | null;
};
export type RecordSaleDto = {
  quantity: number;
  /** Your registered batches of this input the goods came from (up to 20) */
  batchIds?: string[];
};
export type BatchDto = {
  /** What the QR code encodes */
  id: string;
  supplier: RefDto;
  input: InputRefDto;
  lotNumber: string;
  quantity?: number | null;
  manufacturer?: string | null;
  producedOn: string;
  expiresOn?: string | null;
  notes?: string | null;
  status: 'submitted' | 'registered';
  registeredAt?: string | null;
  /** Link the QR code opens */
  verifyUrl: string;
};
export type RegisterBatchDto = {
  inputTypeCode: string;
  /** Lot number as printed on the goods */
  lotNumber: string;
  /** Batch size in the input unit */
  quantity?: number;
  manufacturer?: string;
  /** Calendar day in Bangladesh */
  producedOn: string;
  /** Usable through this day */
  expiresOn?: string;
  notes?: string;
};
export const {
  useVouchersProposeMutation,
  useVouchersSummaryQuery,
  useLazyVouchersSummaryQuery,
  useVouchersListQuery,
  useLazyVouchersListQuery,
  useVouchersFindOneQuery,
  useLazyVouchersFindOneQuery,
  useVouchersDiscardMutation,
  useVouchersApproveMutation,
  useVouchersRejectMutation,
  useVouchersCancelMutation,
  useVouchersSetInactivityLimitMutation,
  useVouchersRecordSaleMutation,
  useVouchersListSalesQuery,
  useLazyVouchersListSalesQuery,
  useVouchersConfirmSaleMutation,
  useVouchersCancelSaleMutation,
  useBatchesRegisterMutation,
  useBatchesListQuery,
  useLazyBatchesListQuery,
  useBatchesFindOneQuery,
  useLazyBatchesFindOneQuery,
} = injectedRtkApi;
