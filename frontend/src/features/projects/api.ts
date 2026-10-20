import {
  type PaymentProofsSubmitApiArg,
  type PaymentProofsSubmitApiResponse,
  paymentProofsApi,
} from '@/api/generated/payment-proofs';
import {
  type ProjectsSetCoverApiArg,
  type ProjectsSetCoverApiResponse,
  projectsApi,
} from '@/api/generated/projects';

/**
 * What the generated project and payment endpoints need besides: the cover
 * photo and the proof sent as multipart, and a decision on a proof also
 * refreshing the booking and project it moves (the "Projects" queries).
 */
const proofs = paymentProofsApi
  .enhanceEndpoints({
    addTagTypes: ['Projects'],
    endpoints: {
      paymentProofsAccept: { invalidatesTags: ['Payment proofs', 'Projects'] },
      paymentProofsReject: { invalidatesTags: ['Payment proofs', 'Projects'] },
      paymentProofsRefund: { invalidatesTags: ['Payment proofs', 'Projects'] },
    },
  })
  .injectEndpoints({
    overrideExisting: true,
    endpoints: (build) => ({
      paymentProofsSubmit: build.mutation<
        PaymentProofsSubmitApiResponse,
        PaymentProofsSubmitApiArg
      >({
        query: ({ id, body }) => {
          const form = new FormData();
          form.append('amount', body.amount);
          form.append('transferredOn', body.transferredOn);
          form.append('method', body.method);
          if (body.bankCode !== undefined) {
            form.append('bankCode', String(body.bankCode));
          }
          if (body.reference) form.append('reference', body.reference);
          if (body.note) form.append('note', body.note);
          for (const file of body.files) form.append('files', file);
          return {
            url: `/api/reservations/${id}/proofs`,
            method: 'POST',
            body: form,
          };
        },
        invalidatesTags: ['Payment proofs', 'Projects'],
      }),
    }),
  });

const projects = projectsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    projectsSetCover: build.mutation<
      ProjectsSetCoverApiResponse,
      ProjectsSetCoverApiArg
    >({
      query: ({ id, body }) => {
        const form = new FormData();
        if (body.file) form.append('file', body.file);
        return { url: `/api/projects/${id}/cover`, method: 'POST', body: form };
      },
      invalidatesTags: ['Projects'],
    }),
  }),
});

export const {
  usePaymentProofsSubmitMutation,
  usePaymentProofsAcceptMutation,
  usePaymentProofsRejectMutation,
  usePaymentProofsRefundMutation,
} = proofs;
export const { useProjectsSetCoverMutation } = projects;
