import {
  type DealProofsSubmitApiArg,
  type DealProofsSubmitApiResponse,
  marketplaceApi,
} from '@/api/generated/marketplace';

/** What the generated marketplace endpoints need besides: a deal's payment proof sent as multipart. */
const proofs = marketplaceApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    dealProofsSubmit: build.mutation<
      DealProofsSubmitApiResponse,
      DealProofsSubmitApiArg
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
          url: `/api/offers/${id}/proofs`,
          method: 'POST',
          body: form,
        };
      },
      invalidatesTags: ['Marketplace'],
    }),
  }),
});

export const { useDealProofsSubmitMutation } = proofs;
