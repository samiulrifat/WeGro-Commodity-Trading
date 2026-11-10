import {
  type ClaimProofsSubmitApiArg,
  type ClaimProofsSubmitApiResponse,
  insuranceApi,
} from '@/api/generated/insurance';

/** What the generated insurance endpoints need besides: a claim's payment proof sent as multipart. */
const proofs = insuranceApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    claimProofsSubmit: build.mutation<
      ClaimProofsSubmitApiResponse,
      ClaimProofsSubmitApiArg
    >({
      query: ({ id, body }) => {
        const form = new FormData();
        form.append('amount', body.amount);
        form.append('transferredOn', body.transferredOn);
        form.append('method', body.method);
        if (body.routingNumber !== undefined) {
          form.append('routingNumber', body.routingNumber);
        }
        if (body.reference) form.append('reference', body.reference);
        if (body.note) form.append('note', body.note);
        for (const file of body.files) form.append('files', file);
        return {
          url: `/api/insurance/claims/${id}/proofs`,
          method: 'POST',
          body: form,
        };
      },
      invalidatesTags: ['Insurance'],
    }),
  }),
});

export const { useClaimProofsSubmitMutation } = proofs;
