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
export type RecordLinkDto = {
  type: string;
  id: string;
};
export type NotificationDto = {
  id: number;
  category: 'reminder' | 'action' | 'outcome';
  kind: string;
  title: string;
  body?: string | null;
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
