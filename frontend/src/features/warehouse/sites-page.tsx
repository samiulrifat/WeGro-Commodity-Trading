import { useNavigate } from '@tanstack/react-router';
import { Building2, Pencil, Plus, UserMinus, UserPlus } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useCatalogGetQuery } from '@/api/generated/catalog';
import { useParticipantsListQuery } from '@/api/generated/participants';
import {
  type CreateSiteDto,
  type SiteDto,
  useWarehouseAssignOperatorMutation,
  useWarehouseCloseSiteMutation,
  useWarehouseCreateSiteMutation,
  useWarehouseListSitesQuery,
  useWarehouseReopenSiteMutation,
  useWarehouseUpdateSiteMutation,
} from '@/api/generated/warehouse';
import { FormError } from '@/app/auth/form-error';
import { PageHeader } from '@/components/page-header';
import { SearchBox } from '@/components/search-box';
import { StatusPill } from '@/components/status-pill';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { actsAs } from '@/app/navigation';
import { type SiteListSearch, wholeNumber } from './receipt-utils';
import { useDistrictName } from '@/features/insurance/use-names';

type SiteMove = 'close' | 'reopen';
const STATES = ['all', 'open', 'closed'] as const;

/**
 * The warehouses and cold stores WeGro works with. Admins add them, keep
 * their details current, close them to new goods, and say who works where.
 */
export function SitesPage({ search }: { search: SiteListSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user!.role);
  const admin = actsAs(role, 'admin');
  const query = useWarehouseListSitesQuery({
    q: search.q,
    state: search.state,
  });
  const [editing, setEditing] = useState<SiteDto | 'new' | null>(null);
  const set = (patch: Partial<SiteListSearch>) =>
    void navigate({ to: '/warehouse/sites', search: { ...search, ...patch } });
  const state = search.state ?? 'all';
  const operator = role === 'warehouse';

  return (
    <div className="grid gap-6">
      <PageHeader
        title={operator ? t('nav.sub.mySite') : t('nav.sub.sites')}
        description={t(
          `warehouse.sitesIntro.${admin ? 'admin' : operator ? 'operator' : 'other'}`,
        )}
        actions={
          admin && (
            <Button onClick={() => setEditing('new')}>
              <Plus /> {t('warehouse.addSite')}
            </Button>
          )
        }
      />
      {!operator && (
        <>
          <div
            role="tablist"
            aria-label={t('warehouse.siteState')}
            className="flex gap-2"
          >
            {STATES.map((x) => (
              <button
                key={x}
                type="button"
                role="tab"
                aria-selected={state === x}
                onClick={() => set({ state: x === 'all' ? undefined : x })}
                className={cn(
                  'min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  state === x
                    ? 'border-ink bg-ink text-white'
                    : 'bg-card hover:bg-muted',
                )}
              >
                {t(`warehouse.siteTab.${x}`)}
              </button>
            ))}
          </div>
          <SearchBox
            className="lg:max-w-xl"
            value={search.q}
            onSearch={(q) => set({ q })}
            placeholder={t('warehouse.searchSites')}
          />
        </>
      )}
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && query.data.data.length === 0 && (
        <EmptyState
          icon={Building2}
          title={
            search.q
              ? t('warehouse.noSiteMatch')
              : operator
                ? t('warehouse.noOwnSite')
                : t('warehouse.noSites')
          }
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      <ul className="grid gap-4 md:grid-cols-2">
        {(query.data?.data ?? []).map((s) => (
          <li key={s.id}>
            <SiteCard site={s} admin={admin} onEdit={() => setEditing(s)} />
          </li>
        ))}
      </ul>
      {editing && (
        <SiteForm
          site={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SiteCard({
  site: s,
  admin,
  onEdit,
}: {
  site: SiteDto;
  admin: boolean;
  onEdit: () => void;
}) {
  const districtName = useDistrictName();
  const { t } = useTranslation();
  const fmt = useFormat();
  const [move, setMove] = useState<SiteMove | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(
    null,
  );
  return (
    <article className="grid gap-3 rounded-2xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold">{s.name}</h3>
        <StatusPill
          tone={
            s.closed
              ? 'neutral'
              : s.status === 'registered'
                ? 'success'
                : 'warning'
          }
          appearance="soft"
        >
          {s.closed
            ? t('warehouse.siteClosed')
            : t(`warehouse.siteStatus.${s.status}`)}
        </StatusPill>
      </div>
      <p className="text-sm text-muted-foreground">
        {t(`warehouse.storageType.${s.storageType}`)} ·{' '}
        {districtName({ code: s.districtCode, name: s.districtName })}
        {s.capacityKg != null &&
          ` · ${t('warehouse.capacityOf', { kg: fmt.number(s.capacityKg) })}`}
      </p>
      <p translate="no" className="text-sm">
        {s.address}
      </p>
      {s.closed && s.closedAt && (
        <p className="text-sm text-muted-foreground">
          {t('warehouse.closedSince', { at: fmt.date(s.closedAt) })}
        </p>
      )}
      <div className="grid gap-1.5">
        <p className="text-sm font-medium">{t('warehouse.operators')}</p>
        {s.operators.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('warehouse.noOperators')}
          </p>
        ) : (
          <ul className="grid gap-1">
            {s.operators.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>{o.name}</span>
                {admin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemoving(o)}
                  >
                    <UserMinus /> {t('warehouse.removeOperator')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {admin && s.status === 'registered' && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil /> {t('warehouse.editSite')}
          </Button>
          {!s.closed && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <UserPlus /> {t('warehouse.addOperator')}
            </Button>
          )}
          <Button
            variant={s.closed ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => setMove(s.closed ? 'reopen' : 'close')}
          >
            {s.closed ? t('warehouse.reopenSite') : t('warehouse.closeSite')}
          </Button>
        </div>
      )}
      {move && (
        <SiteMoveDialog site={s} move={move} onClose={() => setMove(null)} />
      )}
      {adding && (
        <AddOperatorDialog site={s} onClose={() => setAdding(false)} />
      )}
      {removing && (
        <RemoveOperatorDialog
          site={s}
          operator={removing}
          onClose={() => setRemoving(null)}
        />
      )}
    </article>
  );
}

/** Adds a site, or changes one (only the details that changed are sent). */
function SiteForm({
  site,
  onClose,
}: {
  site: SiteDto | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const catalog = useCatalogGetQuery({});
  const [create, creating] = useWarehouseCreateSiteMutation();
  const [update, updating] = useWarehouseUpdateSiteMutation();
  const [name, setName] = useState(site?.name ?? '');
  const [district, setDistrict] = useState<string | null>(
    site?.districtCode ?? null,
  );
  const [address, setAddress] = useState(site?.address ?? '');
  const [type, setType] = useState<CreateSiteDto['storageType']>(
    site?.storageType ?? 'warehouse',
  );
  const [capacity, setCapacity] = useState(
    site?.capacityKg != null ? String(site.capacityKg) : '',
  );
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const districts = useMemo(
    () =>
      (catalog.data?.data.districts ?? []).map((d) => ({
        value: d.code,
        label: d.name,
      })),
    [catalog.data],
  );
  const cap = wholeNumber(capacity);
  const missing = {
    name: name.trim().length < 2,
    district: !district,
    address: address.trim().length < 5,
    capacity: cap !== null && (Number.isNaN(cap) || cap < 1),
  };
  const show = (k: keyof typeof missing) => tried && missing[k];
  const busy = creating.isLoading || updating.isLoading;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(missing).some(Boolean)) return;
    setError(null);
    const values = {
      name: name.trim(),
      districtCode: district!,
      address: address.trim(),
      storageType: type,
      capacityKg: cap,
    };
    try {
      if (!site) {
        await create({
          createSiteDto: {
            ...values,
            capacityKg: cap ?? undefined,
          } as CreateSiteDto,
        }).unwrap();
        toast.success(t('warehouse.siteAdded'));
      } else {
        const changed = Object.fromEntries(
          Object.entries(values).filter(
            ([k, v]) => site[k as keyof SiteDto] !== v,
          ),
        );
        if (Object.keys(changed).length > 0) {
          await update({ id: site.id, updateSiteDto: changed }).unwrap();
        }
        toast.success(t('warehouse.siteSaved'));
      }
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {site ? t('warehouse.editSite') : t('warehouse.addSite')}
          </DialogTitle>
          <DialogDescription>
            {site ? t('warehouse.editSiteText') : t('warehouse.addSiteText')}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={show('name') || undefined}>
            <FieldLabel htmlFor="site-name">
              {t('warehouse.siteName')}
            </FieldLabel>
            <Input
              id="site-name"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={show('name') || undefined}
            />
            {show('name') && (
              <FieldError>{t('warehouse.required.siteName')}</FieldError>
            )}
          </Field>
          <Field data-invalid={show('district') || undefined}>
            <FieldLabel htmlFor="site-district">
              {t('warehouse.district')}
            </FieldLabel>
            <SearchSelect
              id="site-district"
              options={districts}
              value={district}
              onValueChange={setDistrict}
              placeholder={t('warehouse.chooseDistrict')}
              emptyText={t('bank.noMatch')}
              invalid={show('district')}
            />
            {show('district') && (
              <FieldError>{t('warehouse.required.district')}</FieldError>
            )}
          </Field>
          <Field data-invalid={show('address') || undefined}>
            <FieldLabel htmlFor="site-address">
              {t('warehouse.address')}
            </FieldLabel>
            <Input
              id="site-address"
              maxLength={300}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              aria-invalid={show('address') || undefined}
            />
            {show('address') && (
              <FieldError>{t('warehouse.required.address')}</FieldError>
            )}
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">
              {t('warehouse.storage')}
            </legend>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as CreateSiteDto['storageType'])}
              className="grid gap-2 sm:grid-cols-2"
            >
              {(['warehouse', 'cold_storage'] as const).map((x) => (
                <Field
                  key={x}
                  orientation="horizontal"
                  className="rounded-lg border px-3 py-2"
                >
                  <RadioGroupItem id={`site-type-${x}`} value={x} />
                  <FieldLabel
                    htmlFor={`site-type-${x}`}
                    className="font-normal"
                  >
                    {t(`warehouse.storageType.${x}`)}
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
          </fieldset>
          <Field data-invalid={show('capacity') || undefined}>
            <FieldLabel htmlFor="site-capacity">
              {t('warehouse.capacity')}
            </FieldLabel>
            <Input
              id="site-capacity"
              inputMode="numeric"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              aria-invalid={show('capacity') || undefined}
            />
            {show('capacity') ? (
              <FieldError>{t('warehouse.required.capacity')}</FieldError>
            ) : (
              <FieldDescription>{t('warehouse.optional')}</FieldDescription>
            )}
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? t('people.actions.working')
                : site
                  ? t('warehouse.saveSite')
                  : t('warehouse.addSite')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SiteMoveDialog({
  site: s,
  move,
  onClose,
}: {
  site: SiteDto;
  move: SiteMove;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [close, closing] = useWarehouseCloseSiteMutation();
  const [reopen, reopening] = useWarehouseReopenSiteMutation();
  const [error, setError] = useState<ApiError | null>(null);
  const busy = closing.isLoading || reopening.isLoading;
  async function go() {
    setError(null);
    try {
      await (
        move === 'close' ? close({ id: s.id }) : reopen({ id: s.id })
      ).unwrap();
      toast.success(t(`warehouse.siteMoved.${move}`, { name: s.name }));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(`warehouse.siteMoveTitle.${move}`, { name: s.name })}
          </DialogTitle>
          <DialogDescription>
            {t(`warehouse.siteMoveText.${move}`)}
          </DialogDescription>
        </DialogHeader>
        <FormError error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('catalog.cancel')}
          </Button>
          <Button
            variant={move === 'close' ? 'destructive' : 'default'}
            disabled={busy}
            onClick={() => void go()}
          >
            {busy
              ? t('people.actions.working')
              : move === 'close'
                ? t('warehouse.closeSite')
                : t('warehouse.reopenSite')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Puts a verified warehouse operator at this site (moving them from any other). */
function AddOperatorDialog({
  site: s,
  onClose,
}: {
  site: SiteDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState<string | undefined>();
  const people = useParticipantsListQuery({
    role: 'warehouse',
    status: 'verified',
    q,
    limit: 50,
  });
  const [assign, assigning] = useWarehouseAssignOperatorMutation();
  const [error, setError] = useState<ApiError | null>(null);
  const here = new Set(s.operators.map((o) => o.id));
  const choices = (people.data?.data ?? []).filter((p) => !here.has(p.id));

  async function pick(id: string, name: string) {
    setError(null);
    try {
      await assign({
        operatorId: id,
        assignOperatorDto: { siteId: s.id },
      }).unwrap();
      toast.success(t('warehouse.operatorAdded', { name, site: s.name }));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('warehouse.addOperatorTo', { site: s.name })}
          </DialogTitle>
          <DialogDescription>
            {t('warehouse.addOperatorText')}
          </DialogDescription>
        </DialogHeader>
        <SearchBox
          value={q}
          onSearch={setQ}
          placeholder={t('vouchers.findSupplier')}
        />
        {people.isLoading && <LoadingState />}
        {people.data && choices.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('warehouse.noOperatorChoices')}
          </p>
        )}
        <ul className="grid max-h-72 gap-1.5 overflow-y-auto">
          {choices.map((p) => (
            <li key={p.id}>
              <Button
                variant="outline"
                className="w-full justify-start"
                disabled={assigning.isLoading}
                onClick={() => void pick(p.id, p.fullName)}
              >
                <UserPlus /> {p.fullName}
              </Button>
            </li>
          ))}
        </ul>
        <FormError error={error} />
      </DialogContent>
    </Dialog>
  );
}

function RemoveOperatorDialog({
  site: s,
  operator,
  onClose,
}: {
  site: SiteDto;
  operator: { id: string; name: string };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [assign, assigning] = useWarehouseAssignOperatorMutation();
  const [error, setError] = useState<ApiError | null>(null);
  async function go() {
    setError(null);
    try {
      await assign({
        operatorId: operator.id,
        assignOperatorDto: { siteId: null },
      }).unwrap();
      toast.success(t('warehouse.operatorRemoved', { name: operator.name }));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('warehouse.removeOperatorTitle', {
              name: operator.name,
              site: s.name,
            })}
          </DialogTitle>
          <DialogDescription>
            {t('warehouse.removeOperatorText')}
          </DialogDescription>
        </DialogHeader>
        <FormError error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('catalog.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={assigning.isLoading}
            onClick={() => void go()}
          >
            {assigning.isLoading
              ? t('people.actions.working')
              : t('warehouse.removeOperator')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
