import { useNavigate } from '@tanstack/react-router';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, toApiError } from '@/api/errors';
import {
  type ProjectDto,
  useProjectsReserveMutation,
} from '@/api/generated/projects';
import { FormError } from '@/app/auth/form-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useFormat } from '@/i18n/use-format';
import { useAppSelector } from '@/store/hooks';
import { maxUnits, simulate } from './project-math';

/** Units up and down, between 1 and what is free. */
function Stepper({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted p-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-12 rounded-xl bg-card"
        aria-label={t('projects.fewer')}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus />
      </Button>
      <div className="text-center" aria-live="polite">
        <p className="text-2xl font-bold">{fmt.number(value)}</p>
        <p className="text-xs text-muted-foreground">
          {t('projects.unitsWord', { count: value })}
        </p>
      </div>
      <Button
        type="button"
        size="icon"
        className="size-12 rounded-xl"
        aria-label={t('projects.more')}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus />
      </Button>
    </div>
  );
}

/** How many units, what they cost and the estimated profit and value at the end. */
export function Simulator({ project: p }: { project: ProjectDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const max = maxUnits(p);
  const [units, setUnits] = useState(1);
  const n = Math.min(Math.max(units, 1), Math.max(max, 1));
  const s = simulate(p, n);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('projects.simulate')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <p className="font-semibold">{t('projects.howMany')}</p>
            <p className="text-sm text-muted-foreground">
              {t('projects.pricePerUnit', { price: fmt.taka(p.slotPrice) })}
            </p>
          </div>
          <p className="text-2xl font-bold text-brand">{fmt.taka(s.invest)}</p>
        </div>
        <Stepper value={n} max={Math.max(max, 1)} onChange={setUnits} />
        <p className="flex justify-between text-xs text-muted-foreground">
          <span>{t('projects.minUnits', { count: 1 })}</span>
          <span>{t('projects.maxUnits', { count: max })}</span>
        </p>
        <dl className="grid grid-cols-3 divide-x rounded-xl border text-center">
          <div className="grid gap-0.5 p-3">
            <dt className="text-xs text-muted-foreground">
              {t('projects.youInvest')}
            </dt>
            <dd className="font-bold">{fmt.takaShort(s.invest)}</dd>
          </div>
          <div className="grid gap-0.5 bg-success-soft p-3">
            <dt className="text-xs text-muted-foreground">
              {t('projects.profit')}
            </dt>
            <dd className="font-bold text-success">
              {fmt.takaShort(s.profitMin)}–{fmt.takaShort(s.profitMax)}
            </dd>
          </div>
          <div className="grid gap-0.5 p-3">
            <dt className="text-xs text-muted-foreground">
              {t('projects.after', { count: p.durationMonths })}
            </dt>
            <dd className="font-bold">
              {fmt.takaShort(s.valueMin)}–{fmt.takaShort(s.valueMax)}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          {t('projects.estimateNote')}
        </p>
      </CardContent>
    </Card>
  );
}

/** Stays at the foot of the page: the price of a unit, and Invest Now. */
export function InvestBar({ project: p }: { project: ProjectDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="fixed inset-x-0 bottom-16 z-30 px-4 md:bottom-4 md:left-auto md:w-[28rem]">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-ink p-3 pl-5 text-white shadow-lg">
          <div>
            <p className="text-xs text-white/70">
              {t('projects.minInvestment')}
            </p>
            <p className="font-bold">
              {t('projects.perUnitPrice', { price: fmt.taka(p.slotPrice) })}
            </p>
          </div>
          <Button
            className="min-h-12 rounded-xl bg-nav-active px-6 text-ink hover:bg-wegro-leaf"
            onClick={() => setOpen(true)}
          >
            {t('projects.investNow')}
          </Button>
        </div>
      </div>
      {open && <InvestDialog project={p} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Choose units and book them: held for the investor to pay. */
function InvestDialog({
  project: p,
  onClose,
}: {
  project: ProjectDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const navigate = useNavigate();
  const me = useAppSelector((s) => s.session.user!);
  const [units, setUnits] = useState(1);
  const [reserve, reserving] = useProjectsReserveMutation();
  const [error, setError] = useState<ApiError | null>(null);
  const s = simulate(p, units);

  async function book() {
    setError(null);
    try {
      const res = await reserve({
        id: p.id,
        reserveSlotsDto: { slots: units },
      }).unwrap();
      onClose();
      void navigate({
        to: '/holdings/bookings/$bookingId',
        params: { bookingId: String(res.data.id) },
      });
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('projects.bookTitle')}</DialogTitle>
          <DialogDescription>{t('projects.bookText')}</DialogDescription>
        </DialogHeader>
        <p className="font-semibold">{p.title}</p>
        <Stepper value={units} max={maxUnits(p)} onChange={setUnits} />
        <div className="flex items-baseline justify-between rounded-xl bg-muted p-4">
          <span>{t('projects.totalToPay')}</span>
          <span className="text-xl font-bold">{fmt.taka(s.invest)}</span>
        </div>
        {me.status !== 'verified' && (
          <p className="text-sm text-danger">{t('projects.verifyFirst')}</p>
        )}
        <FormError error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('catalog.cancel')}
          </Button>
          <Button disabled={reserving.isLoading} onClick={() => void book()}>
            {reserving.isLoading
              ? t('projects.booking')
              : t('projects.bookUnits')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
