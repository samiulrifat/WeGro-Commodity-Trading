import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

/** The backend's error body (AllExceptionsFilter), the same for every failure. */
interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  /** Machine-readable reason: a contract error name or a code like PAYMENT_REF_ALREADY_USED. */
  code?: string;
  details?: Record<string, unknown>;
  path?: string;
  requestId?: string;
}

export type ApiErrorKind =
  /** No answer at all: offline, or the server is down. */
  | 'network'
  /** 401: signed out. */
  | 'unauthenticated'
  /** 403: the role may not do this. */
  | 'forbidden'
  | 'not-found'
  /** 400/422: the request or its values were refused, see `messages`. */
  | 'invalid'
  /** 409: the record's state (or the ledger) does not allow it now, see `code`. */
  | 'conflict'
  | 'rate-limited'
  /** 503: the blockchain node or database cannot be reached. */
  | 'unavailable'
  | 'server';

export interface ApiError {
  kind: ApiErrorKind;
  status: number | null;
  /** One or more readable messages from the server (validation lists each). */
  messages: string[];
  code?: string;
  details?: Record<string, unknown>;
  /** Quote it when reporting a problem: the server logs it. */
  requestId?: string;
}

const KIND_BY_STATUS: Record<number, ApiErrorKind> = {
  400: 'invalid',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not-found',
  409: 'conflict',
  422: 'invalid',
  429: 'rate-limited',
  503: 'unavailable',
};

const isErrorBody = (v: unknown): v is ErrorBody =>
  !!v && typeof v === 'object' && 'statusCode' in v && 'message' in v;

/** Turns whatever an RTK Query call failed with into one readable shape. */
export function toApiError(
  error: FetchBaseQueryError | SerializedError | undefined,
): ApiError | null {
  if (!error) return null;
  if ('status' in error) {
    if (typeof error.status === 'number') {
      const body = isErrorBody(error.data) ? error.data : undefined;
      return {
        kind:
          KIND_BY_STATUS[error.status] ??
          (error.status >= 500 ? 'server' : 'invalid'),
        status: error.status,
        messages: body ? [body.message].flat() : [],
        code: body?.code,
        details: body?.details,
        requestId: body?.requestId,
      };
    }
    // FETCH_ERROR, TIMEOUT_ERROR, PARSING_ERROR, CUSTOM_ERROR
    return {
      kind: error.status === 'PARSING_ERROR' ? 'server' : 'network',
      status: null,
      messages: [String(error.error)],
    };
  }
  return { kind: 'server', status: null, messages: [error.message ?? ''] };
}
