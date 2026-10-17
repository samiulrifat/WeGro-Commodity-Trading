import { baseApi as api } from '../base-api';
export const addTagTypes = ['Field records'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      fieldRecordsUpload: build.mutation<
        FieldRecordsUploadApiResponse,
        FieldRecordsUploadApiArg
      >({
        query: (queryArg) => ({
          url: `/api/photos`,
          method: 'POST',
          body: queryArg.body,
        }),
        invalidatesTags: ['Field records'],
      }),
      fieldRecordsSync: build.mutation<
        FieldRecordsSyncApiResponse,
        FieldRecordsSyncApiArg
      >({
        query: (queryArg) => ({
          url: `/api/field-records/sync`,
          method: 'POST',
          body: queryArg.syncFieldRecordsDto,
        }),
        invalidatesTags: ['Field records'],
      }),
      fieldRecordsList: build.query<
        FieldRecordsListApiResponse,
        FieldRecordsListApiArg
      >({
        query: (queryArg) => ({
          url: `/api/projects/${queryArg.projectId}/field-records`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            entryTypeCode: queryArg.entryTypeCode,
          },
        }),
        providesTags: ['Field records'],
      }),
      fieldRecordsFindOne: build.query<
        FieldRecordsFindOneApiResponse,
        FieldRecordsFindOneApiArg
      >({
        query: (queryArg) => ({ url: `/api/field-records/${queryArg.id}` }),
        providesTags: ['Field records'],
      }),
      fieldRecordsVerify: build.query<
        FieldRecordsVerifyApiResponse,
        FieldRecordsVerifyApiArg
      >({
        query: (queryArg) => ({
          url: `/api/field-records/${queryArg.id}/verify`,
        }),
        providesTags: ['Field records'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as fieldRecordsApi };
export type FieldRecordsUploadApiResponse =
  /** status 201 JPEG, PNG or WebP up to 10 MB; metadata removed. The same photo twice gives the same id. */ {
    data: PhotoDto;
  };
export type FieldRecordsUploadApiArg = {
  body: {
    file?: Blob;
  };
};
export type FieldRecordsSyncApiResponse =
  /** status 200 One outcome per draft, in the order sent. Safe to send again. */ {
    data: SyncResultDto[];
  };
export type FieldRecordsSyncApiArg = {
  syncFieldRecordsDto: SyncFieldRecordsDto;
};
export type FieldRecordsListApiResponse =
  /** status 200 Newest observation first */ {
    data: FieldRecordDto[];
    meta: PageMetaDto;
  };
export type FieldRecordsListApiArg = {
  projectId: string;
  page?: number;
  limit?: number;
  entryTypeCode?: string;
};
export type FieldRecordsFindOneApiResponse = /** status 200  */ {
  data: FieldRecordDto;
};
export type FieldRecordsFindOneApiArg = {
  id: string;
};
export type FieldRecordsVerifyApiResponse = /** status 200  */ {
  data: FieldRecordVerificationDto;
};
export type FieldRecordsVerifyApiArg = {
  id: string;
};
export type PhotoDto = {
  /** Use as photoId in a record */
  id: string;
  mimeType: string;
  sizeBytes: number;
  photoHash: string;
};
export type MeasurementValueDto = {
  key: string;
  label: string;
  labelBn: string;
  unit?: string | null;
  value: string;
};
export type LocationDto = {
  latitude: string;
  longitude: string;
  accuracyMeters?: number | null;
  /** False: rounded to about 1 km for your role */
  exact: boolean;
};
export type PhotoRefDto = {
  id: string;
  url: string;
  /** SHA-256 of the file, as on the ledger */
  photoHash: string;
};
export type PersonNameDto = {
  id: string;
  name: string;
};
export type FieldRecordDto = {
  id: string;
  projectId: string;
  entryTypeCode: string;
  entryTypeName: string;
  entryTypeNameBn: string;
  notes?: string | null;
  measurements: MeasurementValueDto[];
  location?: LocationDto | null;
  photo?: PhotoRefDto | null;
  correctsEntryId?: string | null;
  /** Later records that correct this one */
  correctedBy: string[];
  recordedBy: PersonNameDto;
  observedAt: string;
  /** Ledger time */
  recordedAt?: string | null;
  status: 'submitted' | 'recorded';
  dataHash: string;
  /** Ledger transaction */
  txHash?: string | null;
};
export type SyncResultDto = {
  id: string;
  /** recorded: new; already_recorded: sent before, nothing duplicated; pending: keep the draft and resend later; rejected: fix and resend */
  outcome: 'recorded' | 'already_recorded' | 'pending' | 'rejected';
  /** Why it was rejected: an error code, as in error responses (ErrorCode or a ledger error name) */
  code?: string;
  /** English wording */
  message?: string;
  /** The values in the wording, as in error responses */
  details?: {
    [key: string]: unknown;
  };
  record?: FieldRecordDto;
};
export type FieldRecordDraftDto = {
  /** Generated on the phone; resending it never duplicates */
  id: string;
  projectId: string;
  entryTypeCode: string;
  notes?: string;
  /** Readings by key, as the record type defines them */
  measurements?: {
    [key: string]: string | number;
  };
  /** Decimal degrees, up to 6 places */
  latitude?: string | number;
  longitude?: string | number;
  /** GPS accuracy in metres */
  accuracyMeters?: number;
  /** From POST /photos */
  photoId?: string;
  /** The record this one corrects */
  correctsEntryId?: string;
  /** When it was observed, by the phone's clock */
  observedAt: string;
};
export type SyncFieldRecordsDto = {
  /** 1 to 50 drafts */
  records: FieldRecordDraftDto[];
};
export type PageMetaDto = {
  page: number;
  limit: number;
  /** Matching items on all pages */
  total: number;
  totalPages: number;
};
export type FieldRecordVerificationDto = {
  /** Data and photo both reproduce the ledger fingerprints */
  matches: boolean;
  /** Recomputed from the stored values */
  dataHash: string;
  ledgerDataHash?: string | null;
  /** Recomputed from the file on disk */
  photoHash?: string | null;
  ledgerPhotoHash?: string | null;
  mismatches: string[];
};
export const {
  useFieldRecordsUploadMutation,
  useFieldRecordsSyncMutation,
  useFieldRecordsListQuery,
  useLazyFieldRecordsListQuery,
  useFieldRecordsFindOneQuery,
  useLazyFieldRecordsFindOneQuery,
  useFieldRecordsVerifyQuery,
  useLazyFieldRecordsVerifyQuery,
} = injectedRtkApi;
