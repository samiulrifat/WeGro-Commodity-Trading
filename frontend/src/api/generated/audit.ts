import { baseApi as api } from '../base-api';
export const addTagTypes = ['Audit'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      auditRecordHistory: build.query<
        AuditRecordHistoryApiResponse,
        AuditRecordHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/audit/history/${queryArg['type']}/${queryArg.id}`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            order: queryArg.order,
          },
        }),
        providesTags: ['Audit'],
      }),
      auditVerify: build.query<AuditVerifyApiResponse, AuditVerifyApiArg>({
        query: (queryArg) => ({
          url: `/api/audit/verify/${queryArg['type']}/${queryArg.id}`,
        }),
        providesTags: ['Audit'],
      }),
      auditStartSweep: build.mutation<
        AuditStartSweepApiResponse,
        AuditStartSweepApiArg
      >({
        query: () => ({ url: `/api/audit/sweeps`, method: 'POST' }),
        invalidatesTags: ['Audit'],
      }),
      auditListSweeps: build.query<
        AuditListSweepsApiResponse,
        AuditListSweepsApiArg
      >({
        query: () => ({ url: `/api/audit/sweeps` }),
        providesTags: ['Audit'],
      }),
      auditSweep: build.query<AuditSweepApiResponse, AuditSweepApiArg>({
        query: (queryArg) => ({ url: `/api/audit/sweeps/${queryArg.id}` }),
        providesTags: ['Audit'],
      }),
      auditFindings: build.query<AuditFindingsApiResponse, AuditFindingsApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/audit/sweeps/${queryArg.id}/findings`,
            params: {
              page: queryArg.page,
              limit: queryArg.limit,
            },
          }),
          providesTags: ['Audit'],
        },
      ),
      auditAuditLog: build.query<AuditAuditLogApiResponse, AuditAuditLogApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/audit/log`,
            params: {
              page: queryArg.page,
              limit: queryArg.limit,
              actorId: queryArg.actorId,
              from: queryArg['from'],
              to: queryArg.to,
              route: queryArg.route,
              outcome: queryArg.outcome,
              statusCode: queryArg.statusCode,
            },
          }),
          providesTags: ['Audit'],
        },
      ),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as auditApi };
export type AuditRecordHistoryApiResponse =
  /** status 200 Every ledger event naming the record, with who sent it */ {
    data: HistoryEntryDto[];
    meta: PageMetaDto;
  };
export type AuditRecordHistoryApiArg = {
  type:
    | 'participant'
    | 'project'
    | 'reservation'
    | 'voucher'
    | 'voucher-sale'
    | 'batch'
    | 'field-record'
    | 'warehouse-site'
    | 'receipt'
    | 'listing'
    | 'offer'
    | 'buyer-request'
    | 'weather-event'
    | 'claim'
    | 'round'
    | 'cost'
    | 'bank'
    | 'track-record';
  id: string;
  page?: number;
  limit?: number;
  order?: 'asc' | 'desc';
};
export type AuditVerifyApiResponse =
  /** status 200 Recomputes the fingerprint from the database and compares it, with the figures and status, to the ledger */ {
    data: VerificationDto;
  };
export type AuditVerifyApiArg = {
  type:
    | 'participant'
    | 'project'
    | 'reservation'
    | 'voucher'
    | 'voucher-sale'
    | 'batch'
    | 'field-record'
    | 'warehouse-site'
    | 'receipt'
    | 'listing'
    | 'offer'
    | 'buyer-request'
    | 'coverage'
    | 'weather-event'
    | 'claim'
    | 'cost'
    | 'round'
    | 'bank'
    | 'track-record'
    | 'consent';
  id: string;
};
export type AuditStartSweepApiResponse =
  /** status 202 Checks every ledger record in the background */ {
    data: SweepDto;
  };
export type AuditStartSweepApiArg = void;
export type AuditListSweepsApiResponse =
  /** status 200 The latest 50, newest first */ {
    data: SweepDto[];
  };
export type AuditListSweepsApiArg = void;
export type AuditSweepApiResponse = /** status 200  */ {
  data: SweepDto;
};
export type AuditSweepApiArg = {
  id: string;
};
export type AuditFindingsApiResponse = /** status 200 Records that differ */ {
  data: SweepFindingDto[];
  meta: PageMetaDto;
};
export type AuditFindingsApiArg = {
  id: string;
  page?: number;
  limit?: number;
};
export type AuditAuditLogApiResponse =
  /** status 200 Write requests, newest first */ {
    data: AuditLogEntryDto[];
    meta: PageMetaDto;
  };
export type AuditAuditLogApiArg = {
  page?: number;
  limit?: number;
  actorId?: string;
  /** From this day (Bangladesh) */
  from?: string;
  /** Through this day */
  to?: string;
  /** Route pattern */
  route?: string;
  outcome?: 'ok' | 'failed' | 'aborted';
  statusCode?: number;
};
export type HistoryActorDto = {
  /** System: an automatic platform job */
  kind: 'participant' | 'system' | 'unknown';
  address?: string | null;
  id?: string;
  name?: string;
  role?: string;
};
export type HistoryEntryDto = {
  at: string;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  contract: string;
  event: string;
  title: string;
  /** Who sent the transaction */
  actor: HistoryActorDto;
  /** Event arguments, readable: taka, ISO times, codes, statuses by name, ids as uuids */
  details: {
    [key: string]: unknown;
  };
  /** Names of the people the event refers to, by id or address */
  parties: {
    [key: string]: string;
  };
};
export type PageMetaDto = {
  page: number;
  limit: number;
  /** Matching items on all pages */
  total: number;
  totalPages: number;
};
export type VerificationDto = {
  type: string;
  id: string;
  /** The ledger has this record */
  onLedger: boolean;
  /** Database and ledger agree on everything checked */
  matches: boolean;
  /** What differs */
  mismatches: string[];
  checkedAt: string;
};
export type PersonNameDto = {
  id: string;
  name: string;
};
export type SweepDto = {
  id: string;
  status: 'running' | 'done' | 'failed' | 'interrupted';
  startedAt: string;
  finishedAt?: string | null;
  startedBy: PersonNameDto;
  /** Records checked so far */
  checked: number;
  /** Records that differ from the ledger */
  mismatched: number;
  error?: string | null;
};
export type SweepFindingDto = {
  type: string;
  recordId: string;
  mismatches: string[];
};
export type ActorDto = {
  id: string;
  name: string;
  role: string;
};
export type AuditLogEntryDto = {
  id: number;
  at: string;
  /** Null when not signed in */
  actor?: ActorDto | null;
  method: string;
  route: string;
  /** Record ids from the path */
  params: {
    [key: string]: string;
  };
  statusCode: number;
  outcome: 'ok' | 'failed' | 'aborted';
  requestId?: string | null;
  durationMs: number;
};
export const {
  useAuditRecordHistoryQuery,
  useLazyAuditRecordHistoryQuery,
  useAuditVerifyQuery,
  useLazyAuditVerifyQuery,
  useAuditStartSweepMutation,
  useAuditListSweepsQuery,
  useLazyAuditListSweepsQuery,
  useAuditSweepQuery,
  useLazyAuditSweepQuery,
  useAuditFindingsQuery,
  useLazyAuditFindingsQuery,
  useAuditAuditLogQuery,
  useLazyAuditAuditLogQuery,
} = injectedRtkApi;
