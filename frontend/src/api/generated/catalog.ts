import { baseApi as api } from '../base-api';
export const addTagTypes = ['Catalog'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      catalogGet: build.query<CatalogGetApiResponse, CatalogGetApiArg>({
        query: (queryArg) => ({
          url: `/api/catalog`,
          params: {
            includeInactive: queryArg.includeInactive,
          },
        }),
        providesTags: ['Catalog'],
      }),
      catalogCreateUnit: build.mutation<
        CatalogCreateUnitApiResponse,
        CatalogCreateUnitApiArg
      >({
        query: (queryArg) => ({
          url: `/api/catalog/units`,
          method: 'POST',
          body: queryArg.createUnitDto,
        }),
        invalidatesTags: ['Catalog'],
      }),
      catalogUpdateUnit: build.mutation<
        CatalogUpdateUnitApiResponse,
        CatalogUpdateUnitApiArg
      >({
        query: (queryArg) => ({
          url: `/api/catalog/units/${queryArg.code}`,
          method: 'PATCH',
          body: queryArg.updateUnitDto,
        }),
        invalidatesTags: ['Catalog'],
      }),
      catalogCreateProduceType: build.mutation<
        CatalogCreateProduceTypeApiResponse,
        CatalogCreateProduceTypeApiArg
      >({
        query: (queryArg) => ({
          url: `/api/catalog/produce-types`,
          method: 'POST',
          body: queryArg.createProduceTypeDto,
        }),
        invalidatesTags: ['Catalog'],
      }),
      catalogUpdateProduceType: build.mutation<
        CatalogUpdateProduceTypeApiResponse,
        CatalogUpdateProduceTypeApiArg
      >({
        query: (queryArg) => ({
          url: `/api/catalog/produce-types/${queryArg.code}`,
          method: 'PATCH',
          body: queryArg.updateProduceTypeDto,
        }),
        invalidatesTags: ['Catalog'],
      }),
      catalogCreateInputType: build.mutation<
        CatalogCreateInputTypeApiResponse,
        CatalogCreateInputTypeApiArg
      >({
        query: (queryArg) => ({
          url: `/api/catalog/input-types`,
          method: 'POST',
          body: queryArg.createInputTypeDto,
        }),
        invalidatesTags: ['Catalog'],
      }),
      catalogUpdateInputType: build.mutation<
        CatalogUpdateInputTypeApiResponse,
        CatalogUpdateInputTypeApiArg
      >({
        query: (queryArg) => ({
          url: `/api/catalog/input-types/${queryArg.code}`,
          method: 'PATCH',
          body: queryArg.updateInputTypeDto,
        }),
        invalidatesTags: ['Catalog'],
      }),
      catalogCreateFieldRecordType: build.mutation<
        CatalogCreateFieldRecordTypeApiResponse,
        CatalogCreateFieldRecordTypeApiArg
      >({
        query: (queryArg) => ({
          url: `/api/catalog/field-record-types`,
          method: 'POST',
          body: queryArg.createFieldRecordTypeDto,
        }),
        invalidatesTags: ['Catalog'],
      }),
      catalogUpdateFieldRecordType: build.mutation<
        CatalogUpdateFieldRecordTypeApiResponse,
        CatalogUpdateFieldRecordTypeApiArg
      >({
        query: (queryArg) => ({
          url: `/api/catalog/field-record-types/${queryArg.code}`,
          method: 'PATCH',
          body: queryArg.updateFieldRecordTypeDto,
        }),
        invalidatesTags: ['Catalog'],
      }),
      catalogCreateWeatherEventType: build.mutation<
        CatalogCreateWeatherEventTypeApiResponse,
        CatalogCreateWeatherEventTypeApiArg
      >({
        query: (queryArg) => ({
          url: `/api/catalog/weather-event-types`,
          method: 'POST',
          body: queryArg.createWeatherEventTypeDto,
        }),
        invalidatesTags: ['Catalog'],
      }),
      catalogUpdateWeatherEventType: build.mutation<
        CatalogUpdateWeatherEventTypeApiResponse,
        CatalogUpdateWeatherEventTypeApiArg
      >({
        query: (queryArg) => ({
          url: `/api/catalog/weather-event-types/${queryArg.code}`,
          method: 'PATCH',
          body: queryArg.updateWeatherEventTypeDto,
        }),
        invalidatesTags: ['Catalog'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as catalogApi };
export type CatalogGetApiResponse = /** status 200  */ {
  data: CatalogDto;
};
export type CatalogGetApiArg = {
  /** Include deactivated entries */
  includeInactive?: boolean;
};
export type CatalogCreateUnitApiResponse = /** status 201  */ {
  data: UnitDto;
};
export type CatalogCreateUnitApiArg = {
  createUnitDto: CreateUnitDto;
};
export type CatalogUpdateUnitApiResponse = /** status 200  */ {
  data: UnitDto;
};
export type CatalogUpdateUnitApiArg = {
  code: string;
  updateUnitDto: UpdateUnitDto;
};
export type CatalogCreateProduceTypeApiResponse = /** status 201  */ {
  data: ProduceTypeDto;
};
export type CatalogCreateProduceTypeApiArg = {
  createProduceTypeDto: CreateProduceTypeDto;
};
export type CatalogUpdateProduceTypeApiResponse = /** status 200  */ {
  data: ProduceTypeDto;
};
export type CatalogUpdateProduceTypeApiArg = {
  code: string;
  updateProduceTypeDto: UpdateProduceTypeDto;
};
export type CatalogCreateInputTypeApiResponse = /** status 201  */ {
  data: InputTypeDto;
};
export type CatalogCreateInputTypeApiArg = {
  createInputTypeDto: CreateInputTypeDto;
};
export type CatalogUpdateInputTypeApiResponse = /** status 200  */ {
  data: InputTypeDto;
};
export type CatalogUpdateInputTypeApiArg = {
  code: string;
  updateInputTypeDto: UpdateInputTypeDto;
};
export type CatalogCreateFieldRecordTypeApiResponse = /** status 201  */ {
  data: FieldRecordTypeDto;
};
export type CatalogCreateFieldRecordTypeApiArg = {
  createFieldRecordTypeDto: CreateFieldRecordTypeDto;
};
export type CatalogUpdateFieldRecordTypeApiResponse = /** status 200  */ {
  data: FieldRecordTypeDto;
};
export type CatalogUpdateFieldRecordTypeApiArg = {
  code: string;
  updateFieldRecordTypeDto: UpdateFieldRecordTypeDto;
};
export type CatalogCreateWeatherEventTypeApiResponse = /** status 201  */ {
  data: WeatherEventTypeDto;
};
export type CatalogCreateWeatherEventTypeApiArg = {
  createWeatherEventTypeDto: CreateWeatherEventTypeDto;
};
export type CatalogUpdateWeatherEventTypeApiResponse = /** status 200  */ {
  data: WeatherEventTypeDto;
};
export type CatalogUpdateWeatherEventTypeApiArg = {
  code: string;
  updateWeatherEventTypeDto: UpdateWeatherEventTypeDto;
};
export type UnitDto = {
  code: string;
  name: string;
  nameBn: string;
  active: boolean;
  sortOrder: number;
  kind: 'mass' | 'volume' | 'count';
  symbol: string;
  symbolBn: string;
};
export type ProduceTypeDto = {
  code: string;
  name: string;
  nameBn: string;
  active: boolean;
  sortOrder: number;
  category: 'storable_crop' | 'spice' | 'perishable';
  unitCode: string;
  typicalDurationMonths?: number | null;
  description?: string | null;
  descriptionBn?: string | null;
};
export type InputTypeDto = {
  code: string;
  name: string;
  nameBn: string;
  active: boolean;
  sortOrder: number;
  kind: 'seed' | 'fertilizer' | 'pesticide' | 'other';
  unitCode: string;
  produceCode?: string | null;
  description?: string | null;
};
export type MeasurementDto = {
  key: string;
  label: string;
  labelBn: string;
  unit?: string | null;
  min?: number | null;
  max?: number | null;
  /** Decimal places allowed */
  decimals: number;
  required: boolean;
};
export type FieldRecordTypeDto = {
  code: string;
  name: string;
  nameBn: string;
  active: boolean;
  sortOrder: number;
  requiresPhoto: boolean;
  requiresLocation: boolean;
  measurements: MeasurementDto[];
};
export type WeatherEventTypeDto = {
  code: string;
  name: string;
  nameBn: string;
  active: boolean;
  sortOrder: number;
  description?: string | null;
};
export type DistrictDto = {
  code: string;
  name: string;
  division: string;
};
export type CatalogDto = {
  /** Changes whenever any entry changes; also sent as the ETag */
  version: string;
  units: UnitDto[];
  produceTypes: ProduceTypeDto[];
  inputTypes: InputTypeDto[];
  fieldRecordTypes: FieldRecordTypeDto[];
  weatherEventTypes: WeatherEventTypeDto[];
  districts: DistrictDto[];
};
export type CreateUnitDto = {
  /** Written to the ledger; cannot be changed later */
  code: string;
  name: string;
  nameBn: string;
  sortOrder?: number;
  /** Fixed once created */
  kind: 'mass' | 'volume' | 'count';
  symbol: string;
  symbolBn: string;
};
export type UpdateUnitDto = {
  name?: string;
  nameBn?: string;
  sortOrder?: number;
  /** false hides it from dropdowns; it can never be deleted */
  active?: boolean;
  symbol?: string;
  symbolBn?: string;
};
export type CreateProduceTypeDto = {
  /** Written to the ledger; cannot be changed later */
  code: string;
  name: string;
  nameBn: string;
  sortOrder?: number;
  /** Fixed once created */
  category: 'storable_crop' | 'spice' | 'perishable';
  /** Fixed once created */
  unitCode: string;
  typicalDurationMonths?: number;
  description?: string;
  descriptionBn?: string;
};
export type UpdateProduceTypeDto = {
  name?: string;
  nameBn?: string;
  sortOrder?: number;
  /** false hides it from dropdowns; it can never be deleted */
  active?: boolean;
  typicalDurationMonths?: number | null;
  description?: string | null;
  descriptionBn?: string | null;
};
export type CreateInputTypeDto = {
  /** Written to the ledger; cannot be changed later */
  code: string;
  name: string;
  nameBn: string;
  sortOrder?: number;
  /** Fixed once created */
  kind: 'seed' | 'fertilizer' | 'pesticide' | 'other';
  /** Fixed once created */
  unitCode: string;
  /** Crop a seed is for. Fixed once created */
  produceCode?: string;
  description?: string;
};
export type UpdateInputTypeDto = {
  name?: string;
  nameBn?: string;
  sortOrder?: number;
  /** false hides it from dropdowns; it can never be deleted */
  active?: boolean;
  description?: string | null;
};
export type CreateFieldRecordTypeDto = {
  /** Written to the ledger; cannot be changed later */
  code: string;
  name: string;
  nameBn: string;
  sortOrder?: number;
  requiresPhoto?: boolean;
  requiresLocation?: boolean;
  measurements?: MeasurementDto[];
};
export type UpdateFieldRecordTypeDto = {
  name?: string;
  nameBn?: string;
  sortOrder?: number;
  /** false hides it from dropdowns; it can never be deleted */
  active?: boolean;
  requiresPhoto?: boolean;
  requiresLocation?: boolean;
  /** Replaces the whole list */
  measurements?: MeasurementDto[];
};
export type CreateWeatherEventTypeDto = {
  /** Written to the ledger; cannot be changed later */
  code: string;
  name: string;
  nameBn: string;
  sortOrder?: number;
  description?: string;
};
export type UpdateWeatherEventTypeDto = {
  name?: string;
  nameBn?: string;
  sortOrder?: number;
  /** false hides it from dropdowns; it can never be deleted */
  active?: boolean;
  description?: string | null;
};
export const {
  useCatalogGetQuery,
  useLazyCatalogGetQuery,
  useCatalogCreateUnitMutation,
  useCatalogUpdateUnitMutation,
  useCatalogCreateProduceTypeMutation,
  useCatalogUpdateProduceTypeMutation,
  useCatalogCreateInputTypeMutation,
  useCatalogUpdateInputTypeMutation,
  useCatalogCreateFieldRecordTypeMutation,
  useCatalogUpdateFieldRecordTypeMutation,
  useCatalogCreateWeatherEventTypeMutation,
  useCatalogUpdateWeatherEventTypeMutation,
} = injectedRtkApi;
