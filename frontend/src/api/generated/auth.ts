import { baseApi as api } from '../base-api';
export const addTagTypes = ['Auth'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      authLogin: build.mutation<AuthLoginApiResponse, AuthLoginApiArg>({
        query: (queryArg) => ({
          url: `/api/auth/login`,
          method: 'POST',
          body: queryArg.loginDto,
        }),
        invalidatesTags: ['Auth'],
      }),
      authRefresh: build.mutation<AuthRefreshApiResponse, AuthRefreshApiArg>({
        query: () => ({ url: `/api/auth/refresh`, method: 'POST' }),
        invalidatesTags: ['Auth'],
      }),
      authLogout: build.mutation<AuthLogoutApiResponse, AuthLogoutApiArg>({
        query: () => ({ url: `/api/auth/logout`, method: 'POST' }),
        invalidatesTags: ['Auth'],
      }),
      authLogoutAll: build.mutation<
        AuthLogoutAllApiResponse,
        AuthLogoutAllApiArg
      >({
        query: () => ({ url: `/api/auth/logout-all`, method: 'POST' }),
        invalidatesTags: ['Auth'],
      }),
      authChangePassword: build.mutation<
        AuthChangePasswordApiResponse,
        AuthChangePasswordApiArg
      >({
        query: (queryArg) => ({
          url: `/api/auth/change-password`,
          method: 'POST',
          body: queryArg.changePasswordDto,
        }),
        invalidatesTags: ['Auth'],
      }),
      authMe: build.query<AuthMeApiResponse, AuthMeApiArg>({
        query: () => ({ url: `/api/auth/me` }),
        providesTags: ['Auth'],
      }),
      authUpdateMe: build.mutation<AuthUpdateMeApiResponse, AuthUpdateMeApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/auth/me`,
            method: 'PATCH',
            body: queryArg.updateMeDto,
          }),
          invalidatesTags: ['Auth'],
        },
      ),
      authRequestReset: build.mutation<
        AuthRequestResetApiResponse,
        AuthRequestResetApiArg
      >({
        query: (queryArg) => ({
          url: `/api/auth/password-reset/request`,
          method: 'POST',
          body: queryArg.passwordResetRequestDto,
        }),
        invalidatesTags: ['Auth'],
      }),
      authVerifyReset: build.mutation<
        AuthVerifyResetApiResponse,
        AuthVerifyResetApiArg
      >({
        query: (queryArg) => ({
          url: `/api/auth/password-reset/verify`,
          method: 'POST',
          body: queryArg.passwordResetVerifyDto,
        }),
        invalidatesTags: ['Auth'],
      }),
      authCompleteReset: build.mutation<
        AuthCompleteResetApiResponse,
        AuthCompleteResetApiArg
      >({
        query: (queryArg) => ({
          url: `/api/auth/password-reset/complete`,
          method: 'POST',
          body: queryArg.passwordResetCompleteDto,
        }),
        invalidatesTags: ['Auth'],
      }),
      authDemoAccounts: build.query<
        AuthDemoAccountsApiResponse,
        AuthDemoAccountsApiArg
      >({
        query: () => ({ url: `/api/auth/demo/accounts` }),
        providesTags: ['Auth'],
      }),
      authDemoLogin: build.mutation<
        AuthDemoLoginApiResponse,
        AuthDemoLoginApiArg
      >({
        query: (queryArg) => ({
          url: `/api/auth/demo/login`,
          method: 'POST',
          body: queryArg.demoLoginDto,
        }),
        invalidatesTags: ['Auth'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as authApi };
export type AuthLoginApiResponse = /** status 200  */ {
  data: TokenResponseDto;
};
export type AuthLoginApiArg = {
  loginDto: LoginDto;
};
export type AuthRefreshApiResponse = /** status 200  */ {
  data: TokenResponseDto;
};
export type AuthRefreshApiArg = void;
export type AuthLogoutApiResponse = unknown;
export type AuthLogoutApiArg = void;
export type AuthLogoutAllApiResponse = unknown;
export type AuthLogoutAllApiArg = void;
export type AuthChangePasswordApiResponse = /** status 200  */ {
  data: TokenResponseDto;
};
export type AuthChangePasswordApiArg = {
  changePasswordDto: ChangePasswordDto;
};
export type AuthMeApiResponse = /** status 200  */ {
  data: MeResponseDto;
};
export type AuthMeApiArg = void;
export type AuthUpdateMeApiResponse = /** status 200  */ {
  data: MeResponseDto;
};
export type AuthUpdateMeApiArg = {
  updateMeDto: UpdateMeDto;
};
export type AuthRequestResetApiResponse =
  /** status 200 Sends a 6-digit code by SMS if the number is registered; the answer is the same either way */ {
    data: PasswordResetRequestedDto;
  };
export type AuthRequestResetApiArg = {
  passwordResetRequestDto: PasswordResetRequestDto;
};
export type AuthVerifyResetApiResponse = /** status 200  */ {
  data: PasswordResetVerifiedDto;
};
export type AuthVerifyResetApiArg = {
  passwordResetVerifyDto: PasswordResetVerifyDto;
};
export type AuthCompleteResetApiResponse =
  /** status 200 Sets the new password, ends every other session and signs in */ {
    data: TokenResponseDto;
  };
export type AuthCompleteResetApiArg = {
  passwordResetCompleteDto: PasswordResetCompleteDto;
};
export type AuthDemoAccountsApiResponse =
  /** status 200 Demo mode only (404 otherwise) */ {
    data: DemoAccountDto[];
  };
export type AuthDemoAccountsApiArg = void;
export type AuthDemoLoginApiResponse =
  /** status 200 Demo mode only (404 otherwise) */ {
    data: TokenResponseDto;
  };
export type AuthDemoLoginApiArg = {
  demoLoginDto: DemoLoginDto;
};
export type Language = 'en' | 'bn';
export type SessionUserDto = {
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
  /** The language the person chose; null until chosen (English) */
  language: Language | null;
};
export type TokenResponseDto = {
  accessToken: string;
  tokenType: string;
  /** Seconds until the access token expires */
  expiresIn: number;
  /** True on a temporary password: only change-password is allowed */
  mustChangePassword: boolean;
  user: SessionUserDto;
};
export type LoginDto = {
  /** Bangladeshi mobile number; 01…, 8801…, +8801… and Bengali digits are accepted */
  phone: string;
  password: string;
};
export type ChangePasswordDto = {
  currentPassword: string;
  newPassword: string;
};
export type MeResponseDto = {
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
  fullName: string;
  phone: string;
  district?: string | null;
  /** On-chain address of your signing key */
  account: string;
  mustChangePassword: boolean;
  isDemo: boolean;
  /** The language the person chose; null until chosen (English) */
  language: Language | null;
};
export type UpdateMeDto = {
  language: Language;
};
export type PasswordResetRequestedDto = {
  /** Before another code may be asked for */
  resendAfterSeconds: number;
  /** How long the code is good for */
  expiresInSeconds: number;
};
export type PasswordResetRequestDto = {
  phone: string;
};
export type PasswordResetVerifiedDto = {
  valid: boolean;
};
export type PasswordResetVerifyDto = {
  phone: string;
  /** The 6 digits from the SMS */
  code: string;
};
export type PasswordResetCompleteDto = {
  phone: string;
  /** The 6 digits from the SMS */
  code: string;
  newPassword: string;
};
export type DemoAccountDto = {
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
  fullName: string;
};
export type DemoLoginDto = {
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
};
export const {
  useAuthLoginMutation,
  useAuthRefreshMutation,
  useAuthLogoutMutation,
  useAuthLogoutAllMutation,
  useAuthChangePasswordMutation,
  useAuthMeQuery,
  useLazyAuthMeQuery,
  useAuthUpdateMeMutation,
  useAuthRequestResetMutation,
  useAuthVerifyResetMutation,
  useAuthCompleteResetMutation,
  useAuthDemoAccountsQuery,
  useLazyAuthDemoAccountsQuery,
  useAuthDemoLoginMutation,
} = injectedRtkApi;
