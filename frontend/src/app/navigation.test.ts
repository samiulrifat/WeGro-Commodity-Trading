import { describe, expect, it } from 'vitest';
import type { SessionState } from '@/store/session-slice';
import {
  access,
  actsAs,
  AREAS,
  type Area,
  currentPage,
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
  endReason: null,
  ...over,
});

describe('navigation', () => {
  it('gives every role a menu whose first page is its home', () => {
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
      seller: '/marketplace/mine',
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
      'catalog',
    ]);
    expect(labels('farmer')).toEqual([
      'myProjects',
      'vouchers',
      'warehouse',
      'marketplace',
      'insurance',
      'statement',
      'trackRecord',
      'catalog',
    ]);
    expect(labels('investor')).toEqual([
      'projects',
      'holdings',
      'statement',
      'catalog',
    ]);
    expect(labels('buyer')).toEqual([
      'marketplace',
      'offers',
      'requests',
      'receipts',
      'catalog',
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
    expect(access(investor, 'catalog')).toBe('ok');
    expect(access(investor, 'catalog', '/catalog/produce')).toBe('ok');
    expect(access(investor, 'catalog', '/catalog/inputs')).toBe('no-access');
  });

  it('shows each role the catalog lists its work uses', () => {
    const lists = (role: Role) =>
      NAV[role].find((n) => n.area === 'catalog')?.pages?.map((p) => p.label);
    const all = [
      'units',
      'produce',
      'inputs',
      'farmUpdateTypes',
      'weatherEvents',
    ];
    for (const role of [
      'super_admin',
      'admin',
      'operations',
      'auditor',
    ] as const) {
      expect(lists(role)).toEqual(all);
    }
    for (const role of [
      'farmer',
      'investor',
      'buyer',
      'warehouse',
      'bank',
    ] as const) {
      expect(lists(role)).toEqual(['produce']);
    }
    expect(lists('supplier')).toEqual(['inputs']);
    expect(lists('field_officer')).toEqual([
      'produce',
      'inputs',
      'farmUpdateTypes',
      'weatherEvents',
    ]);
    expect(lists('insurer')).toEqual(['produce', 'weatherEvents']);
    expect(lists('accounts')).toEqual(['produce', 'inputs']);
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

  it('opens a section page only for roles that have it', () => {
    const officer = session({ user: user('field_officer') });
    expect(access(officer, 'people', '/people/new')).toBe('ok');
    expect(access(officer, 'people', '/people/changes')).toBe('no-access');
    expect(access(officer, 'people', '/people/pending')).toBe('no-access');
    expect(access(session(), 'people', '/people/changes')).toBe('ok');
    const auditor = session({ user: user('auditor') });
    expect(access(auditor, 'people')).toBe('ok');
    expect(access(auditor, 'people', '/people/new')).toBe('no-access');
  });

  it('finds the section page you are on, a person counting as the list', () => {
    const pages = NAV.admin.find((n) => n.area === 'people')!.pages!;
    const at = (path: string) => currentPage(pages, path)?.label;
    expect(at('/people')).toBe('allPeople');
    expect(at('/people/0b6c2a50-1111-4111-8111-111111111111')).toBe(
      'allPeople',
    );
    expect(at('/people/new')).toBe('registerPerson');
    expect(at('/people/changes/abc')).toBe('detailChanges');
  });
});

describe('the super admin', () => {
  it('has every page any office role has, now and as pages are added', () => {
    const pages = (r: Role) =>
      NAV[r].flatMap((n) => [n.area, ...(n.pages ?? []).map((p) => p.to)]);
    const own = new Set(pages('super_admin'));
    for (const r of ['admin', 'operations', 'accounts', 'auditor'] as const) {
      expect(pages(r).filter((x) => !own.has(x))).toEqual([]);
    }
  });

  it('acts as every office role, never as people outside the office', () => {
    for (const r of ['admin', 'operations', 'accounts', 'auditor'] as const) {
      expect(actsAs('super_admin', r)).toBe(true);
      expect(actsAs(r, r)).toBe(true);
    }
    for (const r of [
      'supplier',
      'buyer',
      'farmer',
      'investor',
      'warehouse',
      'field_officer',
      'bank',
      'insurer',
    ] as const) {
      expect(actsAs('super_admin', r)).toBe(false);
    }
    expect(actsAs('admin', 'accounts')).toBe(false);
  });
});
