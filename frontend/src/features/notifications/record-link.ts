import type { NotificationDto } from '@/api/generated/notifications';
import { mayOpen } from '@/app/navigation';
import type { SessionState } from '@/store/session-slice';

type User = NonNullable<SessionState['user']>;

/** Pages everyone signed in may open, outside any section. */
const OPEN = new Set(['/account']);

/**
 * Where a notification's record is, for this reader: the first of its
 * places they may open (a buyer sees a deal where an admin does; a payee
 * sees their statement instead of the payout round). Null when none.
 */
export function recordLink(
  n: Pick<NotificationDto, 'kind' | 'subject'>,
  user: User,
): string | null {
  const s = n.subject;
  const own = s?.id === user.id;
  const places: string[] = !s
    ? n.kind.startsWith('system.')
      ? ['/system']
      : []
    : ((
        {
          participant: own ? ['/account'] : [`/people/${s.id}`],
          // Staff review a requested change; its owner hears the decision.
          'detail-change':
            n.kind === 'details.change-requested'
              ? [`/people/changes/${s.id}`]
              : ['/account'],
          reservation: [`/holdings/bookings/${s.id}`, '/projects/payments'],
          project: [`/projects/${s.id}`],
          voucher: [`/vouchers/${s.id}`],
          'voucher-sale': ['/vouchers/sales'],
          receipt: [`/warehouse/receipts/${s.id}`],
          site: ['/warehouse/sites', '/warehouse'],
          listing: [`/marketplace/listings/${s.id}`],
          offer: [`/marketplace/deals/${s.id}`, '/offers'],
          request: ['/marketplace/requests', '/requests'],
          'insured-project': [`/insurance/projects/${s.id}`, '/insurance'],
          claim: [`/insurance/claims/${s.id}`],
          'weather-event': ['/insurance/weather-events'],
          round: [`/payouts/rounds/${s.id}`, '/statement'],
          'track-record': own
            ? ['/track-records']
            : [`/track-records/farmers/${s.id}`],
          consent: ['/track-records/permissions', '/track-records'],
          'bank-farmer': [`/bank/farmers/${s.id}`],
          bank: ['/bank/farmers'],
        } as Record<string, string[]>
      )[s.type] ?? []);
  return places.find((p) => OPEN.has(p) || mayOpen(user, p)) ?? null;
}
