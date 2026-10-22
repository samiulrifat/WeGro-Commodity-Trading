import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import {
  type FeeSlabDto,
  useTradeFeesQuery,
  useTradeSetFeesMutation,
} from '@/api/generated/marketplace';
import { FormError } from '@/app/auth/form-error';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toPoisha, toTaka, typedTaka } from '@/features/projects/project-math';
import { useFormat } from '@/i18n/use-format';
import { useAppSelector } from '@/store/hooks';
import { feeFor } from './market-utils';

/** As many slabs as the ledger keeps. */
const MAX_SLABS = 20;

/**
 * The platform fee: a fixed amount per side, chosen by the deal total.
 * Buyers pay it on every deal, outside sellers on theirs. The super admin
 * changes the slabs; a deal keeps the fee from when it was approved.
 */
export function FeesPage() {
  const { t } = useTranslation();
  const role = useAppSelector((s) => s.session.user!.role);
  const query = useTradeFeesQuery();
  const [editing, setEditing] = useState(false);
  const slabs = query.data?.data.slabs;
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.platformFees')}
        description={t('market.feesIntro')}
        actions={
          role === 'super_admin' &&
          slabs &&
          !editing && (
            <Button onClick={() => setEditing(true)}>
              <Pencil /> {t('market.editFees')}
            </Button>
          )
        }
      />
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {slabs && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          {editing ? (
            <EditSlabs slabs={slabs} onDone={() => setEditing(false)} />
          ) : (
            <SlabTable slabs={slabs} />
          )}
          <div className="grid gap-6">
            <WhoPays />
            <Calculator slabs={slabs} />
          </div>
        </div>
      )}
    </div>
  );
}

/** "Up to ৳5,000", "৳5,000.01 to ৳25,000", "Above ৳5,00,000". */
function useRange() {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (slabs: readonly FeeSlabDto[], i: number) => {
    const s = slabs[i]!;
    const before = i > 0 ? slabs[i - 1]!.upTo : null;
    if (s.upTo == null) {
      return before
        ? t('market.feeAbove', { amount: fmt.taka(before) })
        : t('market.feeAny');
    }
    return before
      ? t('market.feeBetween', {
          from: fmt.taka(toTaka(toPoisha(before) + 1n)),
          to: fmt.taka(s.upTo),
        })
      : t('market.feeUpTo', { amount: fmt.taka(s.upTo) });
  };
}

function SlabTable({ slabs }: { slabs: readonly FeeSlabDto[] }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const range = useRange();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('market.feeSlabs')}</CardTitle>
        <CardDescription>{t('market.feeSlabsText')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('market.dealTotal')}</TableHead>
              <TableHead className="text-right">
                {t('market.feePerSide')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slabs.map((s, i) => (
              <TableRow key={s.upTo ?? 'last'}>
                <TableCell>{range(slabs, i)}</TableCell>
                <TableCell className="text-right font-semibold">
                  {fmt.taka(s.fee)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function WhoPays() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('market.whoPays')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <p>{t('market.whoPaysWegro')}</p>
        <p>{t('market.whoPaysSeller')}</p>
        <p className="text-muted-foreground">{t('market.whoPaysFixed')}</p>
      </CardContent>
    </Card>
  );
}

/** What a deal of a given total would pay, by today's slabs. */
function Calculator({ slabs }: { slabs: readonly FeeSlabDto[] }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [total, setTotal] = useState('');
  const amount = typedTaka(total);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('market.feeCalculator')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="fee-total">{t('market.dealTotal')}</FieldLabel>
          <Input
            id="fee-total"
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
          <FieldDescription>
            {amount
              ? t('market.feeResult', {
                  fee: fmt.taka(feeFor(amount, slabs)),
                })
              : t('market.feeCalculatorHint')}
          </FieldDescription>
        </Field>
      </CardContent>
    </Card>
  );
}

interface Draft {
  key: number;
  upTo: string;
  fee: string;
}

/** The super admin's slabs: rising limits, a fee each, the last without a limit. */
function EditSlabs({
  slabs,
  onDone,
}: {
  slabs: readonly FeeSlabDto[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [save, saving] = useTradeSetFeesMutation();
  const [rows, setRows] = useState<Draft[]>(() =>
    slabs.map((s, i) => ({
      key: i,
      upTo: s.upTo?.replace(/\.00$/, '') ?? '',
      fee: s.fee.replace(/\.00$/, ''),
    })),
  );
  const [next, setNext] = useState(slabs.length);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const last = rows.length - 1;
  const caps = rows.map((r, i) => (i === last ? null : typedTaka(r.upTo)));
  const fees = rows.map((r) => typedTaka(r.fee));
  const badCap = (i: number) => {
    if (i === last) return false;
    const cap = caps[i];
    if (!cap || cap === '0') return true;
    const prev = i > 0 ? caps[i - 1] : null;
    return prev != null && toPoisha(cap) <= toPoisha(prev);
  };
  const badFee = (i: number) => fees[i] == null;
  const invalid = rows.some((_, i) => badCap(i) || badFee(i));

  const update = (key: number, patch: Partial<Draft>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (invalid) return;
    setError(null);
    try {
      await save({
        setFeeSlabsDto: {
          slabs: rows.map((_, i) => ({ upTo: caps[i] ?? null, fee: fees[i]! })),
        },
      }).unwrap();
      toast.success(t('market.feesSaved'));
      onDone();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('market.editFees')}</CardTitle>
        <CardDescription>{t('market.editFeesText')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-4"
        >
          <ol className="grid gap-3">
            {rows.map((r, i) => (
              <li
                key={r.key}
                className="grid grid-cols-[1fr_1fr_auto] items-end gap-3"
              >
                <Field data-invalid={(tried && badCap(i)) || undefined}>
                  <FieldLabel htmlFor={`slab-cap-${r.key}`}>
                    {i === last ? t('market.slabLast') : t('market.slabUpTo')}
                  </FieldLabel>
                  <Input
                    id={`slab-cap-${r.key}`}
                    inputMode="decimal"
                    disabled={i === last}
                    value={i === last ? t('market.noLimit') : r.upTo}
                    onChange={(e) => update(r.key, { upTo: e.target.value })}
                    aria-invalid={(tried && badCap(i)) || undefined}
                  />
                </Field>
                <Field data-invalid={(tried && badFee(i)) || undefined}>
                  <FieldLabel htmlFor={`slab-fee-${r.key}`}>
                    {t('market.feePerSide')}
                  </FieldLabel>
                  <Input
                    id={`slab-fee-${r.key}`}
                    inputMode="decimal"
                    value={r.fee}
                    onChange={(e) => update(r.key, { fee: e.target.value })}
                    aria-invalid={(tried && badFee(i)) || undefined}
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('market.removeSlab')}
                  disabled={rows.length === 1}
                  onClick={() =>
                    setRows((rs) => rs.filter((x) => x.key !== r.key))
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ol>
          {tried && invalid && (
            <p className="text-sm text-danger">{t('market.slabsInvalid')}</p>
          )}
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={rows.length >= MAX_SLABS}
            onClick={() => {
              // A new slab goes before the last, which has no limit.
              setRows((rs) => [
                ...rs.slice(0, -1),
                { key: next, upTo: '', fee: '' },
                ...rs.slice(-1),
              ]);
              setNext((n) => n + 1);
            }}
          >
            <Plus /> {t('market.addSlab')}
          </Button>
          <FormError error={error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onDone}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={saving.isLoading}>
              {saving.isLoading
                ? t('people.actions.working')
                : t('market.saveFees')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
