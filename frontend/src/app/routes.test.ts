import { describe, expect, it } from 'vitest';
import { AREAS } from './navigation';
import { router } from './router';

describe('routes', () => {
  it('have a page for every menu entry', () => {
    const known = new Set(
      Object.keys(router.routesByPath).map((p) => p.replace(/(.)\/$/, '$1')),
    );
    const missing = Object.values(AREAS)
      .map((a) => a.to)
      .filter((to) => !known.has(to));
    expect(missing).toEqual([]);
    expect(known).toContain('/sign-in');
    expect(known).toContain('/account');
  });
});
