import type { TokenResponseDto } from '@/api/generated/auth';
import { apiOrigin } from '@/lib/env';

/**
 * The one place requests leave the app: adds the access token, and on a 401
 * renews the session once (the refresh token is an httpOnly cookie) and
 * repeats the request. RTK Query and the file helpers both go through it.
 */

interface SessionHooks {
  getToken: () => string | null;
  onRenewed: (tokens: TokenResponseDto) => void;
  onEnded: () => void;
}

let hooks: SessionHooks | null = null;

/** Called once by the store, which owns the session. */
export function connectSession(h: SessionHooks): void {
  hooks = h;
}

export const apiUrl = (path: string) => `${apiOrigin()}${path}`;

const REFRESH_PATH = '/api/auth/refresh';
/** Routes that answer 401 for a wrong password, not an expired token. */
const NO_RETRY = /\/api\/auth\/(login|refresh|demo\/login|logout)$/;

let renewing: Promise<boolean> | null = null;

/** Renews the session; requests that fail together share one renewal. */
export function renewSession(): Promise<boolean> {
  renewing ??= (async () => {
    try {
      const res = await fetch(apiUrl(REFRESH_PATH), {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        hooks?.onEnded();
        return false;
      }
      const body = (await res.json()) as { data: TokenResponseDto };
      hooks?.onRenewed(body.data);
      return true;
    } catch {
      // Offline or the server is down: keep the session, report the failure.
      return false;
    } finally {
      renewing = null;
    }
  })();
  return renewing;
}

function authorize(request: Request): Request {
  const token = hooks?.getToken();
  if (!token || request.headers.has('Authorization')) return request;
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return new Request(request, { headers });
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, {
    credentials: 'same-origin',
    ...init,
  });
  // Kept unread so the body can be sent again after a renewal.
  const retry = request.clone();
  const response = await fetch(authorize(request));
  if (
    response.status !== 401 ||
    NO_RETRY.test(new URL(request.url).pathname) ||
    !hooks?.getToken()
  ) {
    return response;
  }
  return (await renewSession()) ? fetch(authorize(retry)) : response;
}
