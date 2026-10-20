import { baseApi as api } from '../base-api';
export const addTagTypes = ['Payment proofs'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      paymentProofsSubmit: build.mutation<
        PaymentProofsSubmitApiResponse,
        PaymentProofsSubmitApiArg
      >({
        query: (queryArg) => ({
          url: `/api/reservations/${queryArg.id}/proofs`,
          method: 'POST',
          body: queryArg.body,
        }),
        invalidatesTags: ['Payment proofs'],
      }),
      paymentProofsForReservation: build.query<
        PaymentProofsForReservationApiResponse,
        PaymentProofsForReservationApiArg
      >({
        query: (queryArg) => ({
          url: `/api/reservations/${queryArg.id}/proofs`,
        }),
        providesTags: ['Payment proofs'],
      }),
      paymentProofsList: build.query<
        PaymentProofsListApiResponse,
        PaymentProofsListApiArg
      >({
        query: (queryArg) => ({
          url: `/api/payment-proofs`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            status: queryArg.status,
            refund: queryArg.refund,
            q: queryArg.q,
          },
        }),
        providesTags: ['Payment proofs'],
      }),
      paymentProofsAccept: build.mutation<
        PaymentProofsAcceptApiResponse,
        PaymentProofsAcceptApiArg
      >({
        query: (queryArg) => ({
          url: `/api/payment-proofs/${queryArg.id}/accept`,
          method: 'POST',
          body: queryArg.acceptProofDto,
        }),
        invalidatesTags: ['Payment proofs'],
      }),
      paymentProofsReject: build.mutation<
        PaymentProofsRejectApiResponse,
        PaymentProofsRejectApiArg
      >({
        query: (queryArg) => ({
          url: `/api/payment-proofs/${queryArg.id}/reject`,
          method: 'POST',
          body: queryArg.rejectProofDto,
        }),
        invalidatesTags: ['Payment proofs'],
      }),
      paymentProofsRefund: build.mutation<
        PaymentProofsRefundApiResponse,
        PaymentProofsRefundApiArg
      >({
        query: (queryArg) => ({
          url: `/api/payment-proofs/${queryArg.id}/refund`,
          method: 'POST',
          body: queryArg.proofRefundDto,
        }),
        invalidatesTags: ['Payment proofs'],
      }),
      paymentProofsFile: build.query<
        PaymentProofsFileApiResponse,
        PaymentProofsFileApiArg
      >({
        query: (queryArg) => ({
          url: `/api/payment-proofs/files/${queryArg.fileId}`,
        }),
        providesTags: ['Payment proofs'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as paymentProofsApi };
export type PaymentProofsSubmitApiResponse =
  /** status 201 Under review; the booking’s clock stops until Accounts decides */ {
    data: PaymentProofDto;
  };
export type PaymentProofsSubmitApiArg = {
  id: number;
  body: {
    /** 1 to 3 photos or PDFs, up to 10 MB each */
    files: Blob[];
    amount: string;
    transferredOn: string;
    method: 'bank_deposit' | 'cash' | 'cheque';
    /** Deposit or cheque */
    bankCode?: number;
    reference?: string;
    note?: string;
  };
};
export type PaymentProofsForReservationApiResponse =
  /** status 200 Newest first */ {
    data: PaymentProofDto[];
  };
export type PaymentProofsForReservationApiArg = {
  id: number;
};
export type PaymentProofsListApiResponse =
  /** status 200 Waiting ones oldest first; others newest first */ {
    data: PaymentProofDto[];
    meta: PageMetaDto;
  };
export type PaymentProofsListApiArg = {
  page?: number;
  limit?: number;
  status?: ProofStatus;
  /** Money accepted for bookings that ended unconfirmed */
  refund?: 'due' | 'refunded';
  /** Whose: a mobile number, an NID, or whole words of their name */
  q?: string;
};
export type PaymentProofsAcceptApiResponse =
  /** status 200 When accepted proofs cover the amount, the booking is confirmed on the ledger */ {
    data: PaymentProofDto;
  };
export type PaymentProofsAcceptApiArg = {
  id: string;
  acceptProofDto: AcceptProofDto;
};
export type PaymentProofsRejectApiResponse = /** status 200  */ {
  data: PaymentProofDto;
};
export type PaymentProofsRejectApiArg = {
  id: string;
  rejectProofDto: RejectProofDto;
};
export type PaymentProofsRefundApiResponse =
  /** status 200 Money accepted for a booking that ended unconfirmed, paid back */ {
    data: PaymentProofDto;
  };
export type PaymentProofsRefundApiArg = {
  id: string;
  proofRefundDto: ProofRefundDto;
};
export type PaymentProofsFileApiResponse = unknown;
export type PaymentProofsFileApiArg = {
  fileId: string;
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
export type PaymentProofDto = {
  id: string;
  reservationId: number;
  projectId: string;
  projectTitle: string;
  investor: PersonRefDto;
  amount: string;
  /** What the booking costs in all */
  reservationAmount: string;
  reservationStatus: 'pending' | 'confirmed' | 'expired' | 'cancelled';
  transferredOn: string;
  method: PaymentMethod;
  bankName?: string | null;
  /** As the investor typed it */
  reference?: string | null;
  note?: string | null;
  files: ProofFileDto[];
  status: ProofStatus;
  submittedAt: string;
  decided: ProofDecisionDto;
  rejectionReason?: string | null;
  /** The statement reference Accounts verified (Accounts, admin and auditor only) */
  verifiedReference?: string | null;
  /** Accepted money for a booking that ended unconfirmed is refunded */
  refund: 'none' | 'due' | 'refunded';
  refundReference?: string | null;
  refundedAt?: string | null;
};
export type PageMetaDto = {
  page: number;
  limit: number;
  /** Matching items on all pages */
  total: number;
  totalPages: number;
};
export type AcceptProofDto = {
  /** The reference on the bank statement; used once */
  paymentReference: string;
};
export type RejectProofDto = {
  /** The investor reads this */
  reason: string;
};
export type ProofRefundDto = {
  /** The reference of the transfer back */
  paymentReference: string;
};
export const {
  usePaymentProofsSubmitMutation,
  usePaymentProofsForReservationQuery,
  useLazyPaymentProofsForReservationQuery,
  usePaymentProofsListQuery,
  useLazyPaymentProofsListQuery,
  usePaymentProofsAcceptMutation,
  usePaymentProofsRejectMutation,
  usePaymentProofsRefundMutation,
  usePaymentProofsFileQuery,
  useLazyPaymentProofsFileQuery,
} = injectedRtkApi;
