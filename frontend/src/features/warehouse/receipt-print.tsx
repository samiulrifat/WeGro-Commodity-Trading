import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReceiptDetailDto } from '@/api/generated/warehouse';
import { Logo } from '@/components/logo';
import { PrintSheet } from '@/components/print-sheet';
import { useFormat } from '@/i18n/use-format';
import { receiptNumber } from './receipt-utils';

/**
 * The receipt on A4 paper for the farmer to keep: what is stored, where,
 * until when, and the QR anyone can scan to check it on WeGro's ledger.
 */
export function ReceiptPrint({
  receipt: r,
  qr,
  onDone,
}: {
  receipt: ReceiptDetailDto;
  qr: string;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const [printedAt] = useState(() => new Date());
  const produce =
    i18n.resolvedLanguage === 'bn' && r.produce.nameBn
      ? r.produce.nameBn
      : r.produce.name;
  const rows: [string, ReactNode][] = [
    [t('warehouse.owner'), r.owner.name],
    [t('warehouse.project'), r.project.name],
    [t('warehouse.produce'), produce],
    [
      t('warehouse.held'),
      t('warehouse.quantityOf', {
        quantity: fmt.number(r.quantity),
        unit: r.produce.unit,
      }),
    ],
    ...(r.intake.bagCount != null
      ? [
          [t('warehouse.bags'), fmt.number(r.intake.bagCount)] as [
            string,
            ReactNode,
          ],
        ]
      : []),
    ...(r.intake.moisturePercent
      ? [
          [
            t('warehouse.moisture'),
            `${fmt.number(r.intake.moisturePercent, 1)}%`,
          ] as [string, ReactNode],
        ]
      : []),
    ...(r.intake.storageBay
      ? [[t('warehouse.bay'), r.intake.storageBay] as [string, ReactNode]]
      : []),
    [t('warehouse.site'), r.site.name],
    [t('warehouse.intakeDate'), fmt.date(r.intake.intakeDate)],
    [t('warehouse.expiresOn'), fmt.date(r.expiresOn)],
    ...(r.issuedAt
      ? [
          [t('warehouse.issuedAt'), fmt.dateTime(r.issuedAt)] as [
            string,
            ReactNode,
          ],
        ]
      : []),
  ];
  return (
    <PrintSheet className="receipt-sheet" onDone={onDone}>
      <article className="grid gap-[8mm] text-[11pt] leading-snug">
        <header className="flex items-start justify-between gap-[6mm] border-b-2 border-black pb-[4mm]">
          <div className="grid gap-[2mm]">
            <Logo className="h-[12mm]" />
            <h1 className="text-[20pt] font-bold">
              {t('warehouse.receiptTitle')}
            </h1>
          </div>
          <div className="text-right">
            <p className="text-[9pt] uppercase">{t('warehouse.receiptNo')}</p>
            <p className="text-[16pt] font-bold">{receiptNumber(r.id)}</p>
          </div>
        </header>
        <div className="grid grid-cols-[minmax(0,1fr)_55mm] gap-[8mm]">
          <dl className="grid content-start">
            {rows.map(([label, value]) => (
              <div
                key={label}
                className="grid grid-cols-[42mm_minmax(0,1fr)] gap-[3mm] border-b border-black/30 py-[2mm]"
              >
                <dt className="text-black/70">{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <figure className="grid content-start justify-items-center gap-[2mm] text-center">
            <img src={qr} alt="" className="size-[50mm]" />
            <figcaption className="text-[9pt]">
              {t('warehouse.scanToCheck')}
            </figcaption>
          </figure>
        </div>
        {r.intake.notes && (
          <section className="grid gap-[1mm]">
            <h2 className="text-[10pt] font-semibold text-black/70">
              {t('warehouse.notes')}
            </h2>
            <p translate="no" className="whitespace-pre-line">
              {r.intake.notes}
            </p>
          </section>
        )}
        <p className="text-[9pt] text-black/70">
          {t('warehouse.receiptTerms')}
        </p>
        <div className="mt-[12mm] grid grid-cols-2 gap-[20mm]">
          <p className="border-t border-black pt-[2mm] text-[10pt]">
            {t('warehouse.signOperator')}
          </p>
          <p className="border-t border-black pt-[2mm] text-[10pt]">
            {t('warehouse.signOwner')}
          </p>
        </div>
        <footer className="text-[8pt] break-all text-black/60">
          {t('warehouse.ledgerId')}: {r.id} ·{' '}
          {t('warehouse.printedOn', { at: fmt.dateTime(printedAt) })}
        </footer>
      </article>
    </PrintSheet>
  );
}
