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

export interface NavItem {
  area: Area;
  label: NavLabel;
}

const item = (area: Area, label: NavLabel): NavItem => ({ area, label });

const OFFICE: NavItem[] = [
  item('dashboard', 'dashboard'),
  item('projects', 'projects'),
  item('people', 'people'),
  item('vouchers', 'vouchers'),
  item('warehouse', 'warehouse'),
  item('marketplace', 'marketplace'),
  item('insurance', 'insurance'),
  item('payouts', 'payouts'),
  item('track-records', 'trackRecords'),
  item('catalog', 'catalog'),
  item('audit', 'audit'),
  item('system', 'system'),
];

/**
 * What each role sees, in order; the first is where they land after
 * signing in. Areas not listed are refused (the backend refuses the calls
 * behind them too, or they are not this role's work).
 */
export const NAV: Record<Role, readonly NavItem[]> = {
  super_admin: OFFICE,
  admin: OFFICE,
  operations: [
    item('dashboard', 'dashboard'),
    item('projects', 'projects'),
    item('vouchers', 'vouchers'),
    item('catalog', 'catalog'),
    item('marketplace', 'marketplace'),
    item('warehouse', 'warehouse'),
    item('insurance', 'insurance'),
  ],
  accounts: [
    item('dashboard', 'dashboard'),
    item('projects', 'projects'),
    item('vouchers', 'vouchers'),
    item('payouts', 'payouts'),
    item('marketplace', 'marketplace'),
    item('warehouse', 'warehouse'),
    item('insurance', 'insurance'),
  ],
  auditor: [
    item('dashboard', 'dashboard'),
    item('audit', 'audit'),
    item('projects', 'projects'),
    item('people', 'people'),
    item('vouchers', 'vouchers'),
    item('warehouse', 'warehouse'),
    item('marketplace', 'marketplace'),
    item('insurance', 'insurance'),
    item('payouts', 'payouts'),
    item('track-records', 'trackRecords'),
    item('system', 'system'),
  ],
  field_officer: [
    item('farm-updates', 'farmUpdates'),
    item('people', 'farmers'),
    item('projects', 'projects'),
    item('vouchers', 'vouchers'),
    item('warehouse', 'warehouse'),
    item('marketplace', 'marketplace'),
    item('insurance', 'insurance'),
    item('track-records', 'trackRecords'),
  ],
  farmer: [
    item('projects', 'myProjects'),
    item('vouchers', 'vouchers'),
    item('warehouse', 'warehouse'),
    item('marketplace', 'marketplace'),
    item('insurance', 'insurance'),
    item('statement', 'statement'),
    item('track-records', 'trackRecord'),
  ],
  investor: [
    item('projects', 'projects'),
    item('holdings', 'holdings'),
    item('statement', 'statement'),
  ],
  supplier: [item('vouchers', 'vouchersSales'), item('batches', 'batches')],
  warehouse: [
    item('warehouse', 'receipts'),
    item('marketplace', 'marketplace'),
  ],
  buyer: [
    item('marketplace', 'marketplace'),
    item('offers', 'offers'),
    item('requests', 'requests'),
    item('warehouse', 'receipts'),
  ],
  bank: [item('bank-farmers', 'farmers')],
  insurer: [item('insurance', 'insurance')],
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
 * everyone signed in, such as their account and notifications).
 */
export function access(session: SessionState, area?: Area): Access {
  const { user } = session;
  const open = session.status === 'signedIn' || session.status === 'offline';
  if (!open || !user) return 'sign-in';
  if (session.mustChangePassword) return 'change-password';
  if (!area) return 'ok';
  return navFor(user).some((n) => n.area === area) ? 'ok' : 'no-access';
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
