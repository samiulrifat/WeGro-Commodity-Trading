import { Role } from '../users/roles';
import { queuesFor } from './dashboard-queues';
import { lastMonths, monthAfter, percent } from './dashboard.service';

describe('dashboard maths', () => {
  it('gives percentages with one decimal, rounded down, never dividing by zero', () => {
    expect(percent(1n, 3n)).toBe('33.3');
    expect(percent(2n, 3n)).toBe('66.6');
    expect(percent(5n, 5n)).toBe('100.0');
    expect(percent(0n, 7n)).toBe('0.0');
    expect(percent(3n, 0n)).toBe('0.0');
  });

  it('counts twelve months back across the year end', () => {
    expect(lastMonths('2026-02', 12)).toEqual([
      '2025-03',
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(monthAfter('2026-12')).toBe('2027-01');
  });
});

describe('queues by role', () => {
  const keys = (role: Role) => queuesFor(role).map((q) => q.key);

  it('gives the super admin and the auditor every queue', () => {
    const all = keys(Role.SuperAdmin);
    expect(all).toHaveLength(14);
    expect(keys(Role.Auditor)).toEqual(all);
  });

  it('gives Accounts the money queues', () => {
    expect(keys(Role.Accounts)).toEqual([
      'reservations.pending',
      'vouchers.proposed',
      'deals.awaiting-payment',
      'rounds.awaiting-approval',
      'rounds.unpaid',
      'projects.ready-for-settlement',
    ]);
  });

  it('gives Operations the input queues', () => {
    expect(keys(Role.Operations)).toEqual([
      'vouchers.proposed',
      'voucher-sales.pending',
      'vouchers.inactive',
    ]);
  });

  it('shows an admin only the non-staff registrations they can verify', () => {
    const [participants] = queuesFor(Role.Admin);
    expect(participants.key).toBe('participants.pending');
    expect(participants.count).toContain('NOT IN');
    expect(queuesFor(Role.SuperAdmin)[0].count).not.toContain('NOT IN');
    expect(keys(Role.Admin)).toHaveLength(14);
  });
});
