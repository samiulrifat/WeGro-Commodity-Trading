import { describe, expect, it } from 'vitest';
import type { SessionState } from '@/store/session-slice';
import {
  access,
  AREAS,
  type Area,
  homeOf,
  landingFor,
  NAV,
  navFor,
  type Role,
} from './navigation';

const user = (role: Role, status: 'verified' | 'pending' = 'verified') => ({
  id: 'u1',
  role,
  status,
  language: null,
});

const session = (
  over: Partial<SessionState> & { user?: SessionState['user'] } = {},
): SessionState => ({
  status: 'signedIn',
  accessToken: 't',
  user: user('admin'),
  mustChangePassword: false,
  ...over,
});

describe('navigation', () => {
  it('gives every role a menu whose first entry is its home', () => {
    const homes = Object.fromEntries(
      (Object.keys(NAV) as Role[]).map((role) => [role, homeOf(user(role))]),
    );
    expect(homes).toEqual({
      super_admin: '/dashboard',
      admin: '/dashboard',
      operations: '/dashboard',
      accounts: '/dashboard',
      auditor: '/dashboard',
      field_officer: '/farm-updates',
      farmer: '/projects',
      investor: '/projects',
      supplier: '/vouchers',
      warehouse: '/warehouse',
      buyer: '/marketplace',
      bank: '/bank/farmers',
      insurer: '/insurance',
    });
  });

  it('follows the agreed map, with each role’s own words', () => {
    const labels = (role: Role) => NAV[role].map((n) => n.label);
    expect(labels('field_officer')).toEqual([
      'farmUpdates',
      'farmers',
      'projects',
      'vouchers',
      'warehouse',
      'marketplace',
      'insurance',
      'trackRecords',
    ]);
    expect(labels('farmer')).toEqual([
      'myProjects',
      'vouchers',
      'warehouse',
      'marketplace',
      'insurance',
      'statement',
      'trackRecord',
    ]);
    expect(labels('investor')).toEqual(['projects', 'holdings', 'statement']);
    expect(labels('buyer')).toEqual([
      'marketplace',
      'offers',
      'requests',
      'receipts',
    ]);
    expect(labels('auditor')).toContain('audit');
    expect(labels('operations')).not.toContain('payouts');
  });

  it('lists each area once per role, and uses every area somewhere', () => {
    for (const items of Object.values(NAV)) {
      const areas = items.map((n) => n.area);
      expect(new Set(areas).size).toBe(areas.length);
    }
    const used = new Set<Area>([
      ...Object.values(NAV).flatMap((items) => items.map((n) => n.area)),
      'status',
    ]);
    expect([...used].sort()).toEqual((Object.keys(AREAS) as Area[]).sort());
  });

  it('shows someone not yet verified only where their registration stands', () => {
    const pending = user('farmer', 'pending');
    expect(navFor(pending).map((n) => n.area)).toEqual(['status']);
    expect(homeOf(pending)).toBe('/status');
    expect(access(session({ user: pending }), 'projects')).toBe('no-access');
    expect(access(session({ user: pending }), 'status')).toBe('ok');
  });
});

describe('access', () => {
  it('sends the signed-out to sign in, whatever the page', () => {
    expect(access(session({ status: 'signedOut', user: null }))).toBe(
      'sign-in',
    );
    expect(access(session({ status: 'unknown', user: null }), 'projects')).toBe(
      'sign-in',
    );
  });

  it('holds a temporary password to its change, even for pages of the role', () => {
    expect(access(session({ mustChangePassword: true }), 'dashboard')).toBe(
      'change-password',
    );
  });

  it('treats an offline session like a signed-in one', () => {
    expect(
      access(session({ status: 'offline', accessToken: null }), 'farm-updates'),
    ).toBe('no-access');
    const officer = session({
      status: 'offline',
      accessToken: null,
      user: user('field_officer'),
    });
    expect(access(officer, 'farm-updates')).toBe('ok');
  });

  it('opens a role’s own areas and pages for everyone, and nothing else', () => {
    const investor = session({ user: user('investor') });
    expect(access(investor, 'holdings')).toBe('ok');
    expect(access(investor, undefined)).toBe('ok');
    expect(access(investor, 'payouts')).toBe('no-access');
    expect(access(investor, 'catalog')).toBe('no-access');
  });
});

describe('after signing in', () => {
  it('returns to the page asked for, if this person may open it', () => {
    const officer = user('field_officer');
    expect(landingFor(officer, '/farm-updates?draft=3')).toBe(
      '/farm-updates?draft=3',
    );
    expect(landingFor(officer, '/projects/42')).toBe('/projects/42');
    expect(landingFor(officer, '/account')).toBe('/account');
    expect(landingFor(officer, undefined)).toBe('/farm-updates');
  });

  it('goes home instead of to another role’s page', () => {
    const investor = user('investor');
    expect(landingFor(investor, '/farm-updates')).toBe('/projects');
    // A prefix of an area's path is not that area.
    expect(landingFor(investor, '/holdingsx')).toBe('/holdingsx');
    expect(landingFor(user('farmer', 'pending'), '/projects')).toBe('/status');
  });
});
