import { baseApi as api } from '../base-api';
export const addTagTypes = ['Bank accounts'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      bankAccountsMine: build.query<
        BankAccountsMineApiResponse,
        BankAccountsMineApiArg
      >({
        query: () => ({ url: `/api/me/bank-account` }),
        providesTags: ['Bank accounts'],
      }),
      bankAccountsSubmitMine: build.mutation<
        BankAccountsSubmitMineApiResponse,
        BankAccountsSubmitMineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/me/bank-account`,
          method: 'PUT',
          body: queryArg.bankDetailsDto,
        }),
        invalidatesTags: ['Bank accounts'],
      }),
      bankAccountsPending: build.query<
        BankAccountsPendingApiResponse,
        BankAccountsPendingApiArg
      >({
        query: (queryArg) => ({
          url: `/api/bank-accounts/pending`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
          },
        }),
        providesTags: ['Bank accounts'],
      }),
      bankAccountsForParticipant: build.query<
        BankAccountsForParticipantApiResponse,
        BankAccountsForParticipantApiArg
      >({
        query: (queryArg) => ({
          url: `/api/participants/${queryArg.id}/bank-account`,
        }),
        providesTags: ['Bank accounts'],
      }),
      bankAccountsSubmitFor: build.mutation<
        BankAccountsSubmitForApiResponse,
        BankAccountsSubmitForApiArg
      >({
        query: (queryArg) => ({
          url: `/api/participants/${queryArg.id}/bank-account`,
          method: 'PUT',
          body: queryArg.bankDetailsDto,
        }),
        invalidatesTags: ['Bank accounts'],
      }),
      bankAccountsVerify: build.mutation<
        BankAccountsVerifyApiResponse,
        BankAccountsVerifyApiArg
      >({
        query: (queryArg) => ({
          url: `/api/participants/${queryArg.id}/bank-account/verify`,
          method: 'POST',
        }),
        invalidatesTags: ['Bank accounts'],
      }),
      bankAccountsReject: build.mutation<
        BankAccountsRejectApiResponse,
        BankAccountsRejectApiArg
      >({
        query: (queryArg) => ({
          url: `/api/participants/${queryArg.id}/bank-account/reject`,
          method: 'POST',
          body: queryArg.rejectBankAccountDto,
        }),
        invalidatesTags: ['Bank accounts'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as bankAccountsApi };
export type BankAccountsMineApiResponse = /** status 200  */ {
  data: BankAccountsDto;
};
export type BankAccountsMineApiArg = void;
export type BankAccountsSubmitMineApiResponse =
  /** status 200 Waits for an admin to verify it */ {
    data: BankAccountsDto;
  };
export type BankAccountsSubmitMineApiArg = {
  bankDetailsDto: BankDetailsDto;
};
export type BankAccountsPendingApiResponse =
  /** status 200 Waiting for verification, oldest first */ {
    data: PendingBankAccountDto[];
    meta: PageMetaDto;
  };
export type BankAccountsPendingApiArg = {
  page?: number;
  limit?: number;
};
export type BankAccountsForParticipantApiResponse = /** status 200  */ {
  data: BankAccountsDto;
};
export type BankAccountsForParticipantApiArg = {
  id: string;
};
export type BankAccountsSubmitForApiResponse =
  /** status 200 Entered for the payee; another admin verifies it */ {
    data: BankAccountsDto;
  };
export type BankAccountsSubmitForApiArg = {
  id: string;
  bankDetailsDto: BankDetailsDto;
};
export type BankAccountsVerifyApiResponse =
  /** status 200 By someone other than who entered it */ {
    data: BankAccountsDto;
  };
export type BankAccountsVerifyApiArg = {
  id: string;
};
export type BankAccountsRejectApiResponse = /** status 200  */ {
  data: BankAccountsDto;
};
export type BankAccountsRejectApiArg = {
  id: string;
  rejectBankAccountDto: RejectBankAccountDto;
};
export type BankPartyDto = {
  id: string;
  name: string;
};
export type BankAccountDto = {
  holderName: string;
  bankName: string;
  branchName: string;
  /** 6 to 20 digits */
  accountNumber: string;
  /** 9-digit routing number */
  routingNumber: string;
  id: string;
  status: 'pending' | 'verified' | 'rejected' | 'superseded';
  enteredBy: BankPartyDto;
  enteredAt: string;
  decidedBy?: BankPartyDto | null;
  decidedAt?: string | null;
  rejectionReason?: string | null;
};
export type BankAccountsDto = {
  /** Where payouts go */
  verified?: BankAccountDto | null;
  /** Waiting for an admin */
  pending?: BankAccountDto | null;
  /** Older versions, newest first */
  history: BankAccountDto[];
};
export type BankDetailsDto = {
  holderName: string;
  bankName: string;
  branchName: string;
  /** 6 to 20 digits */
  accountNumber: string;
  /** 9-digit routing number */
  routingNumber: string;
};
export type PendingBankAccountDto = {
  holderName: string;
  bankName: string;
  branchName: string;
  /** 6 to 20 digits */
  accountNumber: string;
  /** 9-digit routing number */
  routingNumber: string;
  id: string;
  status: 'pending' | 'verified' | 'rejected' | 'superseded';
  enteredBy: BankPartyDto;
  enteredAt: string;
  decidedBy?: BankPartyDto | null;
  decidedAt?: string | null;
  rejectionReason?: string | null;
  owner: BankPartyDto;
  ownerRole: 'farmer' | 'investor';
  /** Replaces verified details */
  isChange: boolean;
};
export type PageMetaDto = {
  page: number;
  limit: number;
  /** Matching items on all pages */
  total: number;
  totalPages: number;
};
export type RejectBankAccountDto = {
  reason: string;
};
export const {
  useBankAccountsMineQuery,
  useLazyBankAccountsMineQuery,
  useBankAccountsSubmitMineMutation,
  useBankAccountsPendingQuery,
  useLazyBankAccountsPendingQuery,
  useBankAccountsForParticipantQuery,
  useLazyBankAccountsForParticipantQuery,
  useBankAccountsSubmitForMutation,
  useBankAccountsVerifyMutation,
  useBankAccountsRejectMutation,
} = injectedRtkApi;
