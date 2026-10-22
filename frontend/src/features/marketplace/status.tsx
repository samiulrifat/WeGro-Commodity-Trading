import { useTranslation } from 'react-i18next';
import type { ListingDto, OfferDto } from '@/api/generated/marketplace';
import { StatusPill } from '@/components/status-pill';

const LISTING_TONE = {
  pending: 'warning',
  open: 'success',
  sold_out: 'neutral',
  cancelled: 'neutral',
  rejected: 'danger',
} as const;

/** Where a listing stands, and where its goods come from. */
export function ListingStatus({
  listing: l,
  source = true,
}: {
  listing: Pick<ListingDto, 'status' | 'source'>;
  source?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap gap-1.5">
      <StatusPill tone={LISTING_TONE[l.status]} appearance="soft">
        {t(`market.listingStatus.${l.status}`)}
      </StatusPill>
      {source && (
        <StatusPill tone="neutral" appearance="soft">
          {t(`market.source.${l.source}`)}
        </StatusPill>
      )}
    </span>
  );
}

const OFFER_TONE = {
  pending: 'warning',
  approved: 'warning',
  paid: 'warning',
  delivered: 'success',
  seller_paid: 'success',
  withdrawn: 'neutral',
  rejected: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
} as const;

/** Where an offer or deal stands, flagged when late or the counts differ. */
export function OfferStatus({
  offer: o,
}: {
  offer: Pick<OfferDto, 'status' | 'overdue' | 'discrepancy' | 'external'>;
}) {
  const { t } = useTranslation();
  // Delivered ends WeGro's own deals; an outside seller still waits for their payout.
  const waiting = o.status === 'delivered' && o.external;
  return (
    <span className="flex flex-wrap gap-1.5">
      <StatusPill
        tone={waiting ? 'warning' : OFFER_TONE[o.status]}
        appearance="soft"
      >
        {waiting ? t('market.payoutDue') : t(`market.offerStatus.${o.status}`)}
      </StatusPill>
      {o.status === 'approved' && o.overdue && (
        <StatusPill tone="danger" appearance="soft">
          {t('market.overdue')}
        </StatusPill>
      )}
      {o.discrepancy && (
        <StatusPill tone="danger" appearance="soft">
          {t('market.mismatch')}
        </StatusPill>
      )}
    </span>
  );
}
