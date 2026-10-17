import { baseApi as api } from '../base-api';
export const addTagTypes = ['Settlement'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      settlementSummary: build.query<
        SettlementSummaryApiResponse,
        SettlementSummaryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/settlement/projects/${queryArg.projectId}`,
        }),
        providesTags: ['Settlement'],
      }),
      settlementListCosts: build.query<
        SettlementListCostsApiResponse,
        SettlementListCostsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/settlement/projects/${queryArg.projectId}/costs`,
          params: {
            includeVoided: queryArg.includeVoided,
          },
        }),
        providesTags: ['Settlement'],
      }),
      settlementAddCost: build.mutation<
        SettlementAddCostApiResponse,
        SettlementAddCostApiArg
      >({
        query: (queryArg) => ({
          url: `/api/settlement/projects/${queryArg.projectId}/costs`,
          method: 'POST',
          body: queryArg.addCostDto,
        }),
        invalidatesTags: ['Settlement'],
      }),
      settlementCost: build.query<
        SettlementCostApiResponse,
        SettlementCostApiArg
      >({
        query: (queryArg) => ({ url: `/api/settlement/costs/${queryArg.id}` }),
        providesTags: ['Settlement'],
      }),
      settlementVoidCost: build.mutation<
        SettlementVoidCostApiResponse,
        SettlementVoidCostApiArg
      >({
        query: (queryArg) => ({
          url: `/api/settlement/costs/${queryArg.id}/void`,
          method: 'POST',
        }),
        invalidatesTags: ['Settlement'],
      }),
      settlementPrepare: build.mutation<
        SettlementPrepareApiResponse,
        SettlementPrepareApiArg
      >({
        query: (queryArg) => ({
          url: `/api/settlement/projects/${queryArg.projectId}/rounds`,
          method: 'POST',
          body: queryArg.prepareRoundDto,
        }),
        invalidatesTags: ['Settlement'],
      }),
      settlementListRounds: build.query<
        SettlementListRoundsApiResponse,
        SettlementListRoundsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/settlement/rounds`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            projectId: queryArg.projectId,
            status: queryArg.status,
          },
        }),
        providesTags: ['Settlement'],
      }),
      settlementRound: build.query<
        SettlementRoundApiResponse,
        SettlementRoundApiArg
      >({
        query: (queryArg) => ({ url: `/api/settlement/rounds/${queryArg.id}` }),
        providesTags: ['Settlement'],
      }),
      settlementApprove: build.mutation<
        SettlementApproveApiResponse,
        SettlementApproveApiArg
      >({
        query: (queryArg) => ({
          url: `/api/settlement/rounds/${queryArg.id}/approve`,
          method: 'POST',
        }),
        invalidatesTags: ['Settlement'],
      }),
      settlementReject: build.mutation<
        SettlementRejectApiResponse,
        SettlementRejectApiArg
      >({
        query: (queryArg) => ({
          url: `/api/settlement/rounds/${queryArg.id}/reject`,
          method: 'POST',
          body: queryArg.rejectRoundDto,
        }),
        invalidatesTags: ['Settlement'],
      }),
      settlementRecordPayment: build.mutation<
        SettlementRecordPaymentApiResponse,
        SettlementRecordPaymentApiArg
      >({
        query: (queryArg) => ({
          url: `/api/settlement/rounds/${queryArg.id}/payments`,
          method: 'POST',
          body: queryArg.recordPayoutDto,
        }),
        invalidatesTags: ['Settlement'],
      }),
      settlementMyStatement: build.query<
        SettlementMyStatementApiResponse,
        SettlementMyStatementApiArg
      >({
        query: (queryArg) => ({
          url: `/api/me/statement`,
          params: {
            from: queryArg['from'],
            to: queryArg.to,
          },
        }),
        providesTags: ['Settlement'],
      }),
      settlementStatement: build.query<
        SettlementStatementApiResponse,
        SettlementStatementApiArg
      >({
        query: (queryArg) => ({
          url: `/api/settlement/statements/${queryArg.payeeId}`,
          params: {
            from: queryArg['from'],
            to: queryArg.to,
          },
        }),
        providesTags: ['Settlement'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as settlementApi };
export type SettlementSummaryApiResponse =
  /** status 200 Totals so far, whether a round can start and what it would pay */ {
    data: SettlementSummaryDto;
  };
export type SettlementSummaryApiArg = {
  projectId: string;
};
export type SettlementListCostsApiResponse = /** status 200 Newest first */ {
  data: CostDto[];
};
export type SettlementListCostsApiArg = {
  projectId: string;
  /** Include voided costs */
  includeVoided?: boolean;
};
export type SettlementAddCostApiResponse =
  /** status 201 Until a final round is prepared */ {
    data: CostDto;
  };
export type SettlementAddCostApiArg = {
  projectId: string;
  addCostDto: AddCostDto;
};
export type SettlementCostApiResponse = /** status 200  */ {
  data: CostDto;
};
export type SettlementCostApiArg = {
  id: string;
};
export type SettlementVoidCostApiResponse =
  /** status 200 Corrections are new entries */ {
    data: CostDto;
  };
export type SettlementVoidCostApiArg = {
  id: string;
};
export type SettlementPrepareApiResponse =
  /** status 201 The ledger works out every figure; another Accounts person approves */ {
    data: RoundDto;
  };
export type SettlementPrepareApiArg = {
  projectId: string;
  prepareRoundDto: PrepareRoundDto;
};
export type SettlementListRoundsApiResponse = /** status 200 Newest first */ {
  data: RoundListItemDto[];
  meta: PageMetaDto;
};
export type SettlementListRoundsApiArg = {
  page?: number;
  limit?: number;
  projectId?: string;
  status?: 'prepared' | 'approved' | 'rejected' | 'paid';
};
export type SettlementRoundApiResponse = /** status 200  */ {
  data: RoundDto;
};
export type SettlementRoundApiArg = {
  id: number;
};
export type SettlementApproveApiResponse =
  /** status 200 Not by who prepared it */ {
    data: RoundDto;
  };
export type SettlementApproveApiArg = {
  id: number;
};
export type SettlementRejectApiResponse =
  /** status 200 Corrected, then prepared again */ {
    data: RoundDto;
  };
export type SettlementRejectApiArg = {
  id: number;
  rejectRoundDto: RejectRoundDto;
};
export type SettlementRecordPaymentApiResponse =
  /** status 200 One line paid outside the platform; all paid = round paid */ {
    data: RoundDto;
  };
export type SettlementRecordPaymentApiArg = {
  id: number;
  recordPayoutDto: RecordPayoutDto;
};
export type SettlementMyStatementApiResponse = /** status 200  */ {
  data: StatementDto;
};
export type SettlementMyStatementApiArg = {
  /** Payouts approved from this day */
  from?: string;
  /** Through this day */
  to?: string;
};
export type SettlementStatementApiResponse = /** status 200  */ {
  data: StatementDto;
};
export type SettlementStatementApiArg = {
  payeeId: string;
  /** Payouts approved from this day */
  from?: string;
  /** Through this day */
  to?: string;
};
export type SettlementPartyDto = {
  id: string;
  name: string;
};
export type IncomeDto = {
  total: string;
  /** Delivered sales */
  sales: string;
  /** Approved insurance claims */
  insurance: string;
};
export type CostsDto = {
  total: string;
  /** Confirmed voucher spending */
  inputs: string;
  /** Costs Accounts entered */
  other: string;
};
export type RoundBlock =
  | 'ROUND_OPEN'
  | 'ALREADY_SETTLED'
  | 'ROUND_WRONG_STAGE'
  | 'NOT_STAGED'
  | 'TOO_EARLY'
  | 'NOTHING_TO_DISTRIBUTE'
  | 'STILL_OUTSTANDING';
export type PreviewDto = {
  /** Profit not yet split */
  profit: string;
  farmerShare: string;
  investorShare: string;
  wegroShare: string;
  /** Final round only */
  capitalReturn: string;
  /** Rounding remainder, kept by WeGro */
  leftover: string;
  payees: number;
};
export type RoundEligibilityDto = {
  allowed: boolean;
  /** Why not, when not allowed: an error code */
  reason?: RoundBlock | null;
  /** Staged: earliest time */
  nextAllowedAt?: string | null;
  /** Final: what is still unfinished */
  outstanding: string[];
  /** If prepared now */
  preview?: PreviewDto | null;
};
export type RoundSummaryDto = {
  id: number;
  isFinal: boolean;
  status: 'prepared' | 'approved' | 'rejected' | 'paid';
  profit: string;
  capitalReturn: string;
  preparedAt: string;
  approvedAt?: string | null;
  paidAt?: string | null;
};
export type SettlementSummaryDto = {
  project: SettlementPartyDto;
  stage: string;
  /** From the ledger, so far */
  income: IncomeDto;
  /** From the ledger, so far */
  costs: CostsDto;
  /** Income less costs; below zero is a loss */
  net: string;
  /** Profit already split in approved rounds */
  distributedProfit: string;
  openRoundId?: number | null;
  /** The final round is approved */
  settled: boolean;
  staged: RoundEligibilityDto;
  final: RoundEligibilityDto;
  rounds: RoundSummaryDto[];
};
export type CostDto = {
  id: string;
  /** Ledger cost id */
  costId?: number | null;
  projectId: string;
  category:
    'transport' | 'labour' | 'irrigation' | 'storage' | 'services' | 'other';
  amount: string;
  incurredOn: string;
  note: string;
  photoUrl?: string | null;
  status: 'submitted' | 'recorded' | 'voided';
  enteredBy: SettlementPartyDto;
  recordedAt?: string | null;
  voidedBy?: SettlementPartyDto | null;
  voidedAt?: string | null;
  detailsHash: string;
};
export type AddCostDto = {
  category:
    'transport' | 'labour' | 'irrigation' | 'storage' | 'services' | 'other';
  amount: string;
  /** Day it was incurred */
  incurredOn: string;
  note: string;
  /** The bill, from POST /photos */
  photoId?: string;
};
export type PayoutLineDto = {
  payee: SettlementPartyDto;
  role?: ('farmer' | 'investor') | null;
  slots?: number | null;
  amount?: string | null;
  /** As on the ledger */
  lineHash: string;
  /** The amount produces the ledger hash */
  verified: boolean;
  paid: boolean;
  paidAt?: string | null;
  /** Accounts, admins and auditors only */
  paymentReference?: string | null;
};
export type RoundDto = {
  id: number;
  project: SettlementPartyDto;
  isFinal: boolean;
  status: 'prepared' | 'approved' | 'rejected' | 'paid';
  income: string;
  costs: string;
  profit: string;
  farmerShare: string;
  investorShare: string;
  wegroShare: string;
  capitalReturn: string;
  leftover: string;
  fingerprint: string;
  /** Figures and every line match the ledger */
  verified: boolean;
  preparedBy: SettlementPartyDto;
  preparedAt: string;
  approvedBy?: SettlementPartyDto | null;
  approvedAt?: string | null;
  rejectReason?: string | null;
  rejectedBy?: SettlementPartyDto | null;
  rejectedAt?: string | null;
  payeeCount: number;
  paidCount: number;
  paidAt?: string | null;
  lines: PayoutLineDto[];
};
export type PrepareRoundDto = {
  /** Final: a project ready for sale, everything finished; also returns capital */
  final: boolean;
};
export type RoundListItemDto = {
  id: number;
  project: SettlementPartyDto;
  isFinal: boolean;
  status: 'prepared' | 'approved' | 'rejected' | 'paid';
  income: string;
  costs: string;
  profit: string;
  farmerShare: string;
  investorShare: string;
  wegroShare: string;
  capitalReturn: string;
  leftover: string;
  fingerprint: string;
  /** Figures and every line match the ledger */
  verified: boolean;
  preparedBy: SettlementPartyDto;
  preparedAt: string;
  approvedBy?: SettlementPartyDto | null;
  approvedAt?: string | null;
  rejectReason?: string | null;
  rejectedBy?: SettlementPartyDto | null;
  rejectedAt?: string | null;
  payeeCount: number;
  paidCount: number;
  paidAt?: string | null;
};
export type PageMetaDto = {
  page: number;
  limit: number;
  /** Matching items on all pages */
  total: number;
  totalPages: number;
};
export type RejectRoundDto = {
  reason: string;
};
export type RecordPayoutDto = {
  paymentReference: string;
  payeeId: string;
};
export type StatementPayoutDto = {
  roundId: number;
  isFinal: boolean;
  approvedAt: string;
  amount: string;
  paid: boolean;
  paidAt?: string | null;
  /** Check against SettlementLedger.payoutLineHash */
  lineHash: string;
  /** The amount produces the ledger hash */
  verified: boolean;
};
export type StatementProjectDto = {
  project: SettlementPartyDto;
  stage: string;
  role: 'farmer' | 'investor';
  slots?: number | null;
  /** Investors: slots x slot price */
  invested?: string | null;
  payouts: StatementPayoutDto[];
  /** Paid to you */
  received: string;
  /** Approved, not yet paid */
  due: string;
  /** Capital paid back when a project was cancelled */
  refunded: string;
};
export type StatementTotalsDto = {
  invested: string;
  received: string;
  due: string;
  refunded: string;
};
export type StatementDto = {
  payee: SettlementPartyDto;
  from?: string | null;
  to?: string | null;
  projects: StatementProjectDto[];
  totals: StatementTotalsDto;
  note: string;
};
export const {
  useSettlementSummaryQuery,
  useLazySettlementSummaryQuery,
  useSettlementListCostsQuery,
  useLazySettlementListCostsQuery,
  useSettlementAddCostMutation,
  useSettlementCostQuery,
  useLazySettlementCostQuery,
  useSettlementVoidCostMutation,
  useSettlementPrepareMutation,
  useSettlementListRoundsQuery,
  useLazySettlementListRoundsQuery,
  useSettlementRoundQuery,
  useLazySettlementRoundQuery,
  useSettlementApproveMutation,
  useSettlementRejectMutation,
  useSettlementRecordPaymentMutation,
  useSettlementMyStatementQuery,
  useLazySettlementMyStatementQuery,
  useSettlementStatementQuery,
  useLazySettlementStatementQuery,
} = injectedRtkApi;
