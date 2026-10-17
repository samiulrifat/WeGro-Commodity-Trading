import { baseApi as api } from '../base-api';
export const addTagTypes = ['Dashboard'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      dashboardGet: build.query<DashboardGetApiResponse, DashboardGetApiArg>({
        query: () => ({ url: `/api/dashboard` }),
        providesTags: ['Dashboard'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as dashboardApi };
export type DashboardGetApiResponse =
  /** status 200 Funding progress, active projects, stages, the queues your role acts on, figures and trends */ {
    data: DashboardDto;
  };
export type DashboardGetApiArg = void;
export type DashRefDto = {
  id: string;
  name: string;
};
export type FundingProjectDto = {
  project: DashRefDto;
  farmer: DashRefDto;
  produceCode: string;
  districtCode: string;
  target: string;
  /** Slots issued x slot price */
  raised: string;
  /** Issued slots as % of all slots */
  percentFunded: string;
  totalSlots: number;
  issuedSlots: number;
  /** Held by unpaid reservations */
  reservedSlots: number;
  /** Reservations waiting for payment confirmation */
  pendingReservations: number;
  publishedAt?: string | null;
  /** Whole days open for funding */
  daysOpen: number;
};
export type FundingDto = {
  openProjects: number;
  target: string;
  raised: string;
  /** Raised as % of target, all open projects */
  percentFunded: string;
  /** Longest open first, up to 20 */
  projects: FundingProjectDto[];
};
export type ActiveProjectDto = {
  project: DashRefDto;
  farmer: DashRefDto;
  produceCode: string;
  districtCode: string;
  startedOn?: string | null;
  plannedEndOn?: string | null;
  /** Past the planned end (Bangladesh calendar) */
  overdue: boolean;
  /** Funding raised */
  raised: string;
  /** Approved voucher value, less cancelled balances */
  inputsCommitted: string;
  /** Confirmed input sales */
  inputsSpent: string;
  lastFieldRecordAt?: string | null;
  openClaims: number;
  openListings: number;
};
export type ActiveDto = {
  count: number;
  /** Longest active first, up to 20 */
  projects: ActiveProjectDto[];
};
export type QueueItemDto = {
  /** The record id, for linking */
  id: string;
  title: string;
  detail?: string | null;
  /** Who it concerns */
  person?: DashRefDto | null;
  project?: DashRefDto | null;
  /** Waiting since (or due at, for deadlines) */
  since: string;
};
export type QueueDto = {
  key: string;
  title: string;
  /** Who acts on it */
  actionBy: string;
  count: number;
  /** Urgent subsets: overdue, expiringSoon (24 h) */
  urgent?: {
    [key: string]: number;
  };
  /** The 5 waiting longest */
  oldest: QueueItemDto[];
};
export type FiguresDto = {
  /** Confirmed investments, all time */
  fundingRaised: string;
  /** Refunded on cancelled projects */
  refunded: string;
  /** Delivered sales */
  salesIncome: string;
  /** Approved insurance claims */
  insuranceApproved: string;
  /** Confirmed input sales */
  inputsSpent: string;
  /** Payout lines paid */
  payoutsPaid: string;
  /** Verified participants by role */
  participants: {
    [key: string]: number;
  };
};
export type TrendsDto = {
  /** Bangladesh calendar months */
  months: string[];
  fundingRaised: string[];
  salesIncome: string[];
  payoutsPaid: string[];
  projectsStarted: number[];
  projectsFinished: number[];
};
export type DashboardDto = {
  /** The ledger's time the live parts were computed at */
  asOf: string;
  funding: FundingDto;
  /** Projects by stage */
  stages: {
    [key: string]: number;
  };
  active: ActiveDto;
  /** The queues your role acts on or oversees */
  queues: QueueDto[];
  figures: FiguresDto;
  /** Last 12 months, oldest first */
  trends: TrendsDto;
  /** When figures and trends were computed (cached up to 60 s) */
  figuresAsOf: string;
};
export const { useDashboardGetQuery, useLazyDashboardGetQuery } =
  injectedRtkApi;
