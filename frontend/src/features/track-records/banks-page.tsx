import { Building2, Plus, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import type { District } from '@/api/generated/codes';
import {
  type BankDto,
  useTrackRecordAssignOfficerMutation,
  useTrackRecordListBanksQuery,
  useTrackRecordRegisterBankMutation,
} from '@/api/generated/track-record';
import { FormError } from '@/app/auth/form-error';
import { actsAs } from '@/app/navigation';
import { PageHeader } from '@/components/page-header';
import { SearchBox } from '@/components/search-box';
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { MarketSearch } from '@/features/marketplace/market-utils';
import { OfficerPicker } from '@/features/people/officer-picker';
import { useDistrictOptions } from '@/features/people/use-district-options';
import { useAppSelector } from '@/store/hooks';
import { useNavigate } from '@tanstack/react-router';
import { useDistrictName } from '@/features/insurance/use-names';

/**
 * The banks that may be given permission to see farmers' track records,
 * with their officers. An admin registers banks and places bank officers.
 */
export function BanksPage({ search }: { search: MarketSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAppSelector((s) => s.session.user!.role);
  const admin = actsAs(role, 'admin');
  const [adding, setAdding] = useState(false);
  const query = useTrackRecordListBanksQuery(
    { q: search.q },
    { refetchOnMountOrArgChange: true },
  );
  const banks = query.data?.data ?? [];
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.banks')}
        description={t('trackRecords.banksIntro')}
        actions={
          admin && (
            <Button onClick={() => setAdding(true)}>
              <Plus /> {t('trackRecords.registerBank')}
            </Button>
          )
        }
      />
      <SearchBox
        className="lg:max-w-xl"
        value={search.q}
        onSearch={(q) =>
          void navigate({
            to: '/track-records/banks',
            search: { ...search, q },
          })
        }
        placeholder={t('trackRecords.searchBanks')}
      />
      {query.isLoading && <LoadingState />}
      {query.error && (
        <ErrorState
          error={toApiError(query.error)!}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && banks.length === 0 && (
        <EmptyState
          icon={Building2}
          title={
            search.q ? t('trackRecords.noBankMatch') : t('trackRecords.noBanks')
          }
          description={search.q ? t('projects.noMatchHint') : undefined}
        />
      )}
      {banks.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {banks.map((b) => (
            <li key={b.id}>
              <BankCard bank={b} admin={admin} />
            </li>
          ))}
        </ul>
      )}
      {adding && <RegisterDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

function BankCard({ bank: b, admin }: { bank: BankDto; admin: boolean }) {
  const districtName = useDistrictName();
  const { t } = useTranslation();
  const [placing, setPlacing] = useState(false);
  const [assign] = useTrackRecordAssignOfficerMutation();
  const officers = b.officers ?? [];
  return (
    <article className="grid gap-3 rounded-2xl border bg-card p-4 shadow-xs">
      <div className="grid gap-0.5">
        <h3 className="font-bold leading-snug">{b.name}</h3>
        <p className="text-sm text-muted-foreground">
          {b.branchName} · {districtName(b.district)}
        </p>
        <p translate="no" className="text-sm text-muted-foreground">
          {b.address}
        </p>
      </div>
      <div className="grid gap-1.5">
        <p className="text-sm font-semibold">
          {t('trackRecords.bankOfficers')}
        </p>
        {officers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('trackRecords.noOfficers')}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {officers.map((o) => (
              <li
                key={o.id}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border pr-1 pl-3 text-sm"
              >
                {o.name}
                {admin && (
                  <button
                    type="button"
                    aria-label={t('trackRecords.removeOfficer', {
                      name: o.name,
                    })}
                    className="grid size-7 place-items-center rounded-full outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                    onClick={() => {
                      assign({
                        officerId: o.id,
                        assignBankOfficerDto: { bankId: null },
                      })
                        .unwrap()
                        .then(() =>
                          toast.success(t('trackRecords.officerRemoved')),
                        )
                        .catch((e) =>
                          toast.error(
                            toApiError(e as never)?.messages[0] ?? '',
                          ),
                        );
                    }}
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {admin && (
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={() => setPlacing(true)}
        >
          <Plus /> {t('trackRecords.addOfficer')}
        </Button>
      )}
      {placing && <PlaceDialog bank={b} onClose={() => setPlacing(false)} />}
    </article>
  );
}

function PlaceDialog({
  bank: b,
  onClose,
}: {
  bank: BankDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [assign, assigning] = useTrackRecordAssignOfficerMutation();
  const [officerId, setOfficerId] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    if (!officerId) return;
    setError(null);
    try {
      await assign({
        officerId,
        assignBankOfficerDto: { bankId: b.id },
      }).unwrap();
      toast.success(t('trackRecords.officerAdded'));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('trackRecords.addOfficer')}</DialogTitle>
          <DialogDescription>
            {t('trackRecords.addOfficerText', {
              bank: `${b.name}, ${b.branchName}`,
            })}
          </DialogDescription>
        </DialogHeader>
        <OfficerPicker
          open
          personRole="bank"
          exclude={(b.officers ?? []).map((o) => o.id)}
          value={officerId}
          onChange={setOfficerId}
          placeholder={t('trackRecords.findOfficer')}
        />
        <FormError error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('catalog.cancel')}
          </Button>
          <Button
            disabled={!officerId || assigning.isLoading}
            onClick={() => void go()}
          >
            {assigning.isLoading
              ? t('people.actions.working')
              : t('trackRecords.addOfficer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegisterDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const districts = useDistrictOptions();
  const [register, registering] = useTrackRecordRegisterBankMutation();
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('');
  const [district, setDistrict] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const missing = {
    name: !name.trim(),
    branch: !branch.trim(),
    district: !district,
    address: !address.trim(),
  };
  const show = (k: keyof typeof missing) => tried && missing[k];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(missing).some(Boolean)) return;
    setError(null);
    try {
      await register({
        registerBankDto: {
          name: name.trim(),
          branchName: branch.trim(),
          districtCode: district as District,
          address: address.trim(),
        },
      }).unwrap();
      toast.success(t('trackRecords.bankRegistered'));
      onClose();
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('trackRecords.registerBank')}</DialogTitle>
          <DialogDescription>
            {t('trackRecords.registerBankText')}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={show('name') || undefined}>
            <FieldLabel htmlFor="bank-name">
              {t('trackRecords.bankName')}
            </FieldLabel>
            <Input
              id="bank-name"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {show('name') && (
              <FieldError>{t('trackRecords.required.bankName')}</FieldError>
            )}
          </Field>
          <Field data-invalid={show('branch') || undefined}>
            <FieldLabel htmlFor="bank-branch">
              {t('trackRecords.branch')}
            </FieldLabel>
            <Input
              id="bank-branch"
              maxLength={120}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
            {show('branch') && (
              <FieldError>{t('trackRecords.required.branch')}</FieldError>
            )}
          </Field>
          <Field data-invalid={show('district') || undefined}>
            <FieldLabel htmlFor="bank-district">
              {t('market.district')}
            </FieldLabel>
            <SearchSelect
              id="bank-district"
              options={districts}
              value={district}
              onValueChange={setDistrict}
              placeholder={t('person.chooseDistrict')}
              emptyText={t('insurance.noDistrict')}
              invalid={show('district')}
            />
            {show('district') && (
              <FieldError>{t('market.required.district')}</FieldError>
            )}
          </Field>
          <Field data-invalid={show('address') || undefined}>
            <FieldLabel htmlFor="bank-address">
              {t('trackRecords.address')}
            </FieldLabel>
            <Textarea
              id="bank-address"
              maxLength={300}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            {show('address') && (
              <FieldError>{t('trackRecords.required.address')}</FieldError>
            )}
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={registering.isLoading}>
              {registering.isLoading
                ? t('people.actions.working')
                : t('trackRecords.registerBank')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
