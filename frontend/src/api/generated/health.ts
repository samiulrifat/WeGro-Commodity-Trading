import { baseApi as api } from '../base-api';
export const addTagTypes = ['Health'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      healthCheck: build.query<HealthCheckApiResponse, HealthCheckApiArg>({
        query: () => ({ url: `/api/health` }),
        providesTags: ['Health'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as healthApi };
export type HealthCheckApiResponse =
  /** status 200 The API and its database are up. `status` is `degraded` when the blockchain node cannot be reached. */ {
    data: HealthResponseDto;
  };
export type HealthCheckApiArg = void;
export type ChainHealthDto = {
  status: 'up' | 'down';
  chainId: number;
  blockNumber: number | null;
  /** Last block whose events are stored in the database. */
  indexedBlock: number | null;
  /** How many blocks the database is behind the chain. */
  indexerLag: number | null;
};
export type HealthResponseDto = {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  chain: ChainHealthDto;
  uptimeSeconds: number;
};
export const { useHealthCheckQuery, useLazyHealthCheckQuery } = injectedRtkApi;
