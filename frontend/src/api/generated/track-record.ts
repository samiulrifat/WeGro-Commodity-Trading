import { baseApi as api } from '../base-api';
export const addTagTypes = ['Track record'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      trackRecordRegisterBank: build.mutation<
        TrackRecordRegisterBankApiResponse,
        TrackRecordRegisterBankApiArg
      >({
        query: (queryArg) => ({
          url: `/api/banks`,
          method: 'POST',
          body: queryArg.registerBankDto,
        }),
        invalidatesTags: ['Track record'],
      }),
      trackRecordListBanks: build.query<
        TrackRecordListBanksApiResponse,
        TrackRecordListBanksApiArg
      >({
        query: (queryArg) => ({
          url: `/api/banks`,
          params: {
            districtCode: queryArg.districtCode,
          },
        }),
        providesTags: ['Track record'],
      }),
      trackRecordBank: build.query<
        TrackRecordBankApiResponse,
        TrackRecordBankApiArg
      >({
        query: (queryArg) => ({ url: `/api/banks/${queryArg.id}` }),
        providesTags: ['Track record'],
      }),
      trackRecordAssignOfficer: build.mutation<
        TrackRecordAssignOfficerApiResponse,
        TrackRecordAssignOfficerApiArg
      >({
        query: (queryArg) => ({
          url: `/api/bank-officers/${queryArg.officerId}`,
          method: 'PUT',
          body: queryArg.assignBankOfficerDto,
        }),
        invalidatesTags: ['Track record'],
      }),
      trackRecordPreview: build.query<
        TrackRecordPreviewApiResponse,
        TrackRecordPreviewApiArg
      >({
        query: (queryArg) => ({
          url: `/api/farmers/${queryArg.farmerId}/track-record/preview`,
        }),
        providesTags: ['Track record'],
      }),
      trackRecordPublish: build.mutation<
        TrackRecordPublishApiResponse,
        TrackRecordPublishApiArg
      >({
        query: (queryArg) => ({
          url: `/api/farmers/${queryArg.farmerId}/track-records`,
          method: 'POST',
        }),
        invalidatesTags: ['Track record'],
      }),
      trackRecordVersions: build.query<
        TrackRecordVersionsApiResponse,
        TrackRecordVersionsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/farmers/${queryArg.farmerId}/track-records`,
        }),
        providesTags: ['Track record'],
      }),
      trackRecordRecord: build.query<
        TrackRecordRecordApiResponse,
        TrackRecordRecordApiArg
      >({
        query: (queryArg) => ({
          url: `/api/farmers/${queryArg.farmerId}/track-records/${queryArg.version}`,
        }),
        providesTags: ['Track record'],
      }),
      trackRecordImportedHistory: build.query<
        TrackRecordImportedHistoryApiResponse,
        TrackRecordImportedHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/farmers/${queryArg.farmerId}/history`,
        }),
        providesTags: ['Track record'],
      }),
      trackRecordConsents: build.query<
        TrackRecordConsentsApiResponse,
        TrackRecordConsentsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/farmers/${queryArg.farmerId}/consents`,
        }),
        providesTags: ['Track record'],
      }),
      trackRecordGrant: build.mutation<
        TrackRecordGrantApiResponse,
        TrackRecordGrantApiArg
      >({
        query: (queryArg) => ({
          url: `/api/farmers/${queryArg.farmerId}/consents`,
          method: 'POST',
          body: queryArg.grantConsentDto,
        }),
        invalidatesTags: ['Track record'],
      }),
      trackRecordRevoke: build.mutation<
        TrackRecordRevokeApiResponse,
        TrackRecordRevokeApiArg
      >({
        query: (queryArg) => ({
          url: `/api/farmers/${queryArg.farmerId}/consents/${queryArg.bankId}/revoke`,
          method: 'POST',
        }),
        invalidatesTags: ['Track record'],
      }),
      trackRecordViewHistory: build.query<
        TrackRecordViewHistoryApiResponse,
        TrackRecordViewHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/farmers/${queryArg.farmerId}/consents/views`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
          },
        }),
        providesTags: ['Track record'],
      }),
      trackRecordMyBank: build.query<
        TrackRecordMyBankApiResponse,
        TrackRecordMyBankApiArg
      >({
        query: () => ({ url: `/api/bank/me` }),
        providesTags: ['Track record'],
      }),
      trackRecordBankFarmers: build.query<
        TrackRecordBankFarmersApiResponse,
        TrackRecordBankFarmersApiArg
      >({
        query: (queryArg) => ({
          url: `/api/bank/farmers`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
          },
        }),
        providesTags: ['Track record'],
      }),
      trackRecordBankView: build.mutation<
        TrackRecordBankViewApiResponse,
        TrackRecordBankViewApiArg
      >({
        query: (queryArg) => ({
          url: `/api/bank/farmers/${queryArg.farmerId}/track-record/view`,
          method: 'POST',
        }),
        invalidatesTags: ['Track record'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as trackRecordApi };
export type TrackRecordRegisterBankApiResponse = /** status 201  */ {
  data: BankDto;
};
export type TrackRecordRegisterBankApiArg = {
  registerBankDto: RegisterBankDto;
};
export type TrackRecordListBanksApiResponse = /** status 200  */ {
  data: BankDto[];
};
export type TrackRecordListBanksApiArg = {
  districtCode?: District;
};
export type TrackRecordBankApiResponse = /** status 200  */ {
  data: BankDto;
};
export type TrackRecordBankApiArg = {
  id: string;
};
export type TrackRecordAssignOfficerApiResponse =
  /** status 200 The bank now, or null when removed */ {
    data: BankDto | null;
  };
export type TrackRecordAssignOfficerApiArg = {
  officerId: string;
  assignBankOfficerDto: AssignBankOfficerDto;
};
export type TrackRecordPreviewApiResponse = /** status 200  */ {
  data: TrackRecordPreviewDto;
};
export type TrackRecordPreviewApiArg = {
  farmerId: string;
};
export type TrackRecordPublishApiResponse =
  /** status 201 Built from the farmer's finished projects; its hash goes on the ledger */ {
    data: TrackRecordDto;
  };
export type TrackRecordPublishApiArg = {
  farmerId: string;
};
export type TrackRecordVersionsApiResponse = /** status 200 Newest first */ {
  data: TrackRecordVersionDto[];
};
export type TrackRecordVersionsApiArg = {
  farmerId: string;
};
export type TrackRecordRecordApiResponse = /** status 200  */ {
  data: TrackRecordDto;
};
export type TrackRecordRecordApiArg = {
  farmerId: string;
  version: number;
};
export type TrackRecordImportedHistoryApiResponse =
  /** status 200 Projects finished before the platform, imported from WeGro records; not on the ledger */ {
    data: ImportedProjectDto[];
  };
export type TrackRecordImportedHistoryApiArg = {
  farmerId: string;
};
export type TrackRecordConsentsApiResponse =
  /** status 200 Every grant, newest first */ {
    data: ConsentDto[];
  };
export type TrackRecordConsentsApiArg = {
  farmerId: string;
};
export type TrackRecordGrantApiResponse =
  /** status 201 With the signed form; at most a year; renews an earlier grant */ {
    data: ConsentDto;
  };
export type TrackRecordGrantApiArg = {
  farmerId: string;
  grantConsentDto: GrantConsentDto;
};
export type TrackRecordRevokeApiResponse =
  /** status 200 The bank's access ends at once */ {
    data: ConsentDto;
  };
export type TrackRecordRevokeApiArg = {
  farmerId: string;
  bankId: string;
};
export type TrackRecordViewHistoryApiResponse =
  /** status 200 Who looked, newest first */ {
    data: SummaryViewDto[];
    meta: PageMetaDto;
  };
export type TrackRecordViewHistoryApiArg = {
  farmerId: string;
  page?: number;
  limit?: number;
};
export type TrackRecordMyBankApiResponse = /** status 200  */ {
  data: MyBankDto;
};
export type TrackRecordMyBankApiArg = void;
export type TrackRecordBankFarmersApiResponse =
  /** status 200 Farmers whose permission for your bank is current */ {
    data: BankFarmerDto[];
    meta: PageMetaDto;
  };
export type TrackRecordBankFarmersApiArg = {
  page?: number;
  limit?: number;
};
export type TrackRecordBankViewApiResponse =
  /** status 200 Logged on the ledger; checked against its fingerprint */ {
    data: BankViewDto;
  };
export type TrackRecordBankViewApiArg = {
  farmerId: string;
};
export type PlaceDto = {
  code: string;
  name: string;
};
export type TrackPartyDto = {
  id: string;
  name: string;
};
export type BankDto = {
  id: string;
  name: string;
  branchName: string;
  district: PlaceDto;
  address: string;
  status: 'submitted' | 'registered';
  detailsHash: string;
  /** Assigned officers (admins and auditors) */
  officers?: TrackPartyDto[];
};
export type District =
  | 'BARGUNA'
  | 'BARISHAL'
  | 'BHOLA'
  | 'JHALOKATI'
  | 'PATUAKHALI'
  | 'PIROJPUR'
  | 'BANDARBAN'
  | 'BRAHMANBARIA'
  | 'CHANDPUR'
  | 'CHATTOGRAM'
  | 'CUMILLA'
  | 'COXS_BAZAR'
  | 'FENI'
  | 'KHAGRACHHARI'
  | 'LAKSHMIPUR'
  | 'NOAKHALI'
  | 'RANGAMATI'
  | 'DHAKA'
  | 'FARIDPUR'
  | 'GAZIPUR'
  | 'GOPALGANJ'
  | 'KISHOREGANJ'
  | 'MADARIPUR'
  | 'MANIKGANJ'
  | 'MUNSHIGANJ'
  | 'NARAYANGANJ'
  | 'NARSINGDI'
  | 'RAJBARI'
  | 'SHARIATPUR'
  | 'TANGAIL'
  | 'BAGERHAT'
  | 'CHUADANGA'
  | 'JASHORE'
  | 'JHENAIDAH'
  | 'KHULNA'
  | 'KUSHTIA'
  | 'MAGURA'
  | 'MEHERPUR'
  | 'NARAIL'
  | 'SATKHIRA'
  | 'JAMALPUR'
  | 'MYMENSINGH'
  | 'NETROKONA'
  | 'SHERPUR'
  | 'BOGURA'
  | 'JOYPURHAT'
  | 'NAOGAON'
  | 'NATORE'
  | 'CHAPAI_NAWABGANJ'
  | 'PABNA'
  | 'RAJSHAHI'
  | 'SIRAJGANJ'
  | 'DINAJPUR'
  | 'GAIBANDHA'
  | 'KURIGRAM'
  | 'LALMONIRHAT'
  | 'NILPHAMARI'
  | 'PANCHAGARH'
  | 'RANGPUR'
  | 'THAKURGAON'
  | 'HABIGANJ'
  | 'MOULVIBAZAR'
  | 'SUNAMGANJ'
  | 'SYLHET';
export type RegisterBankDto = {
  name: string;
  branchName: string;
  districtCode: District;
  address: string;
};
export type AssignBankOfficerDto = {
  /** Null removes the officer from their bank */
  bankId: string | null;
};
export type SummaryFarmerDto = {
  id: string;
  name: string;
  district: PlaceDto | null;
};
export type SummaryProduceDto = {
  code: string;
  name: string;
  unit: string;
};
export type OutcomeMoneyDto = {
  fundingRaised: string;
  income: string;
  sales: string;
  insurance: string;
  costs: string;
  inputs: string;
  otherCosts: string;
  /** Income less costs; negative is a loss */
  net: string;
  farmerReceived: string;
  /** Investors back over what they put in, percent */
  investorReturnPercent: string | null;
};
export type OutcomeHarvestDto = {
  harvested: string | null;
  sold: string;
  unit: string;
};
export type OutcomeEventDto = {
  type: string;
  occurredOn: string;
  severity: string;
};
export type OutcomeRiskDto = {
  claimsApproved: number;
  claimsRejected: number;
  approvedAmount: string;
  events: OutcomeEventDto[];
};
export type ProjectOutcomeDto = {
  id: string;
  title: string;
  produce: SummaryProduceDto;
  district: PlaceDto;
  durationType: string;
  durationMonths: number;
  startedOn: string | null;
  plannedEndOn: string | null;
  finishedOn: string | null;
  onTime: boolean | null;
  money: OutcomeMoneyDto;
  harvest: OutcomeHarvestDto;
  risk: OutcomeRiskDto;
};
export type SummaryTotalsDto = {
  projects: number;
  finishedOnTime: number;
  fundingRaised: string;
  income: string;
  costs: string;
  net: string;
  farmerReceived: string;
  claimsApproved: number;
  claimsApprovedAmount: string;
};
export type SummaryImportedProjectDto = {
  title: string;
  produce: SummaryProduceDto;
  district: PlaceDto;
  startedOn: string;
  finishedOn: string;
  fundingRaised: string;
  income: string;
  costs: string;
  net: string;
  farmerReceived: string;
  harvested: string | null;
  sold: string | null;
};
export type TrackRecordSummaryDto = {
  /** 2 added importedHistory */
  v: 1 | 2;
  recordId: string;
  generatedAt: string;
  farmer: SummaryFarmerDto;
  projects: ProjectOutcomeDto[];
  totals: SummaryTotalsDto;
  /** WeGro's own records of projects before the platform */
  importedHistory?: SummaryImportedProjectDto[];
};
export type TrackRecordPreviewDto = {
  /** What would be published now */
  summary: TrackRecordSummaryDto;
  latestVersion?: number | null;
};
export type TrackRecordDto = {
  version: number;
  publishedAt: string;
  publishedBy: TrackPartyDto;
  /** Projects covered */
  projects: number;
  summaryHash: string;
  /** Outcomes, money, harvest and sales, and claims of each finished project, with totals */
  summary: TrackRecordSummaryDto;
  /** The summary produces the fingerprint the ledger holds */
  verified: boolean;
};
export type TrackRecordVersionDto = {
  version: number;
  publishedAt: string;
  publishedBy: TrackPartyDto;
  /** Projects covered */
  projects: number;
  summaryHash: string;
};
export type ImportedProjectDto = {
  title: string;
  produce: SummaryProduceDto;
  district: PlaceDto;
  startedOn: string;
  finishedOn: string;
  fundingRaised: string;
  income: string;
  costs: string;
  /** Income less costs; below zero is a loss */
  net: string;
  farmerReceived: string;
  harvested?: string | null;
  sold?: string | null;
};
export type ConsentDto = {
  id: string;
  bank: TrackPartyDto;
  status: 'submitted' | 'active' | 'replaced' | 'revoked';
  /** Active and not expired: the bank can view now */
  current: boolean;
  expiresOn: string;
  expiresAt: string;
  grantedBy: TrackPartyDto;
  grantedAt?: string | null;
  revokedAt?: string | null;
  evidencePhotoUrl: string;
  evidenceHash: string;
  /** Times this bank viewed the track record */
  views: number;
  lastViewedAt?: string | null;
};
export type GrantConsentDto = {
  bankId: string;
  /** Last day the bank may view (Bangladesh), within a year */
  expiresOn: string;
  /** Photo of the farmer's signed consent form, from POST /photos */
  evidencePhotoId: string;
};
export type SummaryViewDto = {
  bank: TrackPartyDto;
  viewer: TrackPartyDto;
  version: number;
  viewedAt: string;
};
export type PageMetaDto = {
  page: number;
  limit: number;
  /** Matching items on all pages */
  total: number;
  totalPages: number;
};
export type MyBankDto = {
  bank?: BankDto | null;
};
export type BankFarmerDto = {
  farmer: TrackPartyDto;
  district?: string | null;
  expiresOn: string;
  /** Latest published version; null if none yet */
  latestVersion?: number | null;
};
export type BankViewDto = {
  farmer: TrackPartyDto;
  version: number;
  publishedAt: string;
  summary: TrackRecordSummaryDto;
  summaryHash: string;
  /** The summary produces the fingerprint the ledger returned */
  verified: boolean;
  /** This view, as logged on the ledger */
  viewedAt: string;
  txHash: string;
};
export const {
  useTrackRecordRegisterBankMutation,
  useTrackRecordListBanksQuery,
  useLazyTrackRecordListBanksQuery,
  useTrackRecordBankQuery,
  useLazyTrackRecordBankQuery,
  useTrackRecordAssignOfficerMutation,
  useTrackRecordPreviewQuery,
  useLazyTrackRecordPreviewQuery,
  useTrackRecordPublishMutation,
  useTrackRecordVersionsQuery,
  useLazyTrackRecordVersionsQuery,
  useTrackRecordRecordQuery,
  useLazyTrackRecordRecordQuery,
  useTrackRecordImportedHistoryQuery,
  useLazyTrackRecordImportedHistoryQuery,
  useTrackRecordConsentsQuery,
  useLazyTrackRecordConsentsQuery,
  useTrackRecordGrantMutation,
  useTrackRecordRevokeMutation,
  useTrackRecordViewHistoryQuery,
  useLazyTrackRecordViewHistoryQuery,
  useTrackRecordMyBankQuery,
  useLazyTrackRecordMyBankQuery,
  useTrackRecordBankFarmersQuery,
  useLazyTrackRecordBankFarmersQuery,
  useTrackRecordBankViewMutation,
} = injectedRtkApi;
