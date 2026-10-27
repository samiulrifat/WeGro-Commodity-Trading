import { baseApi as api } from '../base-api';
export const addTagTypes = ['Marketplace'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      tradeListListings: build.query<
        TradeListListingsApiResponse,
        TradeListListingsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/listings`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            status: queryArg.status,
            produceCode: queryArg.produceCode,
            districtCode: queryArg.districtCode,
            projectId: queryArg.projectId,
            source: queryArg.source,
            mine: queryArg.mine,
            q: queryArg.q,
          },
        }),
        providesTags: ['Marketplace'],
      }),
      tradeListing: build.query<TradeListingApiResponse, TradeListingApiArg>({
        query: (queryArg) => ({ url: `/api/listings/${queryArg.id}` }),
        providesTags: ['Marketplace'],
      }),
      tradeListExternal: build.mutation<
        TradeListExternalApiResponse,
        TradeListExternalApiArg
      >({
        query: (queryArg) => ({
          url: `/api/listings/external`,
          method: 'POST',
          body: queryArg.listExternalDto,
        }),
        invalidatesTags: ['Marketplace'],
      }),
      tradeApproveListing: build.mutation<
        TradeApproveListingApiResponse,
        TradeApproveListingApiArg
      >({
        query: (queryArg) => ({
          url: `/api/listings/${queryArg.id}/approve`,
          method: 'POST',
        }),
        invalidatesTags: ['Marketplace'],
      }),
      tradeRejectListing: build.mutation<
        TradeRejectListingApiResponse,
        TradeRejectListingApiArg
      >({
        query: (queryArg) => ({
          url: `/api/listings/${queryArg.id}/reject`,
          method: 'POST',
          body: queryArg.rejectListingDto,
        }),
        invalidatesTags: ['Marketplace'],
      }),
      tradeFees: build.query<TradeFeesApiResponse, TradeFeesApiArg>({
        query: () => ({ url: `/api/marketplace/fees` }),
        providesTags: ['Marketplace'],
      }),
      tradeSetFees: build.mutation<TradeSetFeesApiResponse, TradeSetFeesApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/marketplace/fees`,
            method: 'PUT',
            body: queryArg.setFeeSlabsDto,
          }),
          invalidatesTags: ['Marketplace'],
        },
      ),
      tradeListReceipt: build.mutation<
        TradeListReceiptApiResponse,
        TradeListReceiptApiArg
      >({
        query: (queryArg) => ({
          url: `/api/listings/receipt`,
          method: 'POST',
          body: queryArg.listReceiptDto,
        }),
        invalidatesTags: ['Marketplace'],
      }),
      tradeListProduce: build.mutation<
        TradeListProduceApiResponse,
        TradeListProduceApiArg
      >({
        query: (queryArg) => ({
          url: `/api/listings/produce`,
          method: 'POST',
          body: queryArg.listProduceDto,
        }),
        invalidatesTags: ['Marketplace'],
      }),
      tradeCancelListing: build.mutation<
        TradeCancelListingApiResponse,
        TradeCancelListingApiArg
      >({
        query: (queryArg) => ({
          url: `/api/listings/${queryArg.id}/cancel`,
          method: 'POST',
        }),
        invalidatesTags: ['Marketplace'],
      }),
      tradeMakeOffer: build.mutation<
        TradeMakeOfferApiResponse,
        TradeMakeOfferApiArg
      >({
        query: (queryArg) => ({
          url: `/api/listings/${queryArg.id}/offers`,
          method: 'POST',
          body: queryArg.makeOfferDto,
        }),
        invalidatesTags: ['Marketplace'],
      }),
      tradeListOffers: build.query<
        TradeListOffersApiResponse,
        TradeListOffersApiArg
      >({
        query: (queryArg) => ({
          url: `/api/offers`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            listingId: queryArg.listingId,
            status: queryArg.status,
            discrepancy: queryArg.discrepancy,
            payoutDue: queryArg.payoutDue,
            q: queryArg.q,
          },
        }),
        providesTags: ['Marketplace'],
      }),
      tradeOffer: build.query<TradeOfferApiResponse, TradeOfferApiArg>({
        query: (queryArg) => ({ url: `/api/offers/${queryArg.id}` }),
        providesTags: ['Marketplace'],
      }),
      tradeWithdraw: build.mutation<
        TradeWithdrawApiResponse,
        TradeWithdrawApiArg
      >({
        query: (queryArg) => ({
          url: `/api/offers/${queryArg.id}/withdraw`,
          method: 'POST',
        }),
        invalidatesTags: ['Marketplace'],
      }),
      tradeReject: build.mutation<TradeRejectApiResponse, TradeRejectApiArg>({
        query: (queryArg) => ({
          url: `/api/offers/${queryArg.id}/reject`,
          method: 'POST',
        }),
        invalidatesTags: ['Marketplace'],
      }),
      tradeApprove: build.mutation<TradeApproveApiResponse, TradeApproveApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/offers/${queryArg.id}/approve`,
            method: 'POST',
          }),
          invalidatesTags: ['Marketplace'],
        },
      ),
      tradeCancelDeal: build.mutation<
        TradeCancelDealApiResponse,
        TradeCancelDealApiArg
      >({
        query: (queryArg) => ({
          url: `/api/offers/${queryArg.id}/cancel-deal`,
          method: 'POST',
        }),
        invalidatesTags: ['Marketplace'],
      }),
      tradeConfirmPayment: build.mutation<
        TradeConfirmPaymentApiResponse,
        TradeConfirmPaymentApiArg
      >({
        query: (queryArg) => ({
          url: `/api/offers/${queryArg.id}/payment`,
          method: 'POST',
          body: queryArg.paymentReferenceDto,
        }),
        invalidatesTags: ['Marketplace'],
      }),
      tradeSellerPayout: build.mutation<
        TradeSellerPayoutApiResponse,
        TradeSellerPayoutApiArg
      >({
        query: (queryArg) => ({
          url: `/api/offers/${queryArg.id}/seller-payout`,
          method: 'POST',
          body: queryArg.paymentReferenceDto,
        }),
        invalidatesTags: ['Marketplace'],
      }),
      tradeConfirmDelivery: build.mutation<
        TradeConfirmDeliveryApiResponse,
        TradeConfirmDeliveryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/offers/${queryArg.id}/delivery`,
          method: 'POST',
          body: queryArg.confirmDeliveryDto,
        }),
        invalidatesTags: ['Marketplace'],
      }),
      tradeListRequests: build.query<
        TradeListRequestsApiResponse,
        TradeListRequestsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/buyer-requests`,
          params: {
            page: queryArg.page,
            limit: queryArg.limit,
            produceCode: queryArg.produceCode,
            includeClosed: queryArg.includeClosed,
            mine: queryArg.mine,
            q: queryArg.q,
          },
        }),
        providesTags: ['Marketplace'],
      }),
      tradePostRequest: build.mutation<
        TradePostRequestApiResponse,
        TradePostRequestApiArg
      >({
        query: (queryArg) => ({
          url: `/api/buyer-requests`,
          method: 'POST',
          body: queryArg.postRequestDto,
        }),
        invalidatesTags: ['Marketplace'],
      }),
      tradeCancelRequest: build.mutation<
        TradeCancelRequestApiResponse,
        TradeCancelRequestApiArg
      >({
        query: (queryArg) => ({
          url: `/api/buyer-requests/${queryArg.id}/cancel`,
          method: 'POST',
        }),
        invalidatesTags: ['Marketplace'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as marketplaceApi };
export type TradeListListingsApiResponse =
  /** status 200 Open listings by default */ {
    data: ListingDto[];
    meta: PageMetaDto;
  };
export type TradeListListingsApiArg = {
  page?: number;
  limit?: number;
  status?: 'open' | 'cancelled' | 'sold_out' | 'pending' | 'rejected';
  produceCode?: string;
  districtCode?: District;
  projectId?: string;
  source?: 'warehouse' | 'fresh' | 'seller';
  /** Sellers: your own listings, in every status */
  mine?: boolean;
  /** Words of the produce name or the project title, or the seller: a mobile number, an NID or whole words of their name */
  q?: string;
};
export type TradeListingApiResponse = /** status 200  */ {
  data: ListingDto;
};
export type TradeListingApiArg = {
  id: number;
};
export type TradeListExternalApiResponse =
  /** status 201 Your own produce; buyers see it once an admin approves it */ {
    data: ListingDto;
  };
export type TradeListExternalApiArg = {
  listExternalDto: ListExternalDto;
};
export type TradeApproveListingApiResponse =
  /** status 200 An external seller’s listing goes live */ {
    data: ListingDto;
  };
export type TradeApproveListingApiArg = {
  id: number;
};
export type TradeRejectListingApiResponse = /** status 200  */ {
  data: ListingDto;
};
export type TradeRejectListingApiArg = {
  id: number;
  rejectListingDto: RejectListingDto;
};
export type TradeFeesApiResponse =
  /** status 200 Fixed platform fee per side, by the deal total */ {
    data: FeeScheduleDto;
  };
export type TradeFeesApiArg = void;
export type TradeSetFeesApiResponse =
  /** status 200 For deals approved from now on */ {
    data: FeeScheduleDto;
  };
export type TradeSetFeesApiArg = {
  setFeeSlabsDto: SetFeeSlabsDto;
};
export type TradeListReceiptApiResponse =
  /** status 201 List a warehouse receipt your side owns; locks it */ {
    data: ListingDto;
  };
export type TradeListReceiptApiArg = {
  listReceiptDto: ListReceiptDto;
};
export type TradeListProduceApiResponse =
  /** status 201 Fresh produce straight from an active project */ {
    data: ListingDto;
  };
export type TradeListProduceApiArg = {
  listProduceDto: ListProduceDto;
};
export type TradeCancelListingApiResponse =
  /** status 200 An unsold receipt returns to its owner */ {
    data: ListingDto;
  };
export type TradeCancelListingApiArg = {
  id: number;
};
export type TradeMakeOfferApiResponse =
  /** status 201 Your quantity at your price; an admin decides */ {
    data: OfferDto;
  };
export type TradeMakeOfferApiArg = {
  id: number;
  makeOfferDto: MakeOfferDto;
};
export type TradeListOffersApiResponse = /** status 200  */ {
  data: OfferDto[];
  meta: PageMetaDto;
};
export type TradeListOffersApiArg = {
  page?: number;
  limit?: number;
  listingId?: number;
  status?:
    | 'pending'
    | 'withdrawn'
    | 'rejected'
    | 'approved'
    | 'cancelled'
    | 'expired'
    | 'paid'
    | 'delivered'
    | 'seller_paid';
  /** Only deals whose delivery quantities disagree */
  discrepancy?: boolean;
  /** Delivered external sellers’ deals waiting for their payout */
  payoutDue?: boolean;
  /** The offer number (#12), words of the produce name, or the buyer or seller: a mobile number, an NID or whole words of their name */
  q?: string;
};
export type TradeOfferApiResponse = /** status 200  */ {
  data: OfferDto;
};
export type TradeOfferApiArg = {
  id: number;
};
export type TradeWithdrawApiResponse = /** status 200  */ {
  data: OfferDto;
};
export type TradeWithdrawApiArg = {
  id: number;
};
export type TradeRejectApiResponse = /** status 200  */ {
  data: OfferDto;
};
export type TradeRejectApiArg = {
  id: number;
};
export type TradeApproveApiResponse =
  /** status 200 A deal: the quantity is held until paid or past the deadline */ {
    data: OfferDto;
  };
export type TradeApproveApiArg = {
  id: number;
};
export type TradeCancelDealApiResponse =
  /** status 200 An unpaid deal; its quantity returns to the listing */ {
    data: OfferDto;
  };
export type TradeCancelDealApiArg = {
  id: number;
};
export type TradeConfirmPaymentApiResponse =
  /** status 200 Before the deadline; a receipt part goes to the buyer */ {
    data: OfferDto;
  };
export type TradeConfirmPaymentApiArg = {
  id: number;
  paymentReferenceDto: PaymentReferenceDto;
};
export type TradeSellerPayoutApiResponse =
  /** status 200 The external seller was paid the deal amount less the seller fee */ {
    data: OfferDto;
  };
export type TradeSellerPayoutApiArg = {
  id: number;
  paymentReferenceDto: PaymentReferenceDto;
};
export type TradeConfirmDeliveryApiResponse =
  /** status 200 Buyer and handler each confirm; both done = delivered */ {
    data: OfferDto;
  };
export type TradeConfirmDeliveryApiArg = {
  id: number;
  confirmDeliveryDto: ConfirmDeliveryDto;
};
export type TradeListRequestsApiResponse =
  /** status 200 Open requests by default, each with matching listings */ {
    data: BuyerRequestDto[];
    meta: PageMetaDto;
  };
export type TradeListRequestsApiArg = {
  page?: number;
  limit?: number;
  produceCode?: string;
  /** Include cancelled and expired requests */
  includeClosed?: boolean;
  /** Only your own (buyers) */
  mine?: boolean;
  /** Words of the produce name, or the buyer: a mobile number, an NID or whole words of their name */
  q?: string;
};
export type TradePostRequestApiResponse = /** status 201  */ {
  data: BuyerRequestDto;
};
export type TradePostRequestApiArg = {
  postRequestDto: PostRequestDto;
};
export type TradeCancelRequestApiResponse = /** status 200  */ {
  data: BuyerRequestDto;
};
export type TradeCancelRequestApiArg = {
  id: number;
};
export type TradePartyDto = {
  id: string;
  name: string;
};
export type PlaceDto = {
  code: string;
  name: string;
};
export type ProduceRefDto = {
  code: string;
  name: string;
  nameBn?: string;
  unit: string;
  unitBn: string;
};
export type SellerDto = {
  kind: 'wegro' | 'farmer' | 'seller';
  id?: string | null;
  name: string;
};
export type ListingDto = {
  id: number;
  /** Null for an external seller’s listing */
  project?: TradePartyDto | null;
  district: PlaceDto;
  produce: ProduceRefDto;
  source: 'warehouse' | 'fresh' | 'seller';
  receiptId?: string | null;
  seller: SellerDto;
  quantity: number;
  /** Not yet reserved by a deal */
  available: number;
  askingUnitPrice: string;
  unpaidDeals: number;
  status: 'open' | 'cancelled' | 'sold_out' | 'pending' | 'rejected';
  createdAt: string;
  closedAt?: string | null;
  description?: string | null;
  /** External listing photos (API paths) */
  photos: string[];
  /** Why an admin turned it down */
  rejectReason?: string | null;
  decidedAt?: string | null;
};
export type PageMetaDto = {
  page: number;
  limit: number;
  /** Matching items on all pages */
  total: number;
  totalPages: number;
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
export type ListExternalDto = {
  /** From the produce catalog */
  produceCode: string;
  /** In the produce’s catalog unit */
  quantity: number;
  askingUnitPrice: string;
  districtCode: District;
  description?: string;
  /** 1 to 3 photos you uploaded (POST /photos) */
  photoIds: string[];
};
export type RejectListingDto = {
  reason: string;
};
export type FeeSlabDto = {
  upTo?: string | null;
  fee: string;
};
export type FeeScheduleDto = {
  slabs: FeeSlabDto[];
};
export type FeeSlabInputDto = {
  /** Deal totals up to this; null for the last slab (everything above) */
  upTo?: string | null;
  /** Fee per side, taka */
  fee: string;
};
export type SetFeeSlabsDto = {
  /** Rising caps; the last slab has none. Applies to deals approved from now on */
  slabs: FeeSlabInputDto[];
};
export type ListReceiptDto = {
  /** A warehouse receipt your side owns */
  receiptId: string;
  /** Taka per unit of the produce */
  askingUnitPrice: string;
};
export type ListProduceDto = {
  /** An active project with fresh produce */
  projectId: string;
  quantity: number;
  askingUnitPrice: string;
};
export type DeliveryViewDto = {
  quantity: number;
  notes?: string | null;
  photoUrl?: string | null;
  status: 'submitted' | 'recorded';
  recordedAt?: string | null;
};
export type OfferDto = {
  id: number;
  listingId: number;
  produce: ProduceRefDto;
  buyer: TradePartyDto;
  quantity: number;
  unitPrice: string;
  amount: string;
  status:
    | 'pending'
    | 'withdrawn'
    | 'rejected'
    | 'approved'
    | 'cancelled'
    | 'expired'
    | 'paid'
    | 'delivered'
    | 'seller_paid';
  madeAt: string;
  /** Deals: pay before this */
  paymentDueAt?: string | null;
  /** An approved deal past its payment deadline (ledger clock) */
  overdue: boolean;
  paidAt?: string | null;
  /** The buyer's warehouse receipt */
  receiptPartId?: string | null;
  buyerDelivery?: DeliveryViewDto | null;
  handlerDelivery?: DeliveryViewDto | null;
  /** A confirmed delivery quantity differs from the deal */
  discrepancy: boolean;
  deliveredAt?: string | null;
  /** Accounts, admins and auditors */
  paymentReference?: string | null;
  seller: SellerDto;
  /** On an external seller’s listing */
  external: boolean;
  /** Platform fee the buyer pays on top; set on approval */
  buyerFee?: string | null;
  sellerFee?: string | null;
  /** What the buyer pays: the amount plus the buyer fee */
  buyerPays?: string | null;
  /** External listing: what the seller is paid after delivery */
  sellerReceives?: string | null;
  sellerPaidAt?: string | null;
  /** Accounts, admins and auditors */
  sellerPayoutReference?: string | null;
};
export type MakeOfferDto = {
  /** All or part of what is available */
  quantity: number;
  /** Your own price per unit */
  unitPrice: string;
};
export type PaymentReferenceDto = {
  paymentReference: string;
};
export type ConfirmDeliveryDto = {
  /** Quantity received (buyer) or handed over (handler) */
  quantity: number;
  /** Condition on arrival */
  notes?: string;
  /** From POST /photos */
  photoId?: string;
};
export type MatchingListingDto = {
  id: number;
  available: number;
  askingUnitPrice: string;
  district: string;
};
export type BuyerRequestDto = {
  id: number;
  buyer: TradePartyDto;
  produce: ProduceRefDto;
  quantity: number;
  maxUnitPrice: string;
  /** Open through this day */
  validUntil: string;
  status: 'open' | 'cancelled' | 'expired';
  postedAt: string;
  /** Open listings of this produce at or below the price */
  matchingListings: MatchingListingDto[];
};
export type PostRequestDto = {
  produceCode: string;
  quantity: number;
  /** Highest price per unit you would pay */
  maxUnitPrice: string;
  /** Open through this day */
  validUntil: string;
};
export const {
  useTradeListListingsQuery,
  useLazyTradeListListingsQuery,
  useTradeListingQuery,
  useLazyTradeListingQuery,
  useTradeListExternalMutation,
  useTradeApproveListingMutation,
  useTradeRejectListingMutation,
  useTradeFeesQuery,
  useLazyTradeFeesQuery,
  useTradeSetFeesMutation,
  useTradeListReceiptMutation,
  useTradeListProduceMutation,
  useTradeCancelListingMutation,
  useTradeMakeOfferMutation,
  useTradeListOffersQuery,
  useLazyTradeListOffersQuery,
  useTradeOfferQuery,
  useLazyTradeOfferQuery,
  useTradeWithdrawMutation,
  useTradeRejectMutation,
  useTradeApproveMutation,
  useTradeCancelDealMutation,
  useTradeConfirmPaymentMutation,
  useTradeSellerPayoutMutation,
  useTradeConfirmDeliveryMutation,
  useTradeListRequestsQuery,
  useLazyTradeListRequestsQuery,
  useTradePostRequestMutation,
  useTradeCancelRequestMutation,
} = injectedRtkApi;
