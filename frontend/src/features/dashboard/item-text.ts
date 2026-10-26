import { useTranslation } from 'react-i18next';
import { useCatalogGetQuery } from '@/api/generated/catalog';
import type { QueueItemDto } from '@/api/generated/dashboard';
import { useFormat } from '@/i18n/use-format';
import type { QueueKey } from './queues';

type Params = QueueItemDto['params'];

const str = (p: Params, k: string) => {
  const v = p[k];
  return v === null || v === undefined ? '' : String(v);
};
const num = (p: Params, k: string) => Number(p[k] ?? 0);

/**
 * One waiting item in the reader's language, from its queue and values:
 * "Offer #12: 2,000 kg Maize at ৳31.00/kg". Crop and input names and their
 * units come from the catalog; a code stands in until it has loaded.
 */
export function useItemText() {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const catalog = useCatalogGetQuery({}).data?.data;
  const bengali = i18n.resolvedLanguage === 'bn';

  const unitOf = (code: string) =>
    catalog?.units.find((u) => u.code === code)?.symbol ?? '';
  const produce = (code: string) => {
    const p = catalog?.produceTypes.find((x) => x.code === code);
    return {
      name: p ? (bengali ? p.nameBn : p.name) : code,
      unit: p ? unitOf(p.unitCode) : '',
    };
  };
  const input = (code: string) => {
    const x = catalog?.inputTypes.find((i) => i.code === code);
    return {
      name: x ? (bengali ? x.nameBn : x.name) : code,
      unit: x ? unitOf(x.unitCode) : '',
    };
  };
  const amount = (value: string, unit: string) =>
    unit ? `${fmt.number(value)} ${unit}` : fmt.number(value);

  return (key: QueueKey, p: Params): string => {
    switch (key) {
      case 'participants.pending': {
        const role = str(p, 'role');
        return t('dashboard.item.registration', {
          role: t(`roles.${role}` as 'roles.farmer', { defaultValue: role }),
        });
      }
      case 'bank-accounts.pending':
        return p.change
          ? t('dashboard.item.bankChange')
          : t('dashboard.item.bankNew');
      case 'reservations.pending':
        return t('dashboard.item.reservation', {
          id: str(p, 'id'),
          count: num(p, 'slots'),
          n: fmt.number(num(p, 'slots')),
        });
      case 'vouchers.proposed': {
        const i = input(str(p, 'input'));
        return t('dashboard.item.voucherProposed', {
          quantity: amount(str(p, 'quantity'), i.unit),
          input: i.name,
          value: fmt.taka(str(p, 'value')),
        });
      }
      case 'voucher-sales.pending': {
        const i = input(str(p, 'input'));
        return t('dashboard.item.inputSale', {
          id: str(p, 'id'),
          quantity: amount(str(p, 'quantity'), i.unit),
          input: i.name,
        });
      }
      case 'vouchers.inactive': {
        const i = input(str(p, 'input'));
        return t('dashboard.item.voucherInactive', {
          quantity: amount(str(p, 'quantity'), i.unit),
          input: i.name,
          count: num(p, 'days'),
          n: fmt.number(num(p, 'days')),
        });
      }
      case 'offers.pending': {
        const c = produce(str(p, 'produce'));
        const price = fmt.taka(str(p, 'unitPrice'));
        return t('dashboard.item.offer', {
          id: str(p, 'id'),
          quantity: amount(str(p, 'quantity'), c.unit),
          produce: c.name,
          price: c.unit ? `${price}/${c.unit}` : price,
        });
      }
      case 'deals.awaiting-payment': {
        const c = produce(str(p, 'produce'));
        return t('dashboard.item.dealUnpaid', {
          id: str(p, 'id'),
          quantity: amount(str(p, 'quantity'), c.unit),
          produce: c.name,
        });
      }
      case 'deliveries.discrepancy': {
        const c = produce(str(p, 'produce'));
        const side = (k: string) =>
          p[k] === null || p[k] === undefined
            ? t('dashboard.item.notYet')
            : amount(str(p, k), c.unit);
        return t('dashboard.item.delivery', {
          id: str(p, 'id'),
          quantity: amount(str(p, 'quantity'), c.unit),
          buyer: side('buyer'),
          handler: side('handler'),
        });
      }
      case 'handovers.pending': {
        const c = produce(str(p, 'produce'));
        return t('dashboard.item.handover', {
          receipt: str(p, 'receipt'),
          quantity: amount(str(p, 'quantity'), c.unit),
          produce: c.name,
        });
      }
      case 'rounds.awaiting-approval':
        return t(
          p.final ? 'dashboard.item.roundFinal' : 'dashboard.item.roundStaged',
          {
            id: str(p, 'id'),
            count: num(p, 'payees'),
            n: fmt.number(num(p, 'payees')),
          },
        );
      case 'rounds.unpaid':
        return t('dashboard.item.roundUnpaid', {
          id: str(p, 'id'),
          paid: fmt.number(num(p, 'paid')),
          payees: fmt.number(num(p, 'payees')),
        });
      case 'projects.ready-for-settlement':
        return t('dashboard.item.finalDue', {
          produce: produce(str(p, 'produce')).name,
        });
      case 'claims.open': {
        const status = str(p, 'status');
        return t('dashboard.item.claimOpen', {
          status: t(
            `insurance.claimStatus.${status}` as 'insurance.claimStatus.triggered',
            {
              defaultValue: status,
            },
          ),
          damage: fmt.number(str(p, 'damage')),
        });
      }
      case 'claims.payment-due':
        return t('dashboard.item.claimPaymentDue', {
          amount: fmt.taka(str(p, 'amount')),
        });
    }
  };
}
