import { baseApi as api } from '../base-api';
export const addTagTypes = ['Projects'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      projectsCreate: build.mutation<
        ProjectsCreateApiResponse,
        ProjectsCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects`,
          method: 'POST',
          body: queryArg.createProjectDto,
        }),
        invalidatesTags: ['Projects'],
      }),
      projectsList: build.query<ProjectsListApiResponse, ProjectsListApiArg>({
        query: (queryArg) => ({
          url: `/api/projects`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            stage: queryArg.stage,
            durationType: queryArg.durationType,
            produceCode: queryArg.produceCode,
            districtCode: queryArg.districtCode,
            farmerId: queryArg.farmerId,
            q: queryArg.q,
            favourites: queryArg.favourites,
          },
        }),
        providesTags: ['Projects'],
      }),
      projectsFindOne: build.query<
        ProjectsFindOneApiResponse,
        ProjectsFindOneApiArg
      >({
        query: (queryArg) => ({ url: `/api/projects/${queryArg.id}` }),
        providesTags: ['Projects'],
      }),
      projectsUpdate: build.mutation<
        ProjectsUpdateApiResponse,
        ProjectsUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects/${queryArg.id}`,
          method: 'PATCH',
          body: queryArg.updateProjectDto,
        }),
        invalidatesTags: ['Projects'],
      }),
      projectsRemove: build.mutation<
        ProjectsRemoveApiResponse,
        ProjectsRemoveApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects/${queryArg.id}`,
          method: 'DELETE',
        }),
        invalidatesTags: ['Projects'],
      }),
      projectsPublish: build.mutation<
        ProjectsPublishApiResponse,
        ProjectsPublishApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects/${queryArg.id}/publish`,
          method: 'POST',
        }),
        invalidatesTags: ['Projects'],
      }),
      projectsActivate: build.mutation<
        ProjectsActivateApiResponse,
        ProjectsActivateApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects/${queryArg.id}/activate`,
          method: 'POST',
        }),
        invalidatesTags: ['Projects'],
      }),
      projectsReadyForSale: build.mutation<
        ProjectsReadyForSaleApiResponse,
        ProjectsReadyForSaleApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects/${queryArg.id}/ready-for-sale`,
          method: 'POST',
        }),
        invalidatesTags: ['Projects'],
      }),
      projectsClose: build.mutation<
        ProjectsCloseApiResponse,
        ProjectsCloseApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects/${queryArg.id}/close`,
          method: 'POST',
        }),
        invalidatesTags: ['Projects'],
      }),
      projectsCancel: build.mutation<
        ProjectsCancelApiResponse,
        ProjectsCancelApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects/${queryArg.id}/cancel`,
          method: 'POST',
        }),
        invalidatesTags: ['Projects'],
      }),
      projectsSetCover: build.mutation<
        ProjectsSetCoverApiResponse,
        ProjectsSetCoverApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects/${queryArg.id}/cover`,
          method: 'POST',
          body: queryArg.body,
        }),
        invalidatesTags: ['Projects'],
      }),
      projectsCover: build.query<ProjectsCoverApiResponse, ProjectsCoverApiArg>(
        {
          query: (queryArg) => ({ url: `/api/projects/${queryArg.id}/cover` }),
          providesTags: ['Projects'],
        },
      ),
      projectsAddFavourite: build.mutation<
        ProjectsAddFavouriteApiResponse,
        ProjectsAddFavouriteApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects/${queryArg.id}/favourite`,
          method: 'PUT',
        }),
        invalidatesTags: ['Projects'],
      }),
      projectsRemoveFavourite: build.mutation<
        ProjectsRemoveFavouriteApiResponse,
        ProjectsRemoveFavouriteApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects/${queryArg.id}/favourite`,
          method: 'DELETE',
        }),
        invalidatesTags: ['Projects'],
      }),
      projectsTimeline: build.query<
        ProjectsTimelineApiResponse,
        ProjectsTimelineApiArg
      >({
        query: (queryArg) => ({ url: `/api/projects/${queryArg.id}/timeline` }),
        providesTags: ['Projects'],
      }),
      projectsIntegrity: build.query<
        ProjectsIntegrityApiResponse,
        ProjectsIntegrityApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects/${queryArg.id}/integrity`,
        }),
        providesTags: ['Projects'],
      }),
      projectsReserve: build.mutation<
        ProjectsReserveApiResponse,
        ProjectsReserveApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects/${queryArg.id}/reservations`,
          method: 'POST',
          body: queryArg.reserveSlotsDto,
        }),
        invalidatesTags: ['Projects'],
      }),
      projectsHolders: build.query<
        ProjectsHoldersApiResponse,
        ProjectsHoldersApiArg
      >({
        query: (queryArg) => ({ url: `/api/projects/${queryArg.id}/holders` }),
        providesTags: ['Projects'],
      }),
      projectsRefunds: build.query<
        ProjectsRefundsApiResponse,
        ProjectsRefundsApiArg
      >({
        query: (queryArg) => ({ url: `/api/projects/${queryArg.id}/refunds` }),
        providesTags: ['Projects'],
      }),
      projectsRecordRefund: build.mutation<
        ProjectsRecordRefundApiResponse,
        ProjectsRecordRefundApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects/${queryArg.id}/refunds`,
          method: 'POST',
          body: queryArg.recordRefundDto,
        }),
        invalidatesTags: ['Projects'],
      }),
      reservationsList: build.query<
        ReservationsListApiResponse,
        ReservationsListApiArg
      >({
        query: (queryArg) => ({
          url: `/api/reservations`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            status: queryArg.status,
            projectId: queryArg.projectId,
            q: queryArg.q,
          },
        }),
        providesTags: ['Projects'],
      }),
      reservationsFindOne: build.query<
        ReservationsFindOneApiResponse,
        ReservationsFindOneApiArg
      >({
        query: (queryArg) => ({ url: `/api/reservations/${queryArg.id}` }),
        providesTags: ['Projects'],
      }),
      reservationsConfirm: build.mutation<
        ReservationsConfirmApiResponse,
        ReservationsConfirmApiArg
      >({
        query: (queryArg) => ({
          url: `/api/reservations/${queryArg.id}/confirm`,
          method: 'POST',
          body: queryArg.paymentReferenceDto,
        }),
        invalidatesTags: ['Projects'],
      }),
      reservationsCancel: build.mutation<
        ReservationsCancelApiResponse,
        ReservationsCancelApiArg
      >({
        query: (queryArg) => ({
          url: `/api/reservations/${queryArg.id}/cancel`,
          method: 'POST',
        }),
        invalidatesTags: ['Projects'],
      }),
      investmentsMine: build.query<
        InvestmentsMineApiResponse,
        InvestmentsMineApiArg
      >({
        query: () => ({ url: `/api/investments` }),
        providesTags: ['Projects'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as projectsApi };
export type ProjectsCreateApiResponse =
  /** status 201 A draft, editable until published */ {
    data: ProjectDto;
  };
export type ProjectsCreateApiArg = {
  createProjectDto: CreateProjectDto;
};
export type ProjectsListApiResponse = /** status 200  */ {
  data: ProjectDto[];
  meta: PageMetaDto;
};
export type ProjectsListApiArg = {
  page?: number;
  limit?: number;
  stage?:
    | 'draft'
    | 'open_for_funding'
    | 'funded'
    | 'active'
    | 'ready_for_sale'
    | 'paid_out'
    | 'closed'
    | 'cancelled';
  durationType?: 'short_term' | 'long_term';
  produceCode?: string;
  districtCode?: District;
  /** Staff only */
  farmerId?: string;
  /** Words of the title, the place or the crop */
  q?: string;
  /** Only those you saved (investors) */
  favourites?: boolean;
};
export type ProjectsFindOneApiResponse = /** status 200  */ {
  data: ProjectDto;
};
export type ProjectsFindOneApiArg = {
  id: string;
};
export type ProjectsUpdateApiResponse = /** status 200 Drafts only */ {
  data: ProjectDto;
};
export type ProjectsUpdateApiArg = {
  id: string;
  updateProjectDto: UpdateProjectDto;
};
export type ProjectsRemoveApiResponse = unknown;
export type ProjectsRemoveApiArg = {
  id: string;
};
export type ProjectsPublishApiResponse =
  /** status 200 Fixes the terms on the ledger and opens funding */ {
    data: ProjectDto;
  };
export type ProjectsPublishApiArg = {
  id: string;
};
export type ProjectsActivateApiResponse =
  /** status 200 Funded to Active (normally done by the first approved voucher) */ {
    data: ProjectDto;
  };
export type ProjectsActivateApiArg = {
  id: string;
};
export type ProjectsReadyForSaleApiResponse = /** status 200  */ {
  data: ProjectDto;
};
export type ProjectsReadyForSaleApiArg = {
  id: string;
};
export type ProjectsCloseApiResponse = /** status 200  */ {
  data: ProjectDto;
};
export type ProjectsCloseApiArg = {
  id: string;
};
export type ProjectsCancelApiResponse =
  /** status 200 Before Active; investors who paid are owed refunds */ {
    data: ProjectDto;
  };
export type ProjectsCancelApiArg = {
  id: string;
};
export type ProjectsSetCoverApiResponse =
  /** status 200 JPEG, PNG or WebP up to 10 MB; drafts only */ {
    data: ProjectDto;
  };
export type ProjectsSetCoverApiArg = {
  id: string;
  body: {
    file?: Blob;
  };
};
export type ProjectsCoverApiResponse = unknown;
export type ProjectsCoverApiArg = {
  id: string;
};
export type ProjectsAddFavouriteApiResponse =
  /** status 200 Saved to your favourites */ {
    data: ProjectDto;
  };
export type ProjectsAddFavouriteApiArg = {
  id: string;
};
export type ProjectsRemoveFavouriteApiResponse =
  /** status 200 Taken off your favourites */ {
    data: ProjectDto;
  };
export type ProjectsRemoveFavouriteApiArg = {
  id: string;
};
export type ProjectsTimelineApiResponse = /** status 200  */ {
  data: TimelineEntryDto[];
};
export type ProjectsTimelineApiArg = {
  id: string;
};
export type ProjectsIntegrityApiResponse = /** status 200  */ {
  data: ProjectIntegrityDto;
};
export type ProjectsIntegrityApiArg = {
  id: string;
};
export type ProjectsReserveApiResponse = /** status 201 Expires if unpaid */ {
  data: ReservationDto;
};
export type ProjectsReserveApiArg = {
  id: string;
  reserveSlotsDto: ReserveSlotsDto;
};
export type ProjectsHoldersApiResponse = /** status 200  */ {
  data: HoldingDto[];
};
export type ProjectsHoldersApiArg = {
  id: string;
};
export type ProjectsRefundsApiResponse = /** status 200  */ {
  data: RefundLineDto[];
};
export type ProjectsRefundsApiArg = {
  id: string;
};
export type ProjectsRecordRefundApiResponse = /** status 201  */ {
  data: RefundLineDto[];
};
export type ProjectsRecordRefundApiArg = {
  id: string;
  recordRefundDto: RecordRefundDto;
};
export type ReservationsListApiResponse = /** status 200  */ {
  data: ReservationDto[];
  meta: PageMetaDto;
};
export type ReservationsListApiArg = {
  page?: number;
  limit?: number;
  status?: 'pending' | 'confirmed' | 'expired' | 'cancelled';
  projectId?: string;
  /** Whose (staff): a mobile number, an NID, or whole words of their name */
  q?: string;
};
export type ReservationsFindOneApiResponse = /** status 200  */ {
  data: ReservationDto;
};
export type ReservationsFindOneApiArg = {
  id: number;
};
export type ReservationsConfirmApiResponse =
  /** status 200 Issues the slots */ {
    data: ReservationDto;
  };
export type ReservationsConfirmApiArg = {
  id: number;
  paymentReferenceDto: PaymentReferenceDto;
};
export type ReservationsCancelApiResponse = /** status 200  */ {
  data: ReservationDto;
};
export type ReservationsCancelApiArg = {
  id: number;
};
export type InvestmentsMineApiResponse =
  /** status 200 Your holdings, with the estimated return range */ {
    data: InvestmentDto[];
  };
export type InvestmentsMineApiArg = void;
export type ProduceRefDto = {
  code: string;
  name: string;
  nameBn?: string;
  unit: string;
};
export type NamedCodeDto = {
  code: string;
  name: string;
  nameBn?: string;
};
export type PersonRefDto = {
  id: string;
  fullName: string;
};
export type SplitDto = {
  farmer: string;
  investors: string;
  wegro: string;
};
export type EstimatedReturnDto = {
  minPercent: string;
  maxPercent: string;
  /** Taka at the low estimate: per slot on a project, for the slots held on an investment */
  minAmount: string;
  maxAmount: string;
  note: string;
};
export type ProjectDto = {
  id: string;
  title: string;
  description?: string | null;
  produce: ProduceRefDto;
  category: 'storable_crop' | 'spice' | 'perishable';
  district: NamedCodeDto;
  location: string;
  farmer: PersonRefDto;
  durationType: 'short_term' | 'long_term';
  durationMonths: number;
  payoutIntervalMonths: number;
  fundingTarget: string;
  slotPrice: string;
  totalSlots: number;
  issuedSlots: number;
  reservedSlots: number;
  availableSlots: number;
  /** Share of slots paid for */
  fundedPercent: string;
  split: SplitDto;
  insured: boolean;
  estimatedReturn: EstimatedReturnDto;
  plannedStartDate?: string | null;
  coverPhotoUrl?: string | null;
  /** Investors holding slots */
  investorCount: number;
  /** Investors who reserved slots today (Bangladesh time) */
  investingToday: number;
  /** Saved by you (investors only) */
  favourite?: boolean;
  stage:
    | 'draft'
    | 'open_for_funding'
    | 'funded'
    | 'active'
    | 'ready_for_sale'
    | 'paid_out'
    | 'closed'
    | 'cancelled';
  chainState: 'local' | 'submitted' | 'confirmed';
  termsHash?: string | null;
  /** Owed to investors after a cancellation */
  refundTotal?: string | null;
  publishedAt?: string | null;
  stageChangedAt?: string | null;
  createdAt: string;
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
export type CreateProjectDto = {
  title: string;
  description?: string;
  produceCode: string;
  districtCode: District;
  location: string;
  /** A verified farmer */
  farmerId: string;
  durationType: 'short_term' | 'long_term';
  durationMonths: number;
  /** Months between staged payouts; 0 = one final payout */
  payoutIntervalMonths?: number;
  /** Taka; a whole number of slots */
  fundingTarget: string;
  /** Taka per slot */
  slotPrice: string;
  /** Basis points: 4000 = 40% */
  farmerBps?: number;
  investorBps?: number;
  wegroBps?: number;
  insured?: boolean;
  /** Low estimate of investor return, basis points */
  estimatedReturnMinBps: number;
  /** High estimate of investor return, basis points */
  estimatedReturnMaxBps: number;
  plannedStartDate?: string;
};
export type PageMetaDto = {
  page: number;
  limit: number;
  /** Matching items on all pages */
  total: number;
  totalPages: number;
};
export type UpdateProjectDto = {
  title?: string;
  description?: string | null;
  produceCode?: string;
  districtCode?: District;
  location?: string;
  farmerId?: string;
  durationType?: 'short_term' | 'long_term';
  durationMonths?: number;
  payoutIntervalMonths?: number;
  fundingTarget?: string;
  slotPrice?: string;
  farmerBps?: number;
  investorBps?: number;
  wegroBps?: number;
  insured?: boolean;
  estimatedReturnMinBps?: number;
  estimatedReturnMaxBps?: number;
  plannedStartDate?: string | null;
};
export type TimelineEntryDto = {
  at: string;
  kind: 'created' | 'stage_changed' | 'refunds_required' | 'field_record';
  stage?:
    | 'draft'
    | 'open_for_funding'
    | 'funded'
    | 'active'
    | 'ready_for_sale'
    | 'paid_out'
    | 'closed'
    | 'cancelled';
  /** For field_record: open it for photo and readings */
  fieldRecordId?: string;
  entryType?: string;
  /** Ledger transaction */
  txHash: string;
  blockNumber: number;
};
export type ProjectIntegrityDto = {
  matches: boolean;
  /** Fingerprint recomputed from the stored terms */
  computedHash: string;
  ledgerHash?: string | null;
  ledgerStage?:
    | (
        | 'draft'
        | 'open_for_funding'
        | 'funded'
        | 'active'
        | 'ready_for_sale'
        | 'paid_out'
        | 'closed'
        | 'cancelled'
      )
    | null;
  mismatches: string[];
};
export type ReservationDto = {
  id: number;
  projectId: string;
  projectTitle: string;
  investor: PersonRefDto;
  slots: number;
  amount: string;
  status: 'pending' | 'confirmed' | 'expired' | 'cancelled';
  reservedAt: string;
  /** The deadline; stopped while onHold */
  expiresAt: string;
  /** A payment proof is under review: the clock is stopped and it cannot expire */
  onHold: boolean;
  /** Seconds left on the clock while on hold */
  pausedRemainingSeconds?: number | null;
  /** Accepted by Accounts */
  paid: string;
  /** In proofs not reviewed yet */
  underReview: string;
  /** Still to send */
  remaining: string;
  closedAt?: string | null;
  /** Accounts, admin and auditor only */
  paymentReference?: string | null;
};
export type ReserveSlotsDto = {
  slots: number;
};
export type HoldingDto = {
  investor: PersonRefDto;
  slots: number;
  amount: string;
};
export type RefundLineDto = {
  investor: PersonRefDto;
  slots: number;
  amount: string;
  status: 'due' | 'submitted' | 'refunded';
  paymentReference?: string | null;
  recordedAt?: string | null;
};
export type RecordRefundDto = {
  paymentReference: string;
  investorId: string;
};
export type PaymentReferenceDto = {
  paymentReference: string;
};
export type InvestmentDto = {
  project: ProjectDto;
  /** Slots paid for and issued */
  slots: number;
  invested: string;
  /** Slots reserved and awaiting payment confirmation */
  pendingSlots: number;
  /** For the slots held */
  estimatedReturn: EstimatedReturnDto;
};
export const {
  useProjectsCreateMutation,
  useProjectsListQuery,
  useLazyProjectsListQuery,
  useProjectsFindOneQuery,
  useLazyProjectsFindOneQuery,
  useProjectsUpdateMutation,
  useProjectsRemoveMutation,
  useProjectsPublishMutation,
  useProjectsActivateMutation,
  useProjectsReadyForSaleMutation,
  useProjectsCloseMutation,
  useProjectsCancelMutation,
  useProjectsSetCoverMutation,
  useProjectsCoverQuery,
  useLazyProjectsCoverQuery,
  useProjectsAddFavouriteMutation,
  useProjectsRemoveFavouriteMutation,
  useProjectsTimelineQuery,
  useLazyProjectsTimelineQuery,
  useProjectsIntegrityQuery,
  useLazyProjectsIntegrityQuery,
  useProjectsReserveMutation,
  useProjectsHoldersQuery,
  useLazyProjectsHoldersQuery,
  useProjectsRefundsQuery,
  useLazyProjectsRefundsQuery,
  useProjectsRecordRefundMutation,
  useReservationsListQuery,
  useLazyReservationsListQuery,
  useReservationsFindOneQuery,
  useLazyReservationsFindOneQuery,
  useReservationsConfirmMutation,
  useReservationsCancelMutation,
  useInvestmentsMineQuery,
  useLazyInvestmentsMineQuery,
} = injectedRtkApi;
