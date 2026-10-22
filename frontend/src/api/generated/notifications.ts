import { baseApi as api } from '../base-api';
export const addTagTypes = ['Notifications'] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      notificationsList: build.query<
        NotificationsListApiResponse,
        NotificationsListApiArg
      >({
        query: (queryArg) => ({
          url: `/api/notifications`,
          params: {
            unread: queryArg.unread,
            before: queryArg.before,
            limit: queryArg.limit,
          },
        }),
        providesTags: ['Notifications'],
      }),
      notificationsUnread: build.query<
        NotificationsUnreadApiResponse,
        NotificationsUnreadApiArg
      >({
        query: () => ({ url: `/api/notifications/unread-count` }),
        providesTags: ['Notifications'],
      }),
      notificationsReadAll: build.mutation<
        NotificationsReadAllApiResponse,
        NotificationsReadAllApiArg
      >({
        query: () => ({ url: `/api/notifications/read-all`, method: 'POST' }),
        invalidatesTags: ['Notifications'],
      }),
      notificationsRead: build.mutation<
        NotificationsReadApiResponse,
        NotificationsReadApiArg
      >({
        query: (queryArg) => ({
          url: `/api/notifications/${queryArg.id}/read`,
          method: 'POST',
        }),
        invalidatesTags: ['Notifications'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as notificationsApi };
export type NotificationsListApiResponse = /** status 200  */ {
  data: NotificationPageDto;
};
export type NotificationsListApiArg = {
  /** Only unread ones */
  unread?: boolean;
  /** Older than this id: pass nextBefore from the previous page */
  before?: number;
  limit?: number;
};
export type NotificationsUnreadApiResponse =
  /** status 200 For the badge; cheap to poll */ {
    data: UnreadCountDto;
  };
export type NotificationsUnreadApiArg = void;
export type NotificationsReadAllApiResponse = /** status 200  */ {
  data: MarkedReadDto;
};
export type NotificationsReadAllApiArg = void;
export type NotificationsReadApiResponse = /** status 200  */ {
  data: NotificationDto;
};
export type NotificationsReadApiArg = {
  id: number;
};
export type NotificationKind =
  | 'participant.registered'
  | 'participant.verified'
  | 'participant.rejected'
  | 'participant.access-revoked'
  | 'farmer.assigned'
  | 'reservation.made'
  | 'reservation.confirmed'
  | 'reservation.expired'
  | 'reservation.cancelled'
  | 'reservation.expiring'
  | 'payment-proof.submitted'
  | 'payment-proof.accepted'
  | 'payment-proof.rejected'
  | 'payment-proof.refunded'
  | 'project.funded'
  | 'project.active'
  | 'project.ready-for-sale'
  | 'project.paid-out'
  | 'project.cancelled'
  | 'project.refunds-due'
  | 'refund.paid'
  | 'voucher.proposed'
  | 'voucher.approved'
  | 'voucher.rejected'
  | 'voucher.cancelled'
  | 'voucher.inactive-soon'
  | 'voucher.inactive'
  | 'sale.recorded'
  | 'sale.confirmed'
  | 'sale.cancelled'
  | 'sale.expired'
  | 'sale.confirm-due'
  | 'receipt.issued'
  | 'receipt.expiring'
  | 'handover.offered'
  | 'handover.cancelled'
  | 'handover.accepted'
  | 'offer.made'
  | 'offer.approved'
  | 'offer.rejected'
  | 'deal.awaiting-payment'
  | 'deal.payment-due'
  | 'deal.cancelled'
  | 'deal.expired'
  | 'deal.paid'
  | 'deal.deliver'
  | 'deal.delivered'
  | 'listing.awaiting-approval'
  | 'listing.approved'
  | 'listing.rejected'
  | 'seller.payout-due'
  | 'seller.paid'
  | 'claim.opened'
  | 'claim.approved'
  | 'claim.rejected'
  | 'round.prepared'
  | 'round.rejected'
  | 'round.approved'
  | 'payout.paid'
  | 'track-record.published'
  | 'track-record.viewed'
  | 'consent.granted'
  | 'consent.revoked'
  | 'consent.expiring'
  | 'bank-account.submitted'
  | 'bank-account.verified'
  | 'bank-account.rejected'
  | 'details.change-requested'
  | 'details.change-approved'
  | 'details.change-rejected'
  | 'system.node-unreachable'
  | 'system.indexer-behind'
  | 'system.indexer-failing'
  | 'system.resolved';
export type RecordLinkDto = {
  type: string;
  id: string;
};
export type NotificationDto = {
  id: number;
  category: 'reminder' | 'action' | 'outcome';
  kind: NotificationKind;
  title: string;
  body?: string | null;
  /** Values in the text, for wording it in the reader’s language (amounts as taka strings, dates as ISO); title and body are the English wording */
  params?: {
    [key: string]:
      ((string | null) | (number | null) | (boolean | null)) | null;
  } | null;
  /** What it is about */
  subject?: RecordLinkDto | null;
  createdAt: string;
  readAt?: string | null;
};
export type NotificationPageDto = {
  /** Newest first */
  items: NotificationDto[];
  /** Pass as before= for the next page; null at the end */
  nextBefore?: number | null;
};
export type UnreadCountDto = {
  unread: number;
};
export type MarkedReadDto = {
  /** How many were marked read */
  marked: number;
};
export const {
  useNotificationsListQuery,
  useLazyNotificationsListQuery,
  useNotificationsUnreadQuery,
  useLazyNotificationsUnreadQuery,
  useNotificationsReadAllMutation,
  useNotificationsReadMutation,
} = injectedRtkApi;
