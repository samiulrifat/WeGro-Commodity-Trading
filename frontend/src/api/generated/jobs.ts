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
export const {
  useJobsStatusQuery,
  useLazyJobsStatusQuery,
  useJobsHistoryQuery,
  useLazyJobsHistoryQuery,
  useJobsRunNowMutation,
} = injectedRtkApi;
