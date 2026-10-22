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
            manageable: queryArg.manageable,
            q: queryArg.q,
          },
        }),
        providesTags: ['Participants'],
      }),
      participantsCheck: build.mutation<
        ParticipantsCheckApiResponse,
        ParticipantsCheckApiArg
      >({
        query: (queryArg) => ({
          url: `/api/participants/check`,
          method: 'POST',
          body: queryArg.registerParticipantDto,
        }),
        invalidatesTags: ['Participants'],
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
      participantsOpenWork: build.query<
        ParticipantsOpenWorkApiResponse,
        ParticipantsOpenWorkApiArg
      >({
        query: (queryArg) => ({
          url: `/api/participants/${queryArg.id}/open-work`,
        }),
        providesTags: ['Participants'],
      }),
      participantsRevoke: build.mutation<
        ParticipantsRevokeApiResponse,
        ParticipantsRevokeApiArg
      >({
        query: (queryArg) => ({
          url: `/api/participants/${queryArg.id}/revoke`,
          method: 'POST',
          body: queryArg.revokeAccessDto,
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
      detailChangesMine: build.query<
        DetailChangesMineApiResponse,
        DetailChangesMineApiArg
      >({
        query: () => ({ url: `/api/me/details` }),
        providesTags: ['Participants'],
      }),
      detailChangesPhoneCode: build.mutation<
        DetailChangesPhoneCodeApiResponse,
        DetailChangesPhoneCodeApiArg
      >({
        query: (queryArg) => ({
          url: `/api/me/details/phone-code`,
          method: 'POST',
          body: queryArg.phoneCodeRequestDto,
        }),
        invalidatesTags: ['Participants'],
      }),
      detailChangesSubmit: build.mutation<
        DetailChangesSubmitApiResponse,
        DetailChangesSubmitApiArg
      >({
        query: (queryArg) => ({
          url: `/api/me/details/change`,
          method: 'POST',
          body: queryArg.detailChangeRequestDto,
        }),
        invalidatesTags: ['Participants'],
      }),
      detailChangesWithdraw: build.mutation<
        DetailChangesWithdrawApiResponse,
        DetailChangesWithdrawApiArg
      >({
        query: () => ({ url: `/api/me/details/change`, method: 'DELETE' }),
        invalidatesTags: ['Participants'],
      }),
      detailChangesList: build.query<
        DetailChangesListApiResponse,
        DetailChangesListApiArg
      >({
        query: (queryArg) => ({
          url: `/api/detail-changes`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            status: queryArg.status,
            q: queryArg.q,
          },
        }),
        providesTags: ['Participants'],
      }),
      detailChangesReview: build.query<
        DetailChangesReviewApiResponse,
        DetailChangesReviewApiArg
      >({
        query: (queryArg) => ({ url: `/api/detail-changes/${queryArg.id}` }),
        providesTags: ['Participants'],
      }),
      detailChangesApprove: build.mutation<
        DetailChangesApproveApiResponse,
        DetailChangesApproveApiArg
      >({
        query: (queryArg) => ({
          url: `/api/detail-changes/${queryArg.id}/approve`,
          method: 'POST',
          body: queryArg.approveDetailChangeDto,
        }),
        invalidatesTags: ['Participants'],
      }),
      detailChangesReject: build.mutation<
        DetailChangesRejectApiResponse,
        DetailChangesRejectApiArg
      >({
        query: (queryArg) => ({
          url: `/api/detail-changes/${queryArg.id}/reject`,
          method: 'POST',
          body: queryArg.rejectDetailChangeDto,
        }),
        invalidatesTags: ['Participants'],
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
    | 'auditor'
    | 'seller';
  status?: 'pending' | 'verified' | 'rejected';
  chainState?: 'submitted' | 'confirmed';
  district?: District;
  /** Exact phone number match */
  phone?: string;
  /** Exact NID match (13- and 17-digit forms are equivalent) */
  nid?: string;
  /** Only people the caller manages: staff for the super admin, everyone else for an admin */
  manageable?: boolean;
  /** A mobile number, an NID, or whole words of a name (every word must be in it) */
  q?: string;
};
export type ParticipantsCheckApiResponse =
  /** status 200 The ID check and duplicate checks of a registration, nothing saved: what the registrar confirms before registering */ {
    data: RegistrationCheckDto;
  };
export type ParticipantsCheckApiArg = {
  registerParticipantDto: RegisterParticipantDto;
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
export type ParticipantsOpenWorkApiResponse =
  /** status 200 What they still have open, to see before revoking access */ {
    data: OpenWorkDto;
  };
export type ParticipantsOpenWorkApiArg = {
  id: string;
};
export type ParticipantsRevokeApiResponse =
  /** status 200 A verified person loses their role on the ledger and is signed out; their records stay. Verify restores access. */ {
    data: ParticipantDetailDto;
  };
export type ParticipantsRevokeApiArg = {
  id: string;
  revokeAccessDto: RevokeAccessDto;
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
export type DetailChangesMineApiResponse = /** status 200  */ {
  data: MyDetailsDto;
};
export type DetailChangesMineApiArg = void;
export type DetailChangesPhoneCodeApiResponse =
  /** status 200 Texts a 6-digit code to the new number */ {
    data: CodeSentDto;
  };
export type DetailChangesPhoneCodeApiArg = {
  phoneCodeRequestDto: PhoneCodeRequestDto;
};
export type DetailChangesSubmitApiResponse =
  /** status 200 Asks for the details to be as given; an admin approves (the super admin for staff). The super admin’s apply at once. */ {
    data: MyDetailsDto;
  };
export type DetailChangesSubmitApiArg = {
  detailChangeRequestDto: DetailChangeRequestDto;
};
export type DetailChangesWithdrawApiResponse =
  /** status 200 Takes back a change still waiting */ {
    data: MyDetailsDto;
  };
export type DetailChangesWithdrawApiArg = void;
export type DetailChangesListApiResponse = /** status 200 Oldest first */ {
  data: DetailChangeSummaryDto[];
  meta: PageMetaDto;
};
export type DetailChangesListApiArg = {
  page?: number;
  limit?: number;
  status?: DetailChangeStatus;
  /** Whose: a mobile number, an NID, or whole words of their name */
  q?: string;
};
export type DetailChangesReviewApiResponse = /** status 200  */ {
  data: DetailChangeReviewDto;
};
export type DetailChangesReviewApiArg = {
  id: string;
};
export type DetailChangesApproveApiResponse = /** status 200  */ {
  data: DetailChangeReviewDto;
};
export type DetailChangesApproveApiArg = {
  id: string;
  approveDetailChangeDto: ApproveDetailChangeDto;
};
export type DetailChangesRejectApiResponse = /** status 200  */ {
  data: DetailChangeReviewDto;
};
export type DetailChangesRejectApiArg = {
  id: string;
  rejectDetailChangeDto: RejectDetailChangeDto;
};
export type PersonNameDto = {
  id: string;
  name: string;
};
export type IdCheckReason =
  | 'NAME_OK'
  | 'NAME_LENGTH'
  | 'NAME_CHARACTERS'
  | 'PHONE_OK'
  | 'PHONE_FORMAT'
  | 'DATE_OF_BIRTH_INVALID'
  | 'DATE_OF_BIRTH_FUTURE'
  | 'AGE_OK'
  | 'AGE_UNDER'
  | 'AGE_OVER'
  | 'DISTRICT_OK'
  | 'DISTRICT_UNKNOWN'
  | 'ADDRESS_OK'
  | 'ADDRESS_LENGTH'
  | 'ADDRESS_CONTROL'
  | 'NID_OK'
  | 'NID_DIGITS'
  | 'NID_LENGTH'
  | 'NID_PLACEHOLDER'
  | 'NID_BIRTH_YEAR_OK'
  | 'NID_BIRTH_YEAR_UNCHECKED'
  | 'NID_BIRTH_YEAR_MISMATCH'
  | 'NID_DISTRICT_OK'
  | 'NID_DISTRICT_UNKNOWN'
  | 'NID_DISTRICT_DIFFERENT';
export type IdCheckItemDto = {
  /** The rule */
  code: string;
  result: 'pass' | 'warn' | 'fail';
  /** Why: worded in the app with `params`. Absent on checks saved before reasons were recorded. */
  reason?: IdCheckReason;
  /** The English wording */
  message: string;
  params?: {
    [key: string]: string | number;
  };
};
export type IdCheckDto = {
  version: number;
  outcome: 'passed' | 'flagged';
  checks: IdCheckItemDto[];
};
export type RevocationReason =
  | 'resigned'
  | 'dismissed'
  | 'contract_ended'
  | 'left_platform'
  | 'terms_breach'
  | 'other';
export type RevocationDto = {
  reason: RevocationReason;
  note?: string | null;
  at: string;
  by?: PersonNameDto | null;
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
    | 'auditor'
    | 'seller';
  status: 'pending' | 'verified' | 'rejected';
  chainState: 'submitted' | 'confirmed' | 'operator';
  fullName: string;
  phone: string;
  district?: string | null;
  fieldOfficerId?: string | null;
  idCheckOutcome?: ('passed' | 'flagged') | null;
  /** Rejected after being verified (left, dismissed...), rather than turned down at registration */
  accessRevoked: boolean;
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
  registeredBy?: PersonNameDto | null;
  /** Signed up themselves (an investor or buyer), rather than registered by staff */
  selfRegistered: boolean;
  /** A farmer’s field officer */
  fieldOfficer?: PersonNameDto | null;
  /** Their confirmed email address (masked for auditors) */
  email?: string | null;
  registrationTx?: string | null;
  idCheck?: IdCheckDto | null;
  /** Why and when their access was revoked (while it is) */
  revocation?: RevocationDto | null;
};
export type RegisteredParticipantDto = {
  participant: ParticipantDetailDto;
  /** Shown once, never stored in readable form. Also sent to them by SMS; they must change it at first sign-in. */
  temporaryPassword: string;
  /** Whether the SMS with the temporary password went out; if not, hand it over in person */
  smsSent: boolean;
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
export type Language = 'en' | 'bn';
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
    | 'auditor'
    | 'seller';
  fullName: string;
  phone: string;
  /** 10-digit smart card NID, or the old 13- or 17-digit NID */
  nid: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  district: District;
  address: string;
  /** The language WeGro writes to them in (SMS, the app); English if not given */
  language?: Language;
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
    | 'auditor'
    | 'seller';
  status: 'pending' | 'verified' | 'rejected';
  chainState: 'submitted' | 'confirmed' | 'operator';
  fullName: string;
  phone: string;
  district?: string | null;
  fieldOfficerId?: string | null;
  idCheckOutcome?: ('passed' | 'flagged') | null;
  /** Rejected after being verified (left, dismissed...), rather than turned down at registration */
  accessRevoked: boolean;
  createdAt: string;
};
export type PageMetaDto = {
  page: number;
  limit: number;
  /** Matching items on all pages */
  total: number;
  totalPages: number;
};
export type RegistrationCheckDto = {
  /** failed: cannot be registered as given; flagged: can, an admin acknowledges the warnings when verifying */
  outcome: 'passed' | 'flagged' | 'failed';
  checks: IdCheckItemDto[];
  /** Someone is already registered with this number */
  phoneTaken: boolean;
  /** Someone is already registered with this NID */
  nidTaken: boolean;
};
export type VerifyParticipantDto = {
  /** Required when the ID check flagged something: confirms the admin has reviewed the flags */
  acknowledgeFlags?: boolean;
};
export type RejectParticipantDto = {
  /** Kept off-chain */
  reason: string;
};
export type OpenWorkKind =
  | 'farmers_assigned'
  | 'claims_open'
  | 'vouchers_proposed'
  | 'rounds_prepared'
  | 'bank_details_entered'
  | 'draft_projects'
  | 'projects_running'
  | 'holdings_running'
  | 'offers_open'
  | 'vouchers_to_fill'
  | 'bank_assigned'
  | 'site_assigned';
export type OpenWorkItemDto = {
  kind: OpenWorkKind;
  count: number;
};
export type OpenWorkDto = {
  /** What they still have open; empty when nothing is */
  items: OpenWorkItemDto[];
  /** A field officer’s farmers, who must move to another officer in the same step */
  farmersToMove: number;
};
export type RevokeAccessDto = {
  reason: RevocationReason;
  /** Required when the reason is other. Kept off-chain */
  note?: string;
  /** A field officer who still looks after farmers: the verified field officer they all move to */
  replacementOfficerId?: string;
};
export type AssignFieldOfficerDto = {
  officerId: string;
};
export type TemporaryPasswordDto = {
  /** Shown once, and sent to them by SMS. All existing sessions of the person were ended. */
  temporaryPassword: string;
  /** Whether the SMS went out */
  smsSent: boolean;
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
        | 'seller'
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
export type OwnDetailsDto = {
  fullName: string;
  phone: string;
  nid?: string | null;
  dateOfBirth?: string | null;
  district?: string | null;
  address?: string | null;
};
export type DetailChangeStatus =
  'pending' | 'approved' | 'rejected' | 'withdrawn';
export type DetailField =
  'fullName' | 'phone' | 'nid' | 'dateOfBirth' | 'district' | 'address';
export type DetailChangeDto = {
  id: string;
  status: DetailChangeStatus;
  requested: OwnDetailsDto;
  changedFields: DetailField[];
  idCheck?: IdCheckDto | null;
  createdAt: string;
  decidedAt?: string | null;
  /** Why it was rejected */
  reason?: string | null;
};
export type MyDetailsDto = {
  current: OwnDetailsDto;
  /** The latest change asked for: waiting, or how it was decided */
  change?: DetailChangeDto | null;
  /** False for the super admin, whose changes apply at once */
  needsApproval: boolean;
};
export type CodeSentDto = {
  /** Before another code may be asked for */
  resendAfterSeconds: number;
  /** How long the code is good for */
  expiresInSeconds: number;
};
export type PhoneCodeRequestDto = {
  /** The new number */
  phone: string;
};
export type DetailChangeRequestDto = {
  fullName: string;
  phone: string;
  /** Not for the super admin */
  nid?: string;
  dateOfBirth?: string;
  district?: District;
  address?: string;
  /** The code sent to a new number (POST me/details/phone-code) */
  phoneCode?: string;
};
export type DetailChangeSummaryDto = {
  id: string;
  /** Whose details (current name) */
  participant: PersonNameDto;
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
    | 'auditor'
    | 'seller';
  status: DetailChangeStatus;
  changedFields: DetailField[];
  /** The ID check on the requested details */
  idCheckOutcome?: ('passed' | 'flagged' | 'failed') | null;
  createdAt: string;
};
export type DetailChangeReviewDto = {
  id: string;
  /** Whose details (current name) */
  participant: PersonNameDto;
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
    | 'auditor'
    | 'seller';
  status: DetailChangeStatus;
  changedFields: DetailField[];
  /** The ID check on the requested details */
  idCheckOutcome?: ('passed' | 'flagged' | 'failed') | null;
  createdAt: string;
  current: OwnDetailsDto;
  requested: OwnDetailsDto;
  idCheck?: IdCheckDto | null;
  decidedBy?: PersonNameDto | null;
  decidedAt?: string | null;
  reason?: string | null;
};
export type ApproveDetailChangeDto = {
  /** Required when the ID check flagged something: confirms the flags were reviewed */
  acknowledgeFlags?: boolean;
};
export type RejectDetailChangeDto = {
  reason: string;
};
export const {
  useParticipantsRegisterMutation,
  useParticipantsListQuery,
  useLazyParticipantsListQuery,
  useParticipantsCheckMutation,
  useParticipantsFindOneQuery,
  useLazyParticipantsFindOneQuery,
  useParticipantsVerifyMutation,
  useParticipantsRejectMutation,
  useParticipantsOpenWorkQuery,
  useLazyParticipantsOpenWorkQuery,
  useParticipantsRevokeMutation,
  useParticipantsAssignFieldOfficerMutation,
  useParticipantsReplaceKeyMutation,
  useParticipantsResetPasswordMutation,
  useParticipantsSyncMutation,
  useParticipantsIntegrityQuery,
  useLazyParticipantsIntegrityQuery,
  useDetailChangesMineQuery,
  useLazyDetailChangesMineQuery,
  useDetailChangesPhoneCodeMutation,
  useDetailChangesSubmitMutation,
  useDetailChangesWithdrawMutation,
  useDetailChangesListQuery,
  useLazyDetailChangesListQuery,
  useDetailChangesReviewQuery,
  useLazyDetailChangesReviewQuery,
  useDetailChangesApproveMutation,
  useDetailChangesRejectMutation,
} = injectedRtkApi;
