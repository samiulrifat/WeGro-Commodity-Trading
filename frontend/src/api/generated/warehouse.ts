import { baseApi as api } from '../base-api';
export const addTagTypes = ['Warehouse'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      warehouseCreateSite: build.mutation<
        WarehouseCreateSiteApiResponse,
        WarehouseCreateSiteApiArg
      >({
        query: (queryArg) => ({
          url: `/api/warehouse-sites`,
          method: 'POST',
          body: queryArg.createSiteDto,
        }),
        invalidatesTags: ['Warehouse'],
      }),
      warehouseListSites: build.query<
        WarehouseListSitesApiResponse,
        WarehouseListSitesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/warehouse-sites`,
          params: {
            q: queryArg.q,
            state: queryArg.state,
          },
        }),
        providesTags: ['Warehouse'],
      }),
      warehouseSite: build.query<WarehouseSiteApiResponse, WarehouseSiteApiArg>(
        {
          query: (queryArg) => ({ url: `/api/warehouse-sites/${queryArg.id}` }),
          providesTags: ['Warehouse'],
        },
      ),
      warehouseUpdateSite: build.mutation<
        WarehouseUpdateSiteApiResponse,
        WarehouseUpdateSiteApiArg
      >({
        query: (queryArg) => ({
          url: `/api/warehouse-sites/${queryArg.id}`,
          method: 'PATCH',
          body: queryArg.updateSiteDto,
        }),
        invalidatesTags: ['Warehouse'],
      }),
      warehouseCloseSite: build.mutation<
        WarehouseCloseSiteApiResponse,
        WarehouseCloseSiteApiArg
      >({
        query: (queryArg) => ({
          url: `/api/warehouse-sites/${queryArg.id}/close`,
          method: 'POST',
        }),
        invalidatesTags: ['Warehouse'],
      }),
      warehouseReopenSite: build.mutation<
        WarehouseReopenSiteApiResponse,
        WarehouseReopenSiteApiArg
      >({
        query: (queryArg) => ({
          url: `/api/warehouse-sites/${queryArg.id}/reopen`,
          method: 'POST',
        }),
        invalidatesTags: ['Warehouse'],
      }),
      warehouseAssignOperator: build.mutation<
        WarehouseAssignOperatorApiResponse,
        WarehouseAssignOperatorApiArg
      >({
        query: (queryArg) => ({
          url: `/api/warehouse-operators/${queryArg.operatorId}`,
          method: 'PUT',
          body: queryArg.assignOperatorDto,
        }),
        invalidatesTags: ['Warehouse'],
      }),
      warehouseIssue: build.mutation<
        WarehouseIssueApiResponse,
        WarehouseIssueApiArg
      >({
        query: (queryArg) => ({
          url: `/api/warehouse-receipts`,
          method: 'POST',
          body: queryArg.issueReceiptDto,
        }),
        invalidatesTags: ['Warehouse'],
      }),
      warehouseList: build.query<WarehouseListApiResponse, WarehouseListApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/warehouse-receipts`,
            params: {
              page: queryArg.page,
              limit: queryArg.limit,
              projectId: queryArg.projectId,
              siteId: queryArg.siteId,
              status: queryArg.status,
              expiresBy: queryArg.expiresBy,
              q: queryArg.q,
            },
          }),
          providesTags: ['Warehouse'],
        },
      ),
      warehouseFindOne: build.query<
        WarehouseFindOneApiResponse,
        WarehouseFindOneApiArg
      >({
        query: (queryArg) => ({
          url: `/api/warehouse-receipts/${queryArg.id}`,
        }),
        providesTags: ['Warehouse'],
      }),
      warehouseExtend: build.mutation<
        WarehouseExtendApiResponse,
        WarehouseExtendApiArg
      >({
        query: (queryArg) => ({
          url: `/api/warehouse-receipts/${queryArg.id}/extend`,
          method: 'POST',
          body: queryArg.recheckDto,
        }),
        invalidatesTags: ['Warehouse'],
      }),
      warehouseCollect: build.mutation<
        WarehouseCollectApiResponse,
        WarehouseCollectApiArg
      >({
        query: (queryArg) => ({
          url: `/api/warehouse-receipts/${queryArg.id}/collect`,
          method: 'POST',
        }),
        invalidatesTags: ['Warehouse'],
      }),
      warehouseOfferHandover: build.mutation<
        WarehouseOfferHandoverApiResponse,
        WarehouseOfferHandoverApiArg
      >({
        query: (queryArg) => ({
          url: `/api/warehouse-receipts/${queryArg.id}/handover`,
          method: 'POST',
        }),
        invalidatesTags: ['Warehouse'],
      }),
      warehouseAcceptHandover: build.mutation<
        WarehouseAcceptHandoverApiResponse,
        WarehouseAcceptHandoverApiArg
      >({
        query: (queryArg) => ({
          url: `/api/warehouse-receipts/${queryArg.id}/handover/accept`,
          method: 'POST',
        }),
        invalidatesTags: ['Warehouse'],
      }),
      warehouseCancelHandover: build.mutation<
        WarehouseCancelHandoverApiResponse,
        WarehouseCancelHandoverApiArg
      >({
        query: (queryArg) => ({
          url: `/api/warehouse-receipts/${queryArg.id}/handover/cancel`,
          method: 'POST',
        }),
        invalidatesTags: ['Warehouse'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as warehouseApi };
export type WarehouseCreateSiteApiResponse = /** status 201  */ {
  data: SiteDto;
};
export type WarehouseCreateSiteApiArg = {
  createSiteDto: CreateSiteDto;
};
export type WarehouseListSitesApiResponse = /** status 200  */ {
  data: SiteDto[];
};
export type WarehouseListSitesApiArg = {
  /** Words of the name, the address or the district */
  q?: string;
  state?: 'open' | 'closed';
};
export type WarehouseSiteApiResponse = /** status 200  */ {
  data: SiteDto;
};
export type WarehouseSiteApiArg = {
  id: string;
};
export type WarehouseUpdateSiteApiResponse =
  /** status 200 New details; their fingerprint goes to the ledger */ {
    data: SiteDto;
  };
export type WarehouseUpdateSiteApiArg = {
  id: string;
  updateSiteDto: UpdateSiteDto;
};
export type WarehouseCloseSiteApiResponse =
  /** status 200 No new goods or operators; its receipts stay valid and are still re-checked and released there */ {
    data: SiteDto;
  };
export type WarehouseCloseSiteApiArg = {
  id: string;
};
export type WarehouseReopenSiteApiResponse = /** status 200  */ {
  data: SiteDto;
};
export type WarehouseReopenSiteApiArg = {
  id: string;
};
export type WarehouseAssignOperatorApiResponse =
  /** status 200 The site they now work at, or null */ {
    data: SiteDto;
  };
export type WarehouseAssignOperatorApiArg = {
  operatorId: string;
  assignOperatorDto: AssignOperatorDto;
};
export type WarehouseIssueApiResponse =
  /** status 201 Issued to the project's farmer */ {
    data: ReceiptDetailDto;
  };
export type WarehouseIssueApiArg = {
  issueReceiptDto: IssueReceiptDto;
};
export type WarehouseListApiResponse = /** status 200  */ {
  data: ReceiptDto[];
  meta: PageMetaDto;
};
export type WarehouseListApiArg = {
  page?: number;
  limit?: number;
  projectId?: string;
  siteId?: string;
  status?:
    | 'submitted'
    | 'issued'
    | 'pending_handover'
    | 'listed'
    | 'sold'
    | 'collected'
    | 'sold_out';
  /** Only receipts still held that expire on or before this day (a re-check is due) */
  expiresBy?: string;
  /** Words of the project title; the farmer: a mobile number, an NID or whole words of their name; or the receipt number */
  q?: string;
};
export type WarehouseFindOneApiResponse = /** status 200  */ {
  data: ReceiptDetailDto;
};
export type WarehouseFindOneApiArg = {
  id: string;
};
export type WarehouseExtendApiResponse =
  /** status 200 After a quality re-check at the issuing site */ {
    data: ReceiptDetailDto;
  };
export type WarehouseExtendApiArg = {
  id: string;
  recheckDto: RecheckDto;
};
export type WarehouseCollectApiResponse =
  /** status 200 Unsold goods left the warehouse. Final. */ {
    data: ReceiptDetailDto;
  };
export type WarehouseCollectApiArg = {
  id: string;
};
export type WarehouseOfferHandoverApiResponse =
  /** status 200 Buy-back: offer the farmer's receipt to WeGro */ {
    data: ReceiptDetailDto;
  };
export type WarehouseOfferHandoverApiArg = {
  id: string;
};
export type WarehouseAcceptHandoverApiResponse = /** status 200  */ {
  data: ReceiptDetailDto;
};
export type WarehouseAcceptHandoverApiArg = {
  id: string;
};
export type WarehouseCancelHandoverApiResponse = /** status 200  */ {
  data: ReceiptDetailDto;
};
export type WarehouseCancelHandoverApiArg = {
  id: string;
};
export type NamedDto = {
  id: string;
  name: string;
};
export type SiteDto = {
  id: string;
  name: string;
  districtCode: string;
  districtName: string;
  address: string;
  storageType: 'warehouse' | 'cold_storage';
  capacityKg?: number | null;
  status: 'submitted' | 'registered';
  /** Takes no new goods or operators */
  closed: boolean;
  closedAt?: string | null;
  operators: NamedDto[];
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
export type CreateSiteDto = {
  name: string;
  districtCode: District;
  address: string;
  storageType: 'warehouse' | 'cold_storage';
  /** Capacity in kg */
  capacityKg?: number;
};
export type UpdateSiteDto = {
  name?: string;
  districtCode?: District;
  address?: string;
  storageType?: 'warehouse' | 'cold_storage';
  /** Capacity in kg; null removes it */
  capacityKg?: number | null;
};
export type AssignOperatorDto = {
  /** null removes them from their site */
  siteId: string | null;
};
export type OwnerDto = {
  kind: 'wegro' | 'farmer' | 'buyer' | 'other';
  id?: string | null;
  name: string;
};
export type ProduceRefDto = {
  code: string;
  name: string;
  nameBn?: string;
  unit: string;
};
export type IntakeDto = {
  bagCount?: number | null;
  moisturePercent?: string | null;
  storageBay?: string | null;
  intakeDate: string;
  notes?: string | null;
};
export type RecheckViewDto = {
  checkedOn: string;
  newExpiresOn: string;
  bagCount?: number | null;
  moisturePercent?: string | null;
  storageBay?: string | null;
  notes?: string | null;
  status: 'submitted' | 'recorded';
};
export type ReceiptDetailDto = {
  /** Ledger id; what the QR encodes */
  id: string;
  project: NamedDto;
  site: NamedDto;
  owner: OwnerDto;
  produce: ProduceRefDto;
  /** Still held under this receipt */
  quantity: number;
  originalQuantity: number;
  status:
    | 'submitted'
    | 'issued'
    | 'pending_handover'
    | 'listed'
    | 'sold'
    | 'collected'
    | 'sold_out';
  /** A buy-back to WeGro is waiting for an admin */
  pendingHandover: boolean;
  /** Split off from this receipt by a sale */
  parentId?: string | null;
  intake: IntakeDto;
  expiresOn: string;
  /** Past the last valid day, by the ledger clock */
  expired: boolean;
  issuedAt?: string | null;
  collectedAt?: string | null;
  detailsHash: string;
  verifyUrl: string;
  rechecks: RecheckViewDto[];
  /** Receipts split off to buyers */
  children: string[];
};
export type IssueReceiptDto = {
  bagCount?: number;
  /** Moisture %, one decimal place */
  moisturePercent?: string | number;
  storageBay?: string;
  notes?: string;
  projectId: string;
  /** Whole units of the produce (its catalog unit) */
  quantity: number;
  /** Day the goods came in */
  intakeDate: string;
  /** Valid through this day */
  expiresOn: string;
};
export type ReceiptDto = {
  /** Ledger id; what the QR encodes */
  id: string;
  project: NamedDto;
  site: NamedDto;
  owner: OwnerDto;
  produce: ProduceRefDto;
  /** Still held under this receipt */
  quantity: number;
  originalQuantity: number;
  status:
    | 'submitted'
    | 'issued'
    | 'pending_handover'
    | 'listed'
    | 'sold'
    | 'collected'
    | 'sold_out';
  /** A buy-back to WeGro is waiting for an admin */
  pendingHandover: boolean;
  /** Split off from this receipt by a sale */
  parentId?: string | null;
  intake: IntakeDto;
  expiresOn: string;
  /** Past the last valid day, by the ledger clock */
  expired: boolean;
  issuedAt?: string | null;
  collectedAt?: string | null;
  detailsHash: string;
  verifyUrl: string;
};
export type PageMetaDto = {
  page: number;
  limit: number;
  /** Matching items on all pages */
  total: number;
  totalPages: number;
};
export type RecheckDto = {
  bagCount?: number;
  /** Moisture %, one decimal place */
  moisturePercent?: string | number;
  storageBay?: string;
  notes?: string;
  /** Day of the quality re-check */
  checkedOn: string;
  /** New last valid day; must be later than now */
  newExpiresOn: string;
};
export const {
  useWarehouseCreateSiteMutation,
  useWarehouseListSitesQuery,
  useLazyWarehouseListSitesQuery,
  useWarehouseSiteQuery,
  useLazyWarehouseSiteQuery,
  useWarehouseUpdateSiteMutation,
  useWarehouseCloseSiteMutation,
  useWarehouseReopenSiteMutation,
  useWarehouseAssignOperatorMutation,
  useWarehouseIssueMutation,
  useWarehouseListQuery,
  useLazyWarehouseListQuery,
  useWarehouseFindOneQuery,
  useLazyWarehouseFindOneQuery,
  useWarehouseExtendMutation,
  useWarehouseCollectMutation,
  useWarehouseOfferHandoverMutation,
  useWarehouseAcceptHandoverMutation,
  useWarehouseCancelHandoverMutation,
} = injectedRtkApi;
