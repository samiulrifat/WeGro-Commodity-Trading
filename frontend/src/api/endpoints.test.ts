import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectsApi } from '@/api/generated/projects';
import type { ProjectsListApiResponse } from '@/api/generated/projects';
import { sessionStarted } from '@/store/session-slice';
import { store } from '@/store/store';

/**
 * A generated endpoint driven through the real store: the request it makes
 * (method, path, query) and the response it hands back unchanged.
 */
describe('generated endpoints', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('call the documented route with the query, and return { data, meta } as sent', async () => {
    const page: ProjectsListApiResponse = {
      data: [],
      meta: { page: 2, limit: 10, total: 11, totalPages: 2 },
    };
    const seen: Request[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        seen.push(input);
        return new Response(JSON.stringify(page), {
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    store.dispatch(
      sessionStarted({
        accessToken: 't',
        tokenType: 'Bearer',
        expiresIn: 900,
        mustChangePassword: false,
        user: { id: 'u', role: 'investor', status: 'verified' },
      }),
    );
    const result = await store.dispatch(
      projectsApi.endpoints.projectsList.initiate({
        page: 2,
        limit: 10,
        stage: 'open_for_funding',
      }),
    );
    expect(result.data).toEqual(page);
    const req = seen[0]!;
    const url = new URL(req.url, 'http://localhost');
    expect(req.method).toBe('GET');
    expect(url.pathname).toBe('/api/projects');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '2',
      limit: '10',
      stage: 'open_for_funding',
    });
    expect(req.headers.get('Authorization')).toBe('Bearer t');
  });
});
