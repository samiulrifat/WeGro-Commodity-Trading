import { baseApi as api } from '../base-api';
export const addTagTypes = ['Participants'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      participantsRegister: build.mutation<
        ParticipantsRegisterApiResponse,
        ParticipantsRegisterApiArg
      >({
        query: (queryArg) => ({
          url: `/api/participants`,
          method: 'POST',
          body: queryArg.registerParticipantDto,
        }),
        invalidatesTags: ['Participants'],
      }),
      participantsList: build.query<
        ParticipantsListApiResponse,
        ParticipantsListApiArg
      >({
        query: (queryArg) => ({
          url: `/api/participants`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            role: queryArg.role,
            status: queryArg.status,
            chainState: queryArg.chainState,
            district: queryArg.district,
            phone: queryArg.phone,
            nid: queryArg.nid,
          },
        }),
        providesTags: ['Participants'],
      }),
      participantsFindOne: build.query<
        ParticipantsFindOneApiResponse,
        ParticipantsFindOneApiArg
      >({
        query: (queryArg) => ({ url: `/api/participants/${queryArg.id}` }),
        providesTags: ['Participants'],
      }),
      participantsVerify: build.mutation<
        ParticipantsVerifyApiResponse,
        ParticipantsVerifyApiArg
      >({
        query: (queryArg) => ({
          url: `/api/participants/${queryArg.id}/verify`,
          method: 'POST',
          body: queryArg.verifyParticipantDto,
        }),
        invalidatesTags: ['Participants'],
      }),
      participantsReject: build.mutation<
        ParticipantsRejectApiResponse,
        ParticipantsRejectApiArg
      >({
        query: (queryArg) => ({
          url: `/api/participants/${queryArg.id}/reject`,
          method: 'POST',
          body: queryArg.rejectParticipantDto,
        }),
        invalidatesTags: ['Participants'],
      }),
      participantsAssignFieldOfficer: build.mutation<
        ParticipantsAssignFieldOfficerApiResponse,
        ParticipantsAssignFieldOfficerApiArg
      >({
        query: (queryArg) => ({
          url: `/api/participants/${queryArg.id}/field-officer`,
          method: 'PUT',
          body: queryArg.assignFieldOfficerDto,
        }),
        invalidatesTags: ['Participants'],
      }),
      participantsReplaceKey: build.mutation<
        ParticipantsReplaceKeyApiResponse,
        ParticipantsReplaceKeyApiArg
      >({
        query: (queryArg) => ({
          url: `/api/participants/${queryArg.id}/replace-key`,
          method: 'POST',
        }),
        invalidatesTags: ['Participants'],
      }),
      participantsResetPassword: build.mutation<
        ParticipantsResetPasswordApiResponse,
        ParticipantsResetPasswordApiArg
      >({
        query: (queryArg) => ({
          url: `/api/participants/${queryArg.id}/reset-password`,
          method: 'POST',
        }),
        invalidatesTags: ['Participants'],
      }),
      participantsSync: build.mutation<
        ParticipantsSyncApiResponse,
        ParticipantsSyncApiArg
      >({
        query: (queryArg) => ({
          url: `/api/participants/${queryArg.id}/sync`,
          method: 'POST',
        }),
        invalidatesTags: ['Participants'],
      }),
      participantsIntegrity: build.query<
        ParticipantsIntegrityApiResponse,
        ParticipantsIntegrityApiArg
      >({
        query: (queryArg) => ({
          url: `/api/participants/${queryArg.id}/integrity`,
        }),
        providesTags: ['Participants'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as participantsApi };
export type ParticipantsRegisterApiResponse = /** status 201  */ {
  data: RegisteredParticipantDto;
};
export type ParticipantsRegisterApiArg = {
  registerParticipantDto: RegisterParticipantDto;
};
export type ParticipantsListApiResponse = /** status 200  */ {
  data: ParticipantSummaryDto[];
  meta: PageMetaDto;
};
export type ParticipantsListApiArg = {
  page?: number;
  limit?: number;
  role?:
    | 'investor'
    | 'farmer'
    | 'field_officer'
    | 'admin'
    | 'accounts'
    | 'operations'
    | 'warehouse'
    | 'bank'
    | 'supplier'
    | 'buyer'
    | 'insurer'
    | 'auditor';
  status?: 'pending' | 'verified' | 'rejected';
  chainState?: 'submitted' | 'confirmed';
  district?:
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
  /** Exact phone number match */
  phone?: string;
  /** Exact NID match (13- and 17-digit forms are equivalent) */
  nid?: string;
};
export type ParticipantsFindOneApiResponse = /** status 200  */ {
  data: ParticipantDetailDto;
};
export type ParticipantsFindOneApiArg = {
  id: string;
};
export type ParticipantsVerifyApiResponse = /** status 200  */ {
  data: ParticipantDetailDto;
};
export type ParticipantsVerifyApiArg = {
  id: string;
  verifyParticipantDto: VerifyParticipantDto;
};
export type ParticipantsRejectApiResponse = /** status 200  */ {
  data: ParticipantDetailDto;
};
export type ParticipantsRejectApiArg = {
  id: string;
  rejectParticipantDto: RejectParticipantDto;
};
export type ParticipantsAssignFieldOfficerApiResponse = /** status 200  */ {
  data: ParticipantDetailDto;
};
export type ParticipantsAssignFieldOfficerApiArg = {
  id: string;
  assignFieldOfficerDto: AssignFieldOfficerDto;
};
export type ParticipantsReplaceKeyApiResponse = /** status 200  */ {
  data: ParticipantDetailDto;
};
export type ParticipantsReplaceKeyApiArg = {
  id: string;
};
export type ParticipantsResetPasswordApiResponse = /** status 200  */ {
  data: TemporaryPasswordDto;
};
export type ParticipantsResetPasswordApiArg = {
  id: string;
};
export type ParticipantsSyncApiResponse = /** status 200  */ {
  data: ParticipantDetailDto;
};
export type ParticipantsSyncApiArg = {
  id: string;
};
export type ParticipantsIntegrityApiResponse = /** status 200  */ {
  data: IntegrityReportDto;
};
export type ParticipantsIntegrityApiArg = {
  id: string;
};
export type IdCheckItemDto = {
  code: string;
  result: 'pass' | 'warn' | 'fail';
  message: string;
};
export type IdCheckDto = {
  version: number;
  outcome: 'passed' | 'flagged';
  checks: IdCheckItemDto[];
};
export type ParticipantDetailDto = {
  id: string;
  role:
    | 'super_admin'
    | 'investor'
    | 'farmer'
    | 'field_officer'
    | 'admin'
    | 'accounts'
    | 'operations'
    | 'warehouse'
    | 'bank'
    | 'supplier'
    | 'buyer'
    | 'insurer'
    | 'auditor';
  status: 'pending' | 'verified' | 'rejected';
  chainState: 'submitted' | 'confirmed' | 'operator';
  fullName: string;
  phone: string;
  district?: string | null;
  fieldOfficerId?: string | null;
  idCheckOutcome?: ('passed' | 'flagged') | null;
  createdAt: string;
  nid?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  /** True when personal fields are masked for your role */
  masked: boolean;
  /** On-chain address of their signing key */
  account: string;
  statusReason?: string | null;
  statusChangedAt?: string | null;
  registeredById?: string | null;
  registrationTx?: string | null;
  idCheck?: IdCheckDto | null;
};
export type RegisteredParticipantDto = {
  participant: ParticipantDetailDto;
  /** Shown once, never stored in readable form. Hand it to the person; they must change it at first sign-in. */
  temporaryPassword: string;
};
export type RegisterParticipantDto = {
  role:
    | 'investor'
    | 'farmer'
    | 'field_officer'
    | 'admin'
    | 'accounts'
    | 'operations'
    | 'warehouse'
    | 'bank'
    | 'supplier'
    | 'buyer'
    | 'insurer'
    | 'auditor';
  fullName: string;
  phone: string;
  /** 10-digit smart card NID, or the old 13- or 17-digit NID */
  nid: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  district:
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
  address: string;
};
export type ParticipantSummaryDto = {
  id: string;
  role:
    | 'super_admin'
    | 'investor'
    | 'farmer'
    | 'field_officer'
    | 'admin'
    | 'accounts'
    | 'operations'
    | 'warehouse'
    | 'bank'
    | 'supplier'
    | 'buyer'
    | 'insurer'
    | 'auditor';
  status: 'pending' | 'verified' | 'rejected';
  chainState: 'submitted' | 'confirmed' | 'operator';
  fullName: string;
  phone: string;
  district?: string | null;
  fieldOfficerId?: string | null;
  idCheckOutcome?: ('passed' | 'flagged') | null;
  createdAt: string;
};
export type PageMetaDto = {
  page: number;
  limit: number;
  /** Matching items on all pages */
  total: number;
  totalPages: number;
};
export type VerifyParticipantDto = {
  /** Required when the ID check flagged something: confirms the admin has reviewed the flags */
  acknowledgeFlags?: boolean;
};
export type RejectParticipantDto = {
  /** Kept off-chain */
  reason: string;
};
export type AssignFieldOfficerDto = {
  officerId: string;
};
export type TemporaryPasswordDto = {
  /** Shown once. All existing sessions of the person were ended. */
  temporaryPassword: string;
};
export type LedgerParticipantDto = {
  status: 'none' | 'pending' | 'verified' | 'rejected';
  role?:
    | (
        | 'super_admin'
        | 'investor'
        | 'farmer'
        | 'field_officer'
        | 'admin'
        | 'accounts'
        | 'operations'
        | 'warehouse'
        | 'bank'
        | 'supplier'
        | 'buyer'
        | 'insurer'
        | 'auditor'
      )
    | null;
  account?: string | null;
  detailsHash?: string | null;
};
export type IntegrityReportDto = {
  /** Stored details, database mirror and ledger all agree */
  matches: boolean;
  /** Fingerprint recomputed from the decrypted details now */
  computedHash: string;
  storedHash?: string | null;
  ledger: LedgerParticipantDto;
  mismatches: string[];
};
export const {
  useParticipantsRegisterMutation,
  useParticipantsListQuery,
  useLazyParticipantsListQuery,
  useParticipantsFindOneQuery,
  useLazyParticipantsFindOneQuery,
  useParticipantsVerifyMutation,
  useParticipantsRejectMutation,
  useParticipantsAssignFieldOfficerMutation,
  useParticipantsReplaceKeyMutation,
  useParticipantsResetPasswordMutation,
  useParticipantsSyncMutation,
  useParticipantsIntegrityQuery,
  useLazyParticipantsIntegrityQuery,
} = injectedRtkApi;
