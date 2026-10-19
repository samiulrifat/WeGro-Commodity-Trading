import { baseApi as api } from '../base-api';
export const addTagTypes = ['Insurance'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      insuranceInsuredProjects: build.query<
        InsuranceInsuredProjectsApiResponse,
        InsuranceInsuredProjectsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/insurance/projects`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            districtCode: queryArg.districtCode,
          },
        }),
        providesTags: ['Insurance'],
      }),
      insuranceCoverage: build.query<
        InsuranceCoverageApiResponse,
        InsuranceCoverageApiArg
      >({
        query: (queryArg) => ({
          url: `/api/insurance/projects/${queryArg.projectId}/coverage`,
        }),
        providesTags: ['Insurance'],
      }),
      insuranceSetCoverage: build.mutation<
        InsuranceSetCoverageApiResponse,
        InsuranceSetCoverageApiArg
      >({
        query: (queryArg) => ({
          url: `/api/insurance/projects/${queryArg.projectId}/coverage`,
          method: 'PUT',
          body: queryArg.setCoverageDto,
        }),
        invalidatesTags: ['Insurance'],
      }),
      insuranceListWeatherEvents: build.query<
        InsuranceListWeatherEventsApiResponse,
        InsuranceListWeatherEventsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/insurance/weather-events`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            districtCode: queryArg.districtCode,
            eventTypeCode: queryArg.eventTypeCode,
          },
        }),
        providesTags: ['Insurance'],
      }),
      insuranceRecordWeatherEvent: build.mutation<
        InsuranceRecordWeatherEventApiResponse,
        InsuranceRecordWeatherEventApiArg
      >({
        query: (queryArg) => ({
          url: `/api/insurance/weather-events`,
          method: 'POST',
          body: queryArg.recordWeatherEventDto,
        }),
        invalidatesTags: ['Insurance'],
      }),
      insuranceWeatherEvent: build.query<
        InsuranceWeatherEventApiResponse,
        InsuranceWeatherEventApiArg
      >({
        query: (queryArg) => ({
          url: `/api/insurance/weather-events/${queryArg.id}`,
        }),
        providesTags: ['Insurance'],
      }),
      insuranceOpenClaim: build.mutation<
        InsuranceOpenClaimApiResponse,
        InsuranceOpenClaimApiArg
      >({
        query: (queryArg) => ({
          url: `/api/insurance/projects/${queryArg.projectId}/claims`,
          method: 'POST',
          body: queryArg.openClaimDto,
        }),
        invalidatesTags: ['Insurance'],
      }),
      insuranceListClaims: build.query<
        InsuranceListClaimsApiResponse,
        InsuranceListClaimsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/insurance/claims`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            projectId: queryArg.projectId,
            status: queryArg.status,
          },
        }),
        providesTags: ['Insurance'],
      }),
      insuranceClaim: build.query<
        InsuranceClaimApiResponse,
        InsuranceClaimApiArg
      >({
        query: (queryArg) => ({ url: `/api/insurance/claims/${queryArg.id}` }),
        providesTags: ['Insurance'],
      }),
      insuranceStartReview: build.mutation<
        InsuranceStartReviewApiResponse,
        InsuranceStartReviewApiArg
      >({
        query: (queryArg) => ({
          url: `/api/insurance/claims/${queryArg.id}/review`,
          method: 'POST',
        }),
        invalidatesTags: ['Insurance'],
      }),
      insuranceApprove: build.mutation<
        InsuranceApproveApiResponse,
        InsuranceApproveApiArg
      >({
        query: (queryArg) => ({
          url: `/api/insurance/claims/${queryArg.id}/approve`,
          method: 'POST',
          body: queryArg.approveClaimDto,
        }),
        invalidatesTags: ['Insurance'],
      }),
      insuranceReject: build.mutation<
        InsuranceRejectApiResponse,
        InsuranceRejectApiArg
      >({
        query: (queryArg) => ({
          url: `/api/insurance/claims/${queryArg.id}/reject`,
          method: 'POST',
          body: queryArg.assessmentDto,
        }),
        invalidatesTags: ['Insurance'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as insuranceApi };
export type InsuranceInsuredProjectsApiResponse =
  /** status 200 Insured projects in the field, with who covers each */ {
    data: InsuredProjectDto[];
    meta: PageMetaDto;
  };
export type InsuranceInsuredProjectsApiArg = {
  page?: number;
  limit?: number;
  districtCode?: District;
};
export type InsuranceCoverageApiResponse = /** status 200  */ {
  data: CoverageDto;
};
export type InsuranceCoverageApiArg = {
  projectId: string;
};
export type InsuranceSetCoverageApiResponse =
  /** status 200 The first insurer becomes the project insurer; only they change it */ {
    data: CoverageDto;
  };
export type InsuranceSetCoverageApiArg = {
  projectId: string;
  setCoverageDto: SetCoverageDto;
};
export type InsuranceListWeatherEventsApiResponse =
  /** status 200 Newest first */ {
    data: WeatherEventDto[];
    meta: PageMetaDto;
  };
export type InsuranceListWeatherEventsApiArg = {
  page?: number;
  limit?: number;
  districtCode?: District;
  eventTypeCode?: string;
};
export type InsuranceRecordWeatherEventApiResponse = /** status 201  */ {
  data: WeatherEventDto;
};
export type InsuranceRecordWeatherEventApiArg = {
  recordWeatherEventDto: RecordWeatherEventDto;
};
export type InsuranceWeatherEventApiResponse = /** status 200  */ {
  data: WeatherEventDto;
};
export type InsuranceWeatherEventApiArg = {
  id: string;
};
export type InsuranceOpenClaimApiResponse =
  /** status 201 By the farmer's field officer or an admin, citing an event */ {
    data: ClaimDto;
  };
export type InsuranceOpenClaimApiArg = {
  projectId: string;
  openClaimDto: OpenClaimDto;
};
export type InsuranceListClaimsApiResponse = /** status 200  */ {
  data: ClaimDto[];
  meta: PageMetaDto;
};
export type InsuranceListClaimsApiArg = {
  page?: number;
  limit?: number;
  projectId?: string;
  status?: 'submitted' | 'triggered' | 'under_review' | 'approved' | 'rejected';
};
export type InsuranceClaimApiResponse = /** status 200  */ {
  data: ClaimDto;
};
export type InsuranceClaimApiArg = {
  id: string;
};
export type InsuranceStartReviewApiResponse =
  /** status 200 The project's insurer */ {
    data: ClaimDto;
  };
export type InsuranceStartReviewApiArg = {
  id: string;
};
export type InsuranceApproveApiResponse =
  /** status 200 Within the remaining cover, with an assessment */ {
    data: ClaimDto;
  };
export type InsuranceApproveApiArg = {
  id: string;
  approveClaimDto: ApproveClaimDto;
};
export type InsuranceRejectApiResponse = /** status 200 With an assessment */ {
  data: ClaimDto;
};
export type InsuranceRejectApiArg = {
  id: string;
  assessmentDto: AssessmentDto;
};
export type PartyDto = {
  id: string;
  name: string;
};
export type PlaceDto = {
  code: string;
  name: string;
};
export type InsuredProjectDto = {
  project: PartyDto;
  district: PlaceDto;
  produceCode: string;
  stage: string;
  /** Who covers it, if anyone yet */
  insurer?: PartyDto | null;
  maxAmount?: string | null;
};
export type PageMetaDto = {
  page: number;
  limit: number;
  /** Matching items on all pages */
  total: number;
  totalPages: number;
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
export type EventTypeRefDto = {
  code: string;
  name: string;
  nameBn: string;
};
export type CoverageVersionDto = {
  maxAmount: string;
  coveredEventTypes: EventTypeRefDto[];
  notes?: string | null;
  termsHash: string;
  status: 'submitted' | 'recorded';
  recordedAt?: string | null;
};
export type CoverageDto = {
  projectId: string;
  insurer: PartyDto;
  /** The latest recorded version */
  current: CoverageVersionDto;
  /** Approved claims so far */
  approvedTotal: string;
  /** Still available for claims */
  remaining: string;
  /** Claims waiting for the insurer */
  openClaims: number;
  /** Earlier versions, newest first */
  history: CoverageVersionDto[];
};
export type SetCoverageDto = {
  /** Most the cover pays in total, taka */
  maxAmount: string;
  /** Weather event types covered (catalog codes) */
  coveredEventTypes: string[];
  /** What is covered and on what terms */
  notes?: string;
};
export type WeatherEventDto = {
  id: string;
  district: PlaceDto;
  eventType: EventTypeRefDto;
  occurredOn: string;
  severity: 'low' | 'moderate' | 'severe';
  notes?: string | null;
  status: 'submitted' | 'recorded';
  recordedAt?: string | null;
  recordedBy: PartyDto;
};
export type RecordWeatherEventDto = {
  districtCode: District;
  eventTypeCode: string;
  /** Day it happened (Bangladesh) */
  occurredOn: string;
  severity: 'low' | 'moderate' | 'severe';
  notes?: string;
};
export type AssessmentViewDto = {
  damagePercent?: string | null;
  notes: string;
  photoUrl?: string | null;
};
export type ClaimDto = {
  id: string;
  project: PartyDto;
  event: WeatherEventDto;
  damagePercent: string;
  notes: string;
  /** Photo URLs */
  photos: string[];
  openedBy: PartyDto;
  status: 'submitted' | 'triggered' | 'under_review' | 'approved' | 'rejected';
  openedAt?: string | null;
  assessment?: AssessmentViewDto | null;
  approvedAmount?: string | null;
  decidedAt?: string | null;
  claimHash: string;
  assessmentHash?: string | null;
};
export type OpenClaimDto = {
  /** A recorded weather event in the project's district */
  eventId: string;
  /** Estimated share of the crop damaged, one decimal place */
  damagePercent: string | number;
  /** What happened to the crop */
  notes: string;
  /** Up to 5, from POST /photos */
  photoIds?: string[];
};
export type ApproveClaimDto = {
  /** Damage the insurer found, one decimal place */
  damagePercent?: string | number;
  /** The assessor's findings */
  notes: string;
  /** From POST /photos */
  photoId?: string;
  /** Taka; within the remaining cover */
  amount: string;
};
export type AssessmentDto = {
  /** Damage the insurer found, one decimal place */
  damagePercent?: string | number;
  /** The assessor's findings */
  notes: string;
  /** From POST /photos */
  photoId?: string;
};
export const {
  useInsuranceInsuredProjectsQuery,
  useLazyInsuranceInsuredProjectsQuery,
  useInsuranceCoverageQuery,
  useLazyInsuranceCoverageQuery,
  useInsuranceSetCoverageMutation,
  useInsuranceListWeatherEventsQuery,
  useLazyInsuranceListWeatherEventsQuery,
  useInsuranceRecordWeatherEventMutation,
  useInsuranceWeatherEventQuery,
  useLazyInsuranceWeatherEventQuery,
  useInsuranceOpenClaimMutation,
  useInsuranceListClaimsQuery,
  useLazyInsuranceListClaimsQuery,
  useInsuranceClaimQuery,
  useLazyInsuranceClaimQuery,
  useInsuranceStartReviewMutation,
  useInsuranceApproveMutation,
  useInsuranceRejectMutation,
} = injectedRtkApi;
