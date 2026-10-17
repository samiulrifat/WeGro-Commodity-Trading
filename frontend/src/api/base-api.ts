import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { apiFetch } from './http';
import { apiOrigin } from '@/lib/env';

/**
 * The RTK Query API every endpoint is injected into: the generated ones
 * (src/api/generated, one file per backend area) and the few written by
 * hand (src/api/files.ts). Responses are exactly what the backend sends:
 * `{ data }`, or `{ data, meta }` for pages.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: apiOrigin(),
    fetchFn: apiFetch,
  }),
  endpoints: () => ({}),
});
