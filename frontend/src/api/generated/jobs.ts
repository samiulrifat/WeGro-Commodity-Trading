import { baseApi as api } from '../base-api';
export const addTagTypes = ['Jobs'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      jobsStatus: build.query<JobsStatusApiResponse, JobsStatusApiArg>({
        query: () => ({ url: `/api/jobs` }),
        providesTags: ['Jobs'],
      }),
      jobsHistory: build.query<JobsHistoryApiResponse, JobsHistoryApiArg>({
        query: (queryArg) => ({
          url: `/api/jobs/${queryArg.name}/runs`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
          },
        }),
        providesTags: ['Jobs'],
      }),
      jobsRunNow: build.mutation<JobsRunNowApiResponse, JobsRunNowApiArg>({
        query: (queryArg) => ({
          url: `/api/jobs/${queryArg.name}/run`,
          method: 'POST',
        }),
        invalidatesTags: ['Jobs'],
      }),
      systemStatus: build.query<SystemStatusApiResponse, SystemStatusApiArg>({
        query: () => ({ url: `/api/system/status` }),
        providesTags: ['Jobs'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as jobsApi };
export type JobsStatusApiResponse = /** status 200  */ {
  data: JobStatusDto[];
};
export type JobsStatusApiArg = void;
export type JobsHistoryApiResponse =
  /** status 200 Runs that did something, failed, or were started by hand; newest first */ {
    data: JobRunDto[];
    meta: PageMetaDto;
  };
export type JobsHistoryApiArg = {
  name: string;
  page?: number;
  limit?: number;
};
export type JobsRunNowApiResponse =
  /** status 200 Runs it now and waits for the result */ {
    data: JobRunDto;
  };
export type JobsRunNowApiArg = {
  name: string;
};
export type SystemStatusApiResponse = /** status 200  */ {
  data: SystemStatusDto;
};
export type SystemStatusApiArg = void;
export type PersonNameDto = {
  id: string;
  name: string;
};
export type JobRunDto = {
  trigger: 'schedule' | 'manual';
  /** Who ran it by hand */
  triggeredBy?: PersonNameDto | null;
  startedAt: string;
  finishedAt: string;
  outcome: 'ok' | 'failed';
  /** Items handled */
  items: number;
  error?: string | null;
};
export type JobStatusDto = {
  name: string;
  description: string;
  everyMs: number;
  /** Scheduled runs on (JOBS_ENABLED) */
  enabled: boolean;
  running: boolean;
  /** Since the server started */
  lastRun?: JobRunDto | null;
  nextRunAt?: string | null;
};
export type PageMetaDto = {
  page: number;
  limit: number;
  /** Matching items on all pages */
  total: number;
  totalPages: number;
};
export type SystemChainDto = {
  status: 'up' | 'down';
  chainId: number;
  blockNumber?: number | null;
  /** The ledger's own time (its latest block) */
  ledgerTime?: string | null;
};
export type SystemIndexerDto = {
  /** Copying ledger events is switched on */
  enabled: boolean;
  /** The copying loop is running */
  running: boolean;
  /** Last block whose events are in the database */
  indexedBlock?: number | null;
  /** Blocks behind the ledger beyond those still awaiting confirmation (as the watchdog counts) */
  behind?: number | null;
  /** How far behind it may fall (WATCHDOG_LAG_BLOCKS) */
  allowedBehind: number;
  /** Blocks on top before one is copied */
  confirmations: number;
  /** Copying passes failed in a row */
  failures: number;
  lastError?: string | null;
};
export type SystemIncidentDto = {
  problem: 'node-unreachable' | 'indexer-behind' | 'indexer-failing';
  since: string;
};
export type SystemStatusDto = {
  /** ok: all well; degraded: the node, the copy of the ledger or an incident needs attention; down: no database */
  status: 'ok' | 'degraded' | 'down';
  checkedAt: string;
  database: 'up' | 'down';
  chain: SystemChainDto;
  indexer: SystemIndexerDto;
  /** What the watchdog last found wrong, until it is resolved */
  incident?: SystemIncidentDto | null;
  uptimeSeconds: number;
};
export const {
  useJobsStatusQuery,
  useLazyJobsStatusQuery,
  useJobsHistoryQuery,
  useLazyJobsHistoryQuery,
  useJobsRunNowMutation,
  useSystemStatusQuery,
  useLazySystemStatusQuery,
} = injectedRtkApi;
