import {
  Activity,
  BadgeCheck,
  Banknote,
  BookOpen,
  Boxes,
  FileText,
  HandCoins,
  History,
  Hourglass,
  Landmark,
  LayoutDashboard,
  type LucideIcon,
  Megaphone,
  NotebookPen,
  ShieldCheck,
  Sprout,
  Store,
  Ticket,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react';
import type { SessionUserDto } from '@/api/generated/auth';
import type { SessionState } from '@/store/session-slice';

export type Role = SessionUserDto['role'];

/** Those who run WeGro, the super admin among them (as on the ledger). */
const STAFF: ReadonlySet<Role> = new Set<Role>([
  'super_admin',
  'admin',
  'accounts',
  'operations',
  'field_officer',
  'auditor',
]);
export const isStaff = (role: Role) => STAFF.has(role);

/** Each area of the app: where it lives and its icon. */
export const AREAS = {
  dashboard: { to: '/dashboard', icon: LayoutDashboard },
  projects: { to: '/projects', icon: Sprout },
  holdings: { to: '/holdings', icon: Wallet },
  people: { to: '/people', icon: Users },
  'farm-updates': { to: '/farm-updates', icon: NotebookPen },
  vouchers: { to: '/vouchers', icon: Ticket },
  batches: { to: '/batches', icon: Boxes },
  warehouse: { to: '/warehouse', icon: Warehouse },
  marketplace: { to: '/marketplace', icon: Store },
  offers: { to: '/offers', icon: HandCoins },
  requests: { to: '/requests', icon: Megaphone },
  insurance: { to: '/insurance', icon: ShieldCheck },
  payouts: { to: '/payouts', icon: Banknote },
  statement: { to: '/statement', icon: FileText },
  'track-records': { to: '/track-records', icon: BadgeCheck },
  catalog: { to: '/catalog', icon: BookOpen },
  audit: { to: '/audit', icon: History },
  system: { to: '/system', icon: Activity },
  'bank-farmers': { to: '/bank/farmers', icon: Landmark },
  status: { to: '/status', icon: Hourglass },
} as const satisfies Record<string, { to: string; icon: LucideIcon }>;

export type Area = keyof typeof AREAS;

/** The words for each menu entry (nav.<label> in the translations). */
export type NavLabel =
  | 'dashboard'
  | 'projects'
  | 'myProjects'
  | 'holdings'
  | 'people'
  | 'farmers'
  | 'farmUpdates'
  | 'vouchers'
  | 'vouchersSales'
  | 'batches'
  | 'warehouse'
  | 'receipts'
  | 'marketplace'
  | 'offers'
  | 'requests'
  | 'insurance'
  | 'payouts'
  | 'statement'
  | 'trackRecords'
  | 'trackRecord'
  | 'catalog'
  | 'audit'
  | 'system'
  | 'status';

/** A page inside a section with several (nav.sub.<label>). */
export type SubLabel =
  | 'allPeople'
  | 'myFarmers'
  | 'pendingPeople'
  | 'registerPerson'
  | 'registerFarmer'
  | 'detailChanges'
  | 'bankDetails'
  | 'units'
  | 'produce'
  | 'inputs'
  | 'farmUpdateTypes'
  | 'weatherEvents'
  | 'allProjects'
  | 'drafts'
  | 'paymentConfirmations'
  | 'refunds'
  | 'paymentAccounts';

/** The pages of sections that have several, as their routes are named. */
export type SubPath =
  | '/people'
  | '/people/pending'
  | '/people/new'
  | '/people/changes'
  | '/people/bank-details'
  | '/catalog/units'
  | '/catalog/produce'
  | '/catalog/inputs'
  | '/catalog/farm-update-types'
  | '/catalog/weather-events'
  | '/projects'
  | '/projects/drafts'
  | '/projects/payments'
  | '/projects/refunds'
  | '/projects/payment-accounts';

export interface SubPage {
  to: SubPath;
  label: SubLabel;
}

export interface NavItem {
  area: Area;
  label: NavLabel;
  /**
   * A section's pages this role may open: a dropdown in the sidebar and
   * tabs on phones. Absent: the section is one page.
   */
  pages?: readonly SubPage[];
}

const item = (
  area: Area,
  label: NavLabel,
  pages?: readonly SubPage[],
): NavItem => (pages ? { area, label, pages } : { area, label });

const sub = (to: SubPath, label: SubLabel): SubPage => ({ to, label });

/** The catalog's lists, each role seeing those its work uses. */
const UNITS = sub('/catalog/units', 'units');
const PRODUCE = sub('/catalog/produce', 'produce');
const INPUTS = sub('/catalog/inputs', 'inputs');
const FARM_UPDATE_TYPES = sub('/catalog/farm-update-types', 'farmUpdateTypes');
const WEATHER_EVENTS = sub('/catalog/weather-events', 'weatherEvents');
const WHOLE_CATALOG = [
  UNITS,
  PRODUCE,
  INPUTS,
  FARM_UPDATE_TYPES,
  WEATHER_EVENTS,
];
const catalog = (...pages: SubPage[]) => item('catalog', 'catalog', pages);

/** The projects section: payments and refunds for those who handle money. */
const ALL_PROJECTS = sub('/projects', 'allProjects');
const DRAFTS = sub('/projects/drafts', 'drafts');
const PAYMENTS = sub('/projects/payments', 'paymentConfirmations');
const REFUNDS = sub('/projects/refunds', 'refunds');
const PAYMENT_ACCOUNTS = sub('/projects/payment-accounts', 'paymentAccounts');
const projects = (...pages: SubPage[]) => item('projects', 'projects', pages);

const OFFICE: NavItem[] = [
  item('dashboard', 'dashboard'),
  projects(ALL_PROJECTS, DRAFTS, PAYMENTS, REFUNDS),
  item('people', 'people', [
    sub('/people', 'allPeople'),
    sub('/people/pending', 'pendingPeople'),
    sub('/people/new', 'registerPerson'),
    sub('/people/changes', 'detailChanges'),
    sub('/people/bank-details', 'bankDetails'),
  ]),
  item('vouchers', 'vouchers'),
  item('warehouse', 'warehouse'),
  item('marketplace', 'marketplace'),
  item('insurance', 'insurance'),
  item('payouts', 'payouts'),
  item('track-records', 'trackRecords'),
  catalog(...WHOLE_CATALOG),
  item('audit', 'audit'),
  item('system', 'system'),
];

/**
 * What each role sees, in order; the first is where they land after
 * signing in. Areas not listed are refused (the backend refuses the calls
 * behind them too, or they are not this role's work).
 */
export const NAV: Record<Role, readonly NavItem[]> = {
  // The super admin also keeps WeGro's payment accounts.
  super_admin: OFFICE.map((n) =>
    n.area === 'projects'
      ? projects(ALL_PROJECTS, DRAFTS, PAYMENTS, REFUNDS, PAYMENT_ACCOUNTS)
      : n,
  ),
  admin: OFFICE,
  operations: [
    item('dashboard', 'dashboard'),
    item('projects', 'projects'),
    item('vouchers', 'vouchers'),
    catalog(...WHOLE_CATALOG),
    item('marketplace', 'marketplace'),
    item('warehouse', 'warehouse'),
    item('insurance', 'insurance'),
  ],
  accounts: [
    item('dashboard', 'dashboard'),
    projects(ALL_PROJECTS, PAYMENTS, REFUNDS, PAYMENT_ACCOUNTS),
    item('vouchers', 'vouchers'),
    item('payouts', 'payouts'),
    item('marketplace', 'marketplace'),
    item('warehouse', 'warehouse'),
    item('insurance', 'insurance'),
    catalog(PRODUCE, INPUTS),
  ],
  auditor: [
    item('dashboard', 'dashboard'),
    item('audit', 'audit'),
    projects(ALL_PROJECTS, PAYMENTS, REFUNDS),
    item('people', 'people'),
    item('vouchers', 'vouchers'),
    item('warehouse', 'warehouse'),
    item('marketplace', 'marketplace'),
    item('insurance', 'insurance'),
    item('payouts', 'payouts'),
    item('track-records', 'trackRecords'),
    catalog(...WHOLE_CATALOG),
    item('system', 'system'),
  ],
  field_officer: [
    item('farm-updates', 'farmUpdates'),
    item('people', 'farmers', [
      sub('/people', 'myFarmers'),
      sub('/people/new', 'registerFarmer'),
    ]),
    item('projects', 'projects'),
    item('vouchers', 'vouchers'),
    item('warehouse', 'warehouse'),
    item('marketplace', 'marketplace'),
    item('insurance', 'insurance'),
    item('track-records', 'trackRecords'),
    catalog(PRODUCE, INPUTS, FARM_UPDATE_TYPES, WEATHER_EVENTS),
  ],
  farmer: [
    item('projects', 'myProjects'),
    item('vouchers', 'vouchers'),
    item('warehouse', 'warehouse'),
    item('marketplace', 'marketplace'),
    item('insurance', 'insurance'),
    item('statement', 'statement'),
    item('track-records', 'trackRecord'),
    catalog(PRODUCE),
  ],
  investor: [
    item('projects', 'projects'),
    item('holdings', 'holdings'),
    item('statement', 'statement'),
    catalog(PRODUCE),
  ],
  supplier: [
    item('vouchers', 'vouchersSales'),
    item('batches', 'batches'),
    catalog(INPUTS),
  ],
  warehouse: [
    item('warehouse', 'receipts'),
    item('marketplace', 'marketplace'),
    catalog(PRODUCE),
  ],
  buyer: [
    item('marketplace', 'marketplace'),
    item('offers', 'offers'),
    item('requests', 'requests'),
    item('warehouse', 'receipts'),
    catalog(PRODUCE),
  ],
  bank: [item('bank-farmers', 'farmers'), catalog(PRODUCE)],
  insurer: [item('insurance', 'insurance'), catalog(PRODUCE, WEATHER_EVENTS)],
};

/** Someone not verified yet sees only where their registration stands. */
const PENDING: readonly NavItem[] = [item('status', 'status')];

type User = NonNullable<SessionState['user']>;

export function navFor(user: User): readonly NavItem[] {
  return user.status === 'verified' ? NAV[user.role] : PENDING;
}

/** Where someone lands after signing in. */
export function homeOf(user: User): (typeof AREAS)[Area]['to'] {
  const [first] = navFor(user);
  return AREAS[first?.area ?? 'status'].to;
}

export type Access = 'ok' | 'sign-in' | 'change-password' | 'no-access';

/**
 * Whether the session may open a page of `area` (undefined: pages open to
 * everyone signed in, such as their account and notifications). A page that
 * is one of its section's (`page`) must be among the role's pages of it.
 */
export function access(
  session: SessionState,
  area?: Area,
  page?: SubPath,
): Access {
  const { user } = session;
  const open = session.status === 'signedIn' || session.status === 'offline';
  if (!open || !user) return 'sign-in';
  if (session.mustChangePassword) return 'change-password';
  if (!area) return 'ok';
  const section = navFor(user).find((n) => n.area === area);
  if (!section) return 'no-access';
  if (!page || page === AREAS[area].to) return 'ok';
  return section.pages?.some((p) => p.to === page) ? 'ok' : 'no-access';
}

/**
 * Which of a section's pages `pathname` is on: the longest that it starts
 * with, so a person's own page (/people/<id>) counts as the list's.
 */
export function currentPage(
  pages: readonly SubPage[],
  pathname: string,
): SubPage | undefined {
  return pages
    .filter((p) => pathname === p.to || pathname.startsWith(`${p.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];
}

/**
 * Where to go after signing in: back to `target` if this person may open
 * it (it may have been another person's page, before a sign-out), else home.
 */
export function landingFor(user: User, target: string | undefined): string {
  if (!target) return homeOf(user);
  const path = target.split(/[?#]/)[0] ?? target;
  const area = (Object.keys(AREAS) as Area[]).find((a) => {
    const to: string = AREAS[a].to;
    return path === to || path.startsWith(`${to}/`);
  });
  return area && !navFor(user).some((n) => n.area === area)
    ? homeOf(user)
    : target;
}
