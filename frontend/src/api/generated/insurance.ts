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
            cover: queryArg.cover,
            q: queryArg.q,
          },
        }),
        providesTags: ['Insurance'],
      }),
      insuranceAssignInsurer: build.mutation<
        InsuranceAssignInsurerApiResponse,
        InsuranceAssignInsurerApiArg
      >({
        query: (queryArg) => ({
          url: `/api/insurance/projects/${queryArg.projectId}/insurer`,
          method: 'PUT',
          body: queryArg.assignInsurerDto,
        }),
        invalidatesTags: ['Insurance'],
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
            q: queryArg.q,
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
            paymentDue: queryArg.paymentDue,
            q: queryArg.q,
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
      insuranceRecordPayment: build.mutation<
        InsuranceRecordPaymentApiResponse,
        InsuranceRecordPaymentApiArg
      >({
        query: (queryArg) => ({
          url: `/api/insurance/claims/${queryArg.id}/payment`,
          method: 'POST',
          body: queryArg.paymentReferenceDto,
        }),
        invalidatesTags: ['Insurance'],
      }),
      claimProofsSubmit: build.mutation<
        ClaimProofsSubmitApiResponse,
        ClaimProofsSubmitApiArg
      >({
        query: (queryArg) => ({
          url: `/api/insurance/claims/${queryArg.id}/proofs`,
          method: 'POST',
          body: queryArg.body,
        }),
        invalidatesTags: ['Insurance'],
      }),
      claimProofsForClaim: build.query<
        ClaimProofsForClaimApiResponse,
        ClaimProofsForClaimApiArg
      >({
        query: (queryArg) => ({
          url: `/api/insurance/claims/${queryArg.id}/proofs`,
        }),
        providesTags: ['Insurance'],
      }),
      claimProofsList: build.query<
        ClaimProofsListApiResponse,
        ClaimProofsListApiArg
      >({
        query: (queryArg) => ({
          url: `/api/claim-proofs`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            status: queryArg.status,
            q: queryArg.q,
          },
        }),
        providesTags: ['Insurance'],
      }),
      claimProofsAccept: build.mutation<
        ClaimProofsAcceptApiResponse,
        ClaimProofsAcceptApiArg
      >({
        query: (queryArg) => ({
          url: `/api/claim-proofs/${queryArg.id}/accept`,
          method: 'POST',
          body: queryArg.acceptProofDto,
        }),
        invalidatesTags: ['Insurance'],
      }),
      claimProofsReject: build.mutation<
        ClaimProofsRejectApiResponse,
        ClaimProofsRejectApiArg
      >({
        query: (queryArg) => ({
          url: `/api/claim-proofs/${queryArg.id}/reject`,
          method: 'POST',
          body: queryArg.rejectProofDto,
        }),
        invalidatesTags: ['Insurance'],
      }),
      claimProofsFile: build.query<
        ClaimProofsFileApiResponse,
        ClaimProofsFileApiArg
      >({
        query: (queryArg) => ({
          url: `/api/claim-proofs/files/${queryArg.fileId}`,
        }),
        providesTags: ['Insurance'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as insuranceApi };
export type InsuranceInsuredProjectsApiResponse =
  /** status 200 Insured projects in the field with their insurer and cover; an insurer sees those assigned to it */ {
    data: InsuredProjectDto[];
    meta: PageMetaDto;
  };
export type InsuranceInsuredProjectsApiArg = {
  page?: number;
  limit?: number;
  districtCode?: District;
  /** unassigned: no insurer yet; no_cover: assigned, terms not set; covered: terms set */
  cover?: 'unassigned' | 'no_cover' | 'covered';
  /** Words of the project title, or the farmer: a mobile number, an NID or whole words of their name */
  q?: string;
};
export type InsuranceAssignInsurerApiResponse =
  /** status 200 An admin assigns the insurer; switching is allowed until the first claim and clears the old cover */ {
    data: CoverageDto;
  };
export type InsuranceAssignInsurerApiArg = {
  projectId: string;
  assignInsurerDto: AssignInsurerDto;
};
export type InsuranceCoverageApiResponse = /** status 200  */ {
  data: CoverageDto;
};
export type InsuranceCoverageApiArg = {
  projectId: string;
};
export type InsuranceSetCoverageApiResponse =
  /** status 200 The project's assigned insurer sets or changes its cover */ {
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
  /** Words of the event type or the district */
  q?: string;
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
  status?:
    | 'submitted'
    | 'triggered'
    | 'under_review'
    | 'approved'
    | 'rejected'
    | 'paid';
  /** Approved claims waiting for the insurer's payment */
  paymentDue?: boolean;
  /** Words of the project title or the weather event type, or the farmer: a mobile number, an NID or whole words of their name */
  q?: string;
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
export type InsuranceRecordPaymentApiResponse =
  /** status 200 The insurer paid an approved claim to WeGro; only then it counts as project income */ {
    data: ClaimDto;
  };
export type InsuranceRecordPaymentApiArg = {
  id: string;
  paymentReferenceDto: PaymentReferenceDto;
};
export type ClaimProofsSubmitApiResponse =
  /** status 201 Under review until Accounts decides */ {
    data: ClaimProofDto;
  };
export type ClaimProofsSubmitApiArg = {
  id: string;
  body: {
    /** 1 to 3 photos or PDFs, up to 10 MB each */
    files: Blob[];
    amount: string;
    transferredOn: string;
    method: 'bank_deposit' | 'cash' | 'cheque';
    /** The branch paid from (deposit or cheque) */
    routingNumber?: string;
    reference?: string;
    note?: string;
  };
};
export type ClaimProofsForClaimApiResponse = /** status 200 Newest first */ {
  data: ClaimProofDto[];
};
export type ClaimProofsForClaimApiArg = {
  id: string;
};
export type ClaimProofsListApiResponse =
  /** status 200 Waiting ones oldest first */ {
    data: ClaimProofDto[];
    meta: PageMetaDto;
  };
export type ClaimProofsListApiArg = {
  page?: number;
  limit?: number;
  status?: ProofStatus;
  /** Whose: the insurer’s mobile number, NID, or whole words of their name */
  q?: string;
};
export type ClaimProofsAcceptApiResponse =
  /** status 200 When accepted proofs cover the approved amount, the claim's payment is recorded on the ledger */ {
    data: ClaimProofDto;
  };
export type ClaimProofsAcceptApiArg = {
  id: string;
  acceptProofDto: AcceptProofDto;
};
export type ClaimProofsRejectApiResponse = /** status 200  */ {
  data: ClaimProofDto;
};
export type ClaimProofsRejectApiArg = {
  id: string;
  rejectProofDto: RejectProofDto;
};
export type ClaimProofsFileApiResponse = unknown;
export type ClaimProofsFileApiArg = {
  fileId: string;
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
  farmer: PartyDto;
  /** The insurer an admin assigned, if any */
  insurer?: PartyDto | null;
  /** The assigned insurer's maximum cover, once set */
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
  project: PartyDto;
  farmer: PartyDto;
  district: PlaceDto;
  produceCode: string;
  stage: string;
  /** The crop is in the field (funded or active): cover can change and claims open */
  inField: boolean;
  /** The insurer an admin assigned, if any */
  insurer?: PartyDto | null;
  /** A claim was opened, so the insurer can no longer be changed */
  insurerFixed: boolean;
  /** The assigned insurer's latest recorded terms, if set */
  current?: CoverageVersionDto | null;
  /** Approved claims so far, paid or not */
  approvedTotal: string;
  /** Claims the insurer has paid: what counts as project income */
  paidTotal: string;
  /** Still available for claims */
  remaining: string;
  /** Claims waiting for the insurer */
  openClaims: number;
  /** Approved claims waiting for the insurer's payment */
  unpaidClaims: number;
  /** Earlier versions, newest first */
  history: CoverageVersionDto[];
};
export type AssignInsurerDto = {
  /** A verified insurer */
  insurerId: string;
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
  status:
    | 'submitted'
    | 'triggered'
    | 'under_review'
    | 'approved'
    | 'rejected'
    | 'paid';
  openedAt?: string | null;
  assessment?: AssessmentViewDto | null;
  approvedAmount?: string | null;
  decidedAt?: string | null;
  /** The project's insurer */
  insurer?: PartyDto | null;
  /** When Accounts recorded the insurer's payment */
  paidAt?: string | null;
  /** Accounts, admins and auditors */
  paymentReference?: string | null;
  /** Accepted so far from the insurer's proofs (the project's insurer and payment staff) */
  paid?: string;
  /** Sent and waiting for Accounts (the project's insurer and payment staff) */
  underReview?: string;
  /** Still to send: the approved amount less accepted and waiting proofs (the project's insurer and payment staff) */
  remaining?: string;
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
export type PaymentReferenceDto = {
  paymentReference: string;
};
export type PersonRefDto = {
  id: string;
  fullName: string;
};
export type PaymentMethod = 'bank_deposit' | 'cash' | 'cheque';
export type ProofFileDto = {
  id: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};
export type ProofStatus = 'pending' | 'accepted' | 'rejected';
export type ProofDecisionDto = {
  by?: PersonRefDto | null;
  at?: string | null;
};
export type ClaimProofDto = {
  id: string;
  claimId: string;
  project: PartyDto;
  insurer: PersonRefDto;
  amount: string;
  /** What the insurer pays in all: the approved amount */
  claimTotal: string;
  claimStatus:
    | 'submitted'
    | 'triggered'
    | 'under_review'
    | 'approved'
    | 'rejected'
    | 'paid';
  transferredOn: string;
  method: PaymentMethod;
  bankName?: string | null;
  branchName?: string | null;
  districtName?: string | null;
  routingNumber?: string | null;
  /** As the insurer typed it */
  reference?: string | null;
  note?: string | null;
  files: ProofFileDto[];
  status: ProofStatus;
  submittedAt: string;
  decided: ProofDecisionDto;
  rejectionReason?: string | null;
  /** The statement reference Accounts verified (Accounts, admin and auditor only) */
  verifiedReference?: string | null;
};
export type AcceptProofDto = {
  /** The reference on the bank statement; used once */
  paymentReference: string;
};
export type RejectProofDto = {
  /** The investor reads this */
  reason: string;
};
export const {
  useInsuranceInsuredProjectsQuery,
  useLazyInsuranceInsuredProjectsQuery,
  useInsuranceAssignInsurerMutation,
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
  useInsuranceRecordPaymentMutation,
  useClaimProofsSubmitMutation,
  useClaimProofsForClaimQuery,
  useLazyClaimProofsForClaimQuery,
  useClaimProofsListQuery,
  useLazyClaimProofsListQuery,
  useClaimProofsAcceptMutation,
  useClaimProofsRejectMutation,
  useClaimProofsFileQuery,
  useLazyClaimProofsFileQuery,
} = injectedRtkApi;
