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
      authRequestEmailCode: build.mutation<
        AuthRequestEmailCodeApiResponse,
        AuthRequestEmailCodeApiArg
      >({
        query: (queryArg) => ({
          url: `/api/auth/me/email/code`,
          method: 'POST',
          body: queryArg.emailCodeRequestDto,
        }),
        invalidatesTags: ['Auth'],
      }),
      authConfirmEmail: build.mutation<
        AuthConfirmEmailApiResponse,
        AuthConfirmEmailApiArg
      >({
        query: (queryArg) => ({
          url: `/api/auth/me/email`,
          method: 'POST',
          body: queryArg.confirmEmailDto,
        }),
        invalidatesTags: ['Auth'],
      }),
      authRemoveEmail: build.mutation<
        AuthRemoveEmailApiResponse,
        AuthRemoveEmailApiArg
      >({
        query: () => ({ url: `/api/auth/me/email`, method: 'DELETE' }),
        invalidatesTags: ['Auth'],
      }),
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
      signUpRequestCode: build.mutation<
        SignUpRequestCodeApiResponse,
        SignUpRequestCodeApiArg
      >({
        query: (queryArg) => ({
          url: `/api/auth/sign-up/code`,
          method: 'POST',
          body: queryArg.signUpCodeRequestDto,
        }),
        invalidatesTags: ['Auth'],
      }),
      signUpCreate: build.mutation<SignUpCreateApiResponse, SignUpCreateApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/auth/sign-up`,
            method: 'POST',
            body: queryArg.signUpDto,
          }),
          invalidatesTags: ['Auth'],
        },
      ),
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
export type AuthRequestEmailCodeApiResponse =
  /** status 200 Emails a 6-digit code to the address, to confirm it */ {
    data: CodeSentDto;
  };
export type AuthRequestEmailCodeApiArg = {
  emailCodeRequestDto: EmailCodeRequestDto;
};
export type AuthConfirmEmailApiResponse =
  /** status 200 Saves the address with its code; it signs in from then on */ {
    data: MeResponseDto;
  };
export type AuthConfirmEmailApiArg = {
  confirmEmailDto: ConfirmEmailDto;
};
export type AuthRemoveEmailApiResponse = /** status 200  */ {
  data: MeResponseDto;
};
export type AuthRemoveEmailApiArg = void;
export type AuthRequestResetApiResponse =
  /** status 200 Sends a 6-digit code by SMS if the number is registered; the answer is the same either way */ {
    data: CodeSentDto;
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
export type SignUpRequestCodeApiResponse =
  /** status 200 Texts a 6-digit code to the number, unless it is registered */ {
    data: CodeSentDto;
  };
export type SignUpRequestCodeApiArg = {
  signUpCodeRequestDto: SignUpCodeRequestDto;
};
export type SignUpCreateApiResponse =
  /** status 201 Registers and verifies them on the ledger, and signs them in */ {
    data: TokenResponseDto;
  };
export type SignUpCreateApiArg = {
  signUpDto: SignUpDto;
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
    | 'auditor'
    | 'seller';
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
  phone?: string;
  /** A confirmed email address, instead of the number */
  email?: string;
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
    | 'auditor'
    | 'seller';
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
  /** Confirmed email address; it signs in like the number */
  email?: string | null;
};
export type UpdateMeDto = {
  language: Language;
};
export type CodeSentDto = {
  /** Before another code may be asked for */
  resendAfterSeconds: number;
  /** How long the code is good for */
  expiresInSeconds: number;
};
export type EmailCodeRequestDto = {
  email: string;
};
export type ConfirmEmailDto = {
  email: string;
  /** The 6 digits from the email */
  code: string;
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
    | 'auditor'
    | 'seller';
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
    | 'auditor'
    | 'seller';
};
export type SignUpCodeRequestDto = {
  phone: string;
  /** The language of the SMS */
  language?: Language;
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
export type SignUpDto = {
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
  role: 'investor' | 'buyer' | 'seller';
  /** The 6 digits from the SMS */
  phoneCode: string;
  password: string;
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
  useAuthRequestEmailCodeMutation,
  useAuthConfirmEmailMutation,
  useAuthRemoveEmailMutation,
  useAuthRequestResetMutation,
  useAuthVerifyResetMutation,
  useAuthCompleteResetMutation,
  useAuthDemoAccountsQuery,
  useLazyAuthDemoAccountsQuery,
  useAuthDemoLoginMutation,
  useSignUpRequestCodeMutation,
  useSignUpCreateMutation,
} = injectedRtkApi;
