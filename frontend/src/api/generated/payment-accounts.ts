import { baseApi as api } from '../base-api';
export const addTagTypes = ['Payment accounts'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      paymentAccountsInUse: build.query<
        PaymentAccountsInUseApiResponse,
        PaymentAccountsInUseApiArg
      >({
        query: () => ({ url: `/api/payment-accounts` }),
        providesTags: ['Payment accounts'],
      }),
      paymentAccountsCreate: build.mutation<
        PaymentAccountsCreateApiResponse,
        PaymentAccountsCreateApiArg
      >({
        query: (queryArg) => ({
          url: `/api/payment-accounts`,
          method: 'POST',
          body: queryArg.createPaymentAccountDto,
        }),
        invalidatesTags: ['Payment accounts'],
      }),
      paymentAccountsAll: build.query<
        PaymentAccountsAllApiResponse,
        PaymentAccountsAllApiArg
      >({
        query: () => ({ url: `/api/payment-accounts/all` }),
        providesTags: ['Payment accounts'],
      }),
      paymentAccountsUpdate: build.mutation<
        PaymentAccountsUpdateApiResponse,
        PaymentAccountsUpdateApiArg
      >({
        query: (queryArg) => ({
          url: `/api/payment-accounts/${queryArg.id}`,
          method: 'PATCH',
          body: queryArg.updatePaymentAccountDto,
        }),
        invalidatesTags: ['Payment accounts'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as paymentAccountsApi };
export type PaymentAccountsInUseApiResponse = /** status 200 Those in use */ {
  data: PaymentAccountDto[];
};
export type PaymentAccountsInUseApiArg = void;
export type PaymentAccountsCreateApiResponse = /** status 201  */ {
  data: PaymentAccountDto;
};
export type PaymentAccountsCreateApiArg = {
  createPaymentAccountDto: CreatePaymentAccountDto;
};
export type PaymentAccountsAllApiResponse = /** status 200 Retired ones too */ {
  data: PaymentAccountDto[];
};
export type PaymentAccountsAllApiArg = void;
export type PaymentAccountsUpdateApiResponse = /** status 200  */ {
  data: PaymentAccountDto;
};
export type PaymentAccountsUpdateApiArg = {
  id: string;
  updatePaymentAccountDto: UpdatePaymentAccountDto;
};
export type PaymentAccountDto = {
  id: string;
  bankName: string;
  branchName: string;
  districtName?: string | null;
  routingNumber: string;
  accountName: string;
  accountNumber: string;
  active: boolean;
  sortOrder: number;
  updatedAt: string;
};
export type CreatePaymentAccountDto = {
  /** The branch, by its routing number on the bank list */
  routingNumber: string;
  accountName: string;
  /** 6 to 20 digits */
  accountNumber: string;
  sortOrder?: number;
};
export type UpdatePaymentAccountDto = {
  /** Another branch, by routing number */
  routingNumber?: string;
  accountName?: string;
  accountNumber?: string;
  sortOrder?: number;
  /** false retires it: investors no longer see it */
  active?: boolean;
};
export const {
  usePaymentAccountsInUseQuery,
  useLazyPaymentAccountsInUseQuery,
  usePaymentAccountsCreateMutation,
  usePaymentAccountsAllQuery,
  useLazyPaymentAccountsAllQuery,
  usePaymentAccountsUpdateMutation,
} = injectedRtkApi;
