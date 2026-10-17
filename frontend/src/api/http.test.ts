import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, connectSession, renewSession } from './http';

const TOKENS = {
  accessToken: 'new-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  mustChangePassword: false,
  user: { id: 'u1', role: 'investor', status: 'verified' },
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('apiFetch', () => {
  let token: string | null;
  let calls: Array<{ url: string; auth: string | null; body: string }>;
  let refreshAnswer: () => Response;
  const ended = vi.fn();

  beforeEach(() => {
    token = 'old-token';
    calls = [];
    ended.mockReset();
    refreshAnswer = () => json(200, { data: TOKENS });
    connectSession({
      getToken: () => token,
      onRenewed: (t) => (token = t.accessToken),
      onEnded: ended,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request | string, init?: RequestInit) => {
        const req = new Request(input, init);
        const url = new URL(req.url).pathname;
        calls.push({
          url,
          auth: req.headers.get('Authorization'),
          body: await req.text(),
        });
        if (url === '/api/auth/refresh') return refreshAnswer();
        return req.headers.get('Authorization') === 'Bearer new-token'
          ? json(200, { data: 'ok' })
          : json(401, { statusCode: 401, message: 'Expired' });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const call = (path: string, init?: RequestInit) =>
    apiFetch(`http://localhost${path}`, init);

  it('sends the access token', async () => {
    token = 'new-token';
    await call('/api/projects');
    expect(calls).toEqual([
      { url: '/api/projects', auth: 'Bearer new-token', body: '' },
    ]);
  });

  it('renews an expired session once and repeats the request, body included', async () => {
    const res = await call('/api/reservations/1/confirm', {
      method: 'POST',
      body: JSON.stringify({ paymentReference: 'TRX-1' }),
    });
    expect(res.status).toBe(200);
    expect(calls.map((c) => [c.url, c.auth, c.body])).toEqual([
      [
        '/api/reservations/1/confirm',
        'Bearer old-token',
        '{"paymentReference":"TRX-1"}',
      ],
      ['/api/auth/refresh', null, ''],
      [
        '/api/reservations/1/confirm',
        'Bearer new-token',
        '{"paymentReference":"TRX-1"}',
      ],
    ]);
  });

  it('shares one renewal between requests that fail together', async () => {
    await Promise.all([call('/api/a'), call('/api/b'), call('/api/c')]);
    expect(calls.filter((c) => c.url === '/api/auth/refresh')).toHaveLength(1);
  });

  it('ends the session when it cannot be renewed', async () => {
    refreshAnswer = () =>
      json(401, { statusCode: 401, message: 'Session expired' });
    const res = await call('/api/projects');
    expect(res.status).toBe(401);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the server cannot be reached', async () => {
    refreshAnswer = () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(renewSession()).resolves.toBe(false);
    expect(ended).not.toHaveBeenCalled();
  });

  it('does not renew for a wrong password, or when signed out', async () => {
    await call('/api/auth/login', { method: 'POST', body: '{}' });
    token = null;
    await call('/api/projects');
    expect(calls.map((c) => c.url)).toEqual([
      '/api/auth/login',
      '/api/projects',
    ]);
  });
});
