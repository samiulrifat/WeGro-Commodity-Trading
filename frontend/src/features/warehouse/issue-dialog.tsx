import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useProjectsListQuery } from '@/api/generated/projects';
import {
  useWarehouseIssueMutation,
  useWarehouseListSitesQuery,
} from '@/api/generated/warehouse';
import { FormError } from '@/app/auth/form-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SearchSelect } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { todayBd } from '@/lib/format';
import { dayAfter, moisture, wholeNumber } from './receipt-utils';

/** Default storage term offered: about six months. */
const DEFAULT_TERM_DAYS = 180;
const MAX_QUANTITY = 1_000_000_000_000;

/**
 * An operator records goods coming in at their site and issues the
 * receipt to the project's farmer. Only active projects of produce that
 * can be stored (not fresh produce) take receipts.
 */
export function IssueDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const bengali = i18n.resolvedLanguage === 'bn';
  // Fresh each time it opens: the site may have closed meanwhile.
  const sites = useWarehouseListSitesQuery(
    {},
    { refetchOnMountOrArgChange: true },
  );
  const projects = useProjectsListQuery(
    { stage: 'active', limit: 100 },
    { refetchOnMountOrArgChange: true },
  );
  const [issue, issuing] = useWarehouseIssueMutation();
  const today = todayBd();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [bags, setBags] = useState('');
  const [moist, setMoist] = useState('');
  const [bay, setBay] = useState('');
  const [intakeDate, setIntakeDate] = useState(today);
  const [expiresOn, setExpiresOn] = useState(
    dayAfter(DEFAULT_TERM_DAYS, today),
  );
  const [notes, setNotes] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const site = sites.data?.data[0];
  const storable = useMemo(
    () =>
      (projects.data?.data ?? []).filter((p) => p.category !== 'perishable'),
    [projects.data],
  );
  const options = storable.map((p) => ({
    value: p.id,
    label: `${p.title} · ${p.farmer.fullName}`,
  }));
  const project = storable.find((p) => p.id === projectId);
  const qty = wholeNumber(quantity);
  const bagCount = wholeNumber(bags);
  const moistureValue = moisture(moist);
  const missing = {
    project: !project,
    quantity:
      qty === null || Number.isNaN(qty) || qty < 1 || qty > MAX_QUANTITY,
    bags: bagCount !== null && (Number.isNaN(bagCount) || bagCount < 1),
    moisture: moistureValue === undefined,
    intakeDate: !intakeDate || intakeDate > today,
    expiresOn: !expiresOn || expiresOn <= today || expiresOn < intakeDate,
  };
  const show = (k: keyof typeof missing) => tried && missing[k];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(missing).some(Boolean)) return;
    setError(null);
    try {
      const res = await issue({
        issueReceiptDto: {
          projectId: projectId!,
          quantity: qty!,
          intakeDate,
          expiresOn,
          ...(bagCount ? { bagCount } : {}),
          ...(moistureValue ? { moisturePercent: moistureValue } : {}),
          ...(bay.trim() ? { storageBay: bay.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      }).unwrap();
      toast.success(t('warehouse.issued'));
      onClose();
      void navigate({
        to: '/warehouse/receipts/$receiptId',
        params: { receiptId: res.data.id },
      });
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  const unit = project?.produce.unit ?? '';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('warehouse.issue')}</DialogTitle>
          <DialogDescription>
            {site
              ? t('warehouse.issueText', { site: site.name })
              : t('warehouse.noSite')}
          </DialogDescription>
        </DialogHeader>
        {site?.closed && (
          <Alert variant="destructive">
            <AlertDescription>
              {t('warehouse.siteClosedNoIntake')}
            </AlertDescription>
          </Alert>
        )}
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={show('project') || undefined}>
            <FieldLabel htmlFor="receipt-project">
              {t('warehouse.project')}
            </FieldLabel>
            <SearchSelect
              id="receipt-project"
              options={options}
              value={projectId}
              onValueChange={setProjectId}
              placeholder={t('warehouse.chooseProject')}
              emptyText={t('warehouse.noProjects')}
              invalid={show('project')}
            />
            {show('project') ? (
              <FieldError>{t('warehouse.required.project')}</FieldError>
            ) : (
              project && (
                <FieldDescription>
                  {bengali && project.produce.nameBn
                    ? project.produce.nameBn
                    : project.produce.name}{' '}
                  · {project.location}, {project.district.name}
                </FieldDescription>
              )
            )}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={show('quantity') || undefined}>
              <FieldLabel htmlFor="receipt-quantity">
                {t('warehouse.quantity')}
                {unit && ` (${unit})`}
              </FieldLabel>
              <Input
                id="receipt-quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-invalid={show('quantity') || undefined}
              />
              {show('quantity') && (
                <FieldError>{t('warehouse.required.quantity')}</FieldError>
              )}
            </Field>
            <Field data-invalid={show('bags') || undefined}>
              <FieldLabel htmlFor="receipt-bags">
                {t('warehouse.bags')}
              </FieldLabel>
              <Input
                id="receipt-bags"
                inputMode="numeric"
                value={bags}
                onChange={(e) => setBags(e.target.value)}
                aria-invalid={show('bags') || undefined}
              />
              {show('bags') ? (
                <FieldError>{t('warehouse.required.bags')}</FieldError>
              ) : (
                <FieldDescription>{t('warehouse.optional')}</FieldDescription>
              )}
            </Field>
            <Field data-invalid={show('moisture') || undefined}>
              <FieldLabel htmlFor="receipt-moisture">
                {t('warehouse.moisture')}
              </FieldLabel>
              <Input
                id="receipt-moisture"
                inputMode="decimal"
                value={moist}
                onChange={(e) => setMoist(e.target.value)}
                aria-invalid={show('moisture') || undefined}
              />
              {show('moisture') ? (
                <FieldError>{t('warehouse.required.moisture')}</FieldError>
              ) : (
                <FieldDescription>{t('warehouse.optional')}</FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="receipt-bay">
                {t('warehouse.bay')}
              </FieldLabel>
              <Input
                id="receipt-bay"
                maxLength={40}
                value={bay}
                onChange={(e) => setBay(e.target.value)}
              />
              <FieldDescription>{t('warehouse.optional')}</FieldDescription>
            </Field>
            <Field data-invalid={show('intakeDate') || undefined}>
              <FieldLabel htmlFor="receipt-intake">
                {t('warehouse.intakeDate')}
              </FieldLabel>
              <Input
                id="receipt-intake"
                type="date"
                max={today}
                value={intakeDate}
                onChange={(e) => setIntakeDate(e.target.value)}
                aria-invalid={show('intakeDate') || undefined}
              />
              {show('intakeDate') && (
                <FieldError>{t('warehouse.required.intakeDate')}</FieldError>
              )}
            </Field>
            <Field data-invalid={show('expiresOn') || undefined}>
              <FieldLabel htmlFor="receipt-expires">
                {t('warehouse.expiresOn')}
              </FieldLabel>
              <Input
                id="receipt-expires"
                type="date"
                min={dayAfter(1, today)}
                value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
                aria-invalid={show('expiresOn') || undefined}
              />
              {show('expiresOn') ? (
                <FieldError>{t('warehouse.required.expiresOn')}</FieldError>
              ) : (
                <FieldDescription>
                  {t('warehouse.expiresHint')}
                </FieldDescription>
              )}
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="receipt-notes">
              {t('warehouse.notes')}
            </FieldLabel>
            <Textarea
              id="receipt-notes"
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={issuing.isLoading || !site || site.closed}
            >
              {issuing.isLoading
                ? t('people.actions.working')
                : t('warehouse.issue')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
