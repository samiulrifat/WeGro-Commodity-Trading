import { baseApi as api } from '../base-api';
export const addTagTypes = ['Bank list'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      bankListStatus: build.query<
        BankListStatusApiResponse,
        BankListStatusApiArg
      >({
        query: () => ({ url: `/api/bank-list` }),
        providesTags: ['Bank list'],
      }),
      bankListBanks: build.query<BankListBanksApiResponse, BankListBanksApiArg>(
        {
          query: () => ({ url: `/api/bank-list/banks` }),
          providesTags: ['Bank list'],
        },
      ),
      bankListDistricts: build.query<
        BankListDistrictsApiResponse,
        BankListDistrictsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/bank-list/banks/${queryArg.bankCode}/districts`,
        }),
        providesTags: ['Bank list'],
      }),
      bankListBranches: build.query<
        BankListBranchesApiResponse,
        BankListBranchesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/bank-list/banks/${queryArg.bankCode}/districts/${queryArg.districtCode}/branches`,
        }),
        providesTags: ['Bank list'],
      }),
      bankListBranch: build.query<
        BankListBranchApiResponse,
        BankListBranchApiArg
      >({
        query: (queryArg) => ({
          url: `/api/bank-list/branches/${queryArg.routingNumber}`,
        }),
        providesTags: ['Bank list'],
      }),
      bankListImport: build.mutation<
        BankListImportApiResponse,
        BankListImportApiArg
      >({
        query: (queryArg) => ({
          url: `/api/bank-list/import`,
          method: 'POST',
          body: queryArg.body,
        }),
        invalidatesTags: ['Bank list'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as bankListApi };
export type BankListStatusApiResponse = /** status 200  */ {
  data: BankListStatusDto;
};
export type BankListStatusApiArg = void;
export type BankListBanksApiResponse = /** status 200 By name */ {
  data: ListedBankDto[];
};
export type BankListBanksApiArg = void;
export type BankListDistrictsApiResponse =
  /** status 200 Where the bank has branches, by name */ {
    data: ListedDistrictDto[];
  };
export type BankListDistrictsApiArg = {
  bankCode: number;
};
export type BankListBranchesApiResponse = /** status 200 By name */ {
  data: ListedBranchDto[];
};
export type BankListBranchesApiArg = {
  bankCode: number;
  districtCode: number;
};
export type BankListBranchApiResponse = /** status 200  */ {
  data: BranchDto;
};
export type BankListBranchApiArg = {
  routingNumber: string;
};
export type BankListImportApiResponse =
  /** status 200 Replaces the whole list. Bank details already entered keep their names. */ {
    data: BankListStatusDto;
  };
export type BankListImportApiArg = {
  body: {
    /** bank_branches.json: banks, each with its branches */
    branches: Blob;
    /** districts.json (optional): checked against the branches */
    districts?: Blob;
  };
};
export type ImporterDto = {
  id: string;
  name: string;
};
export type BankListSource = 'bundled' | 'upload';
export type BankListStatusDto = {
  bankCount: number;
  districtCount: number;
  branchCount: number;
  importedAt?: string | null;
  /** Null for the list that comes with the platform */
  importedBy?: ImporterDto | null;
  source?: BankListSource | null;
};
export type ListedBankDto = {
  /** Clearing code */
  code: number;
  name: string;
};
export type ListedDistrictDto = {
  code: number;
  name: string;
};
export type ListedBranchDto = {
  /** 9 digits */
  routingNumber: string;
  name: string;
};
export type BranchDto = {
  /** 9 digits */
  routingNumber: string;
  name: string;
  /** The branch's number within its bank */
  branchCode: number;
  bank: ListedBankDto;
  district: ListedDistrictDto;
};
export const {
  useBankListStatusQuery,
  useLazyBankListStatusQuery,
  useBankListBanksQuery,
  useLazyBankListBanksQuery,
  useBankListDistrictsQuery,
  useLazyBankListDistrictsQuery,
  useBankListBranchesQuery,
  useLazyBankListBranchesQuery,
  useBankListBranchQuery,
  useLazyBankListBranchQuery,
  useBankListImportMutation,
} = injectedRtkApi;
