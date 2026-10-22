import { useNavigate } from '@tanstack/react-router';
import { ImagePlus, X } from 'lucide-react';
import { type FormEvent, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { usePhotoUploadMutation } from '@/api/files';
import { useCatalogGetQuery } from '@/api/generated/catalog';
import type { District } from '@/api/generated/codes';
import {
  useTradeListExternalMutation,
  useTradeListProduceMutation,
  useTradeListReceiptMutation,
} from '@/api/generated/marketplace';
import { useProjectsListQuery } from '@/api/generated/projects';
import { useWarehouseListQuery } from '@/api/generated/warehouse';
import { FormError } from '@/app/auth/form-error';
import { actsAs } from '@/app/navigation';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useObjectUrl } from '@/features/farm-updates/hooks';
import { shrinkPhoto } from '@/features/farm-updates/photo';
import { useDistrictOptions } from '@/features/people/use-district-options';
import { typedTaka } from '@/features/projects/project-math';
import { receiptNumber } from '@/features/warehouse/receipt-utils';
import { useFormat } from '@/i18n/use-format';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import {
  MAX_PHOTOS,
  produceName,
  validQuantity,
  wholeNumber,
} from './market-utils';

/** A photo picked for a listing, sent to the server as soon as it is chosen. */
interface Picked {
  key: number;
  blob: Blob;
  id: string | null;
  failed: boolean;
}

/**
 * An outside seller lists their own produce: a catalog crop, how much in
 * its unit, the price per unit, where it is, a few words and one to three
 * photos. An admin approves it before buyers see it.
 */
export function SellerListingDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const bengali = i18n.resolvedLanguage === 'bn';
  const catalog = useCatalogGetQuery({});
  const districts = useDistrictOptions();
  const [list, listing] = useTradeListExternalMutation();
  const [upload] = usePhotoUploadMutation();
  const [produce, setProduce] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [district, setDistrict] = useState<District | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const keys = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  const options = useMemo(
    () =>
      (catalog.data?.data.produceTypes ?? [])
        .filter((p) => p.active)
        .map((p) => ({ value: p.code, label: bengali ? p.nameBn : p.name })),
    [catalog.data, bengali],
  );
  const type = catalog.data?.data.produceTypes.find((p) => p.code === produce);
  const unit =
    catalog.data?.data.units.find((u) => u.code === type?.unitCode)?.symbol ??
    '';
  const qty = wholeNumber(quantity);
  const unitPrice = typedTaka(price);
  const uploading = photos.some((p) => !p.id && !p.failed);
  const missing = {
    produce: !produce,
    quantity: !validQuantity(qty),
    price: !unitPrice || unitPrice === '0',
    district: !district,
    photos: photos.filter((p) => p.id).length === 0,
  };
  const show = (k: keyof typeof missing) => tried && missing[k];

  async function add(files: FileList | null) {
    const room = MAX_PHOTOS - photos.length;
    for (const file of Array.from(files ?? []).slice(0, room)) {
      const key = ++keys.current;
      const blob = await shrinkPhoto(file);
      setPhotos((ps) => [...ps, { key, blob, id: null, failed: false }]);
      upload({ body: { file: blob } })
        .unwrap()
        .then((res) =>
          setPhotos((ps) =>
            ps.map((p) => (p.key === key ? { ...p, id: res.data.id } : p)),
          ),
        )
        .catch(() =>
          setPhotos((ps) =>
            ps.map((p) => (p.key === key ? { ...p, failed: true } : p)),
          ),
        );
    }
    if (input.current) input.current.value = '';
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (uploading || Object.values(missing).some(Boolean)) return;
    setError(null);
    try {
      const res = await list({
        listExternalDto: {
          produceCode: produce!,
          quantity: qty!,
          askingUnitPrice: unitPrice!,
          districtCode: district!,
          ...(description.trim() ? { description: description.trim() } : {}),
          photoIds: photos.flatMap((p) => (p.id ? [p.id] : [])),
        },
      }).unwrap();
      toast.success(t('market.listedExternal'));
      onClose();
      void navigate({
        to: '/marketplace/listings/$listingId',
        params: { listingId: String(res.data.id) },
      });
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('market.newListing')}</DialogTitle>
          <DialogDescription>{t('market.newExternalText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={show('produce') || undefined}>
            <FieldLabel htmlFor="listing-produce">
              {t('market.produce')}
            </FieldLabel>
            <SearchSelect
              id="listing-produce"
              options={options}
              value={produce}
              onValueChange={setProduce}
              placeholder={t('market.chooseProduce')}
              emptyText={t('market.noProduce')}
              invalid={show('produce')}
            />
            {show('produce') && (
              <FieldError>{t('market.required.produce')}</FieldError>
            )}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={show('quantity') || undefined}>
              <FieldLabel htmlFor="listing-quantity">
                {t('market.quantity')}
                {unit && ` (${unit})`}
              </FieldLabel>
              <Input
                id="listing-quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-invalid={show('quantity') || undefined}
              />
              {show('quantity') && (
                <FieldError>{t('market.required.quantity')}</FieldError>
              )}
            </Field>
            <Field data-invalid={show('price') || undefined}>
              <FieldLabel htmlFor="listing-price">
                {t('market.askingPrice')}
              </FieldLabel>
              <Input
                id="listing-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-invalid={show('price') || undefined}
              />
              {show('price') ? (
                <FieldError>{t('market.required.price')}</FieldError>
              ) : (
                <FieldDescription>{t('market.priceHint')}</FieldDescription>
              )}
            </Field>
          </div>
          <Field data-invalid={show('district') || undefined}>
            <FieldLabel htmlFor="listing-district">
              {t('market.district')}
            </FieldLabel>
            <Select
              items={districts}
              value={district}
              onValueChange={(v) => setDistrict((v as District | null) ?? null)}
            >
              <SelectTrigger
                id="listing-district"
                className="w-full"
                aria-invalid={show('district') || undefined}
              >
                <SelectValue placeholder={t('person.chooseDistrict')} />
              </SelectTrigger>
              <SelectContent>
                {districts.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {show('district') ? (
              <FieldError>{t('market.required.district')}</FieldError>
            ) : (
              <FieldDescription>{t('market.districtHint')}</FieldDescription>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="listing-description">
              {t('market.description')}
            </FieldLabel>
            <Textarea
              id="listing-description"
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <FieldDescription>{t('market.descriptionHint')}</FieldDescription>
          </Field>
          <Field data-invalid={show('photos') || undefined}>
            <FieldLabel>{t('market.photos')}</FieldLabel>
            <div className="grid grid-cols-3 gap-3">
              {photos.map((p) => (
                <PhotoTile
                  key={p.key}
                  photo={p}
                  onRemove={() =>
                    setPhotos((ps) => ps.filter((x) => x.key !== p.key))
                  }
                />
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  className={cn(
                    'grid aspect-square place-items-center rounded-xl border-2 border-dashed text-sm font-semibold text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                    show('photos') && 'border-danger',
                  )}
                >
                  <span className="grid justify-items-center gap-1">
                    <ImagePlus aria-hidden className="size-6" />
                    {t('market.addPhoto')}
                  </span>
                </button>
              )}
            </div>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => void add(e.target.files)}
            />
            {show('photos') ? (
              <FieldError>{t('market.required.photos')}</FieldError>
            ) : (
              <FieldDescription>
                {t('market.photosHint', { count: MAX_PHOTOS })}
              </FieldDescription>
            )}
          </Field>
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            {t('market.sellerFeeNote')}
          </p>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={listing.isLoading || uploading}>
              {listing.isLoading || uploading
                ? t('people.actions.working')
                : t('market.sendForApproval')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PhotoTile({
  photo,
  onRemove,
}: {
  photo: Picked;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const url = useObjectUrl(photo.blob);
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
      {url && (
        <img
          src={url}
          alt=""
          className={cn(
            'size-full object-cover',
            !photo.id && !photo.failed && 'opacity-60',
          )}
        />
      )}
      {photo.failed && (
        <p className="absolute inset-x-0 bottom-0 bg-danger px-2 py-1 text-xs font-semibold text-white">
          {t('market.photoFailed')}
        </p>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('market.removePhoto')}
        className="absolute top-1 right-1 grid size-8 place-items-center rounded-full bg-ink/80 text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}

type Kind = 'receipt' | 'fresh';

/**
 * WeGro's side lists produce: a warehouse receipt it holds (an admin for
 * WeGro's own, the farmer's officer for the farmer's), or fresh produce
 * straight from an active project. Live at once; WeGro decides the offers.
 */
export function NewListingDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const fmt = useFormat();
  const bengali = i18n.resolvedLanguage === 'bn';
  const role = useAppSelector((s) => s.session.user!.role);
  const [kind, setKind] = useState<Kind>('receipt');
  const receipts = useWarehouseListQuery(
    { status: 'issued', limit: 100 },
    { refetchOnMountOrArgChange: true },
  );
  const projects = useProjectsListQuery(
    { stage: 'active', limit: 100 },
    { refetchOnMountOrArgChange: true },
  );
  const [listReceipt, listingReceipt] = useTradeListReceiptMutation();
  const [listProduce, listingProduce] = useTradeListProduceMutation();
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // An admin lists WeGro's own receipts; an officer their farmers'.
  const ownSide = actsAs(role, 'admin') ? 'wegro' : 'farmer';
  const held = useMemo(
    () =>
      (receipts.data?.data ?? []).filter(
        (r) => r.owner.kind === ownSide && !r.expired,
      ),
    [receipts.data, ownSide],
  );
  const fresh = useMemo(
    () =>
      (projects.data?.data ?? []).filter((p) => p.category === 'perishable'),
    [projects.data],
  );
  const receipt = held.find((r) => r.id === receiptId);
  const project = fresh.find((p) => p.id === projectId);
  const qty = wholeNumber(quantity);
  const unitPrice = typedTaka(price);
  const missing = {
    receipt: kind === 'receipt' && !receipt,
    project: kind === 'fresh' && !project,
    quantity: kind === 'fresh' && !validQuantity(qty),
    price: !unitPrice || unitPrice === '0',
  };
  const show = (k: keyof typeof missing) => tried && missing[k];
  const busy = listingReceipt.isLoading || listingProduce.isLoading;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(missing).some(Boolean)) return;
    setError(null);
    try {
      const res =
        kind === 'receipt'
          ? await listReceipt({
              listReceiptDto: {
                receiptId: receiptId!,
                askingUnitPrice: unitPrice!,
              },
            }).unwrap()
          : await listProduce({
              listProduceDto: {
                projectId: projectId!,
                quantity: qty!,
                askingUnitPrice: unitPrice!,
              },
            }).unwrap();
      toast.success(t('market.listed'));
      onClose();
      void navigate({
        to: '/marketplace/listings/$listingId',
        params: { listingId: String(res.data.id) },
      });
    } catch (err) {
      setError(toApiError(err as never));
    }
  }

  const unit = (kind === 'receipt' ? receipt : project)?.produce.unit ?? '';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('market.newListing')}</DialogTitle>
          <DialogDescription>{t('market.newListingText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="sr-only">{t('market.listWhat')}</legend>
            {(['receipt', 'fresh'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  'min-h-11 rounded-lg border px-3 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  kind === k
                    ? 'border-ink bg-ink text-white'
                    : 'bg-card hover:bg-muted',
                )}
              >
                {t(`market.kind.${k}`)}
              </button>
            ))}
          </fieldset>
          {kind === 'receipt' ? (
            <Field data-invalid={show('receipt') || undefined}>
              <FieldLabel htmlFor="listing-receipt">
                {t('market.receipt')}
              </FieldLabel>
              <SearchSelect
                id="listing-receipt"
                options={held.map((r) => ({
                  value: r.id,
                  label: `${receiptNumber(r.id)} · ${produceName(r.produce, bengali)} · ${fmt.number(r.quantity)} ${r.produce.unit} · ${r.owner.name}`,
                }))}
                value={receiptId}
                onValueChange={setReceiptId}
                placeholder={t('market.chooseReceipt')}
                emptyText={t('market.noReceipts')}
                invalid={show('receipt')}
              />
              {show('receipt') ? (
                <FieldError>{t('market.required.receipt')}</FieldError>
              ) : (
                <FieldDescription>
                  {receipt
                    ? `${receipt.site.name} · ${receipt.project.name}`
                    : t('market.receiptHint')}
                </FieldDescription>
              )}
            </Field>
          ) : (
            <>
              <Field data-invalid={show('project') || undefined}>
                <FieldLabel htmlFor="listing-project">
                  {t('warehouse.project')}
                </FieldLabel>
                <SearchSelect
                  id="listing-project"
                  options={fresh.map((p) => ({
                    value: p.id,
                    label: `${p.title} · ${p.farmer.fullName}`,
                  }))}
                  value={projectId}
                  onValueChange={setProjectId}
                  placeholder={t('warehouse.chooseProject')}
                  emptyText={t('market.noFreshProjects')}
                  invalid={show('project')}
                />
                {show('project') ? (
                  <FieldError>{t('warehouse.required.project')}</FieldError>
                ) : (
                  <FieldDescription>
                    {project
                      ? `${produceName(project.produce, bengali)} · ${project.district.name}`
                      : t('market.freshHint')}
                  </FieldDescription>
                )}
              </Field>
              <Field data-invalid={show('quantity') || undefined}>
                <FieldLabel htmlFor="listing-quantity">
                  {t('market.quantity')}
                  {unit && ` (${unit})`}
                </FieldLabel>
                <Input
                  id="listing-quantity"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  aria-invalid={show('quantity') || undefined}
                />
                {show('quantity') && (
                  <FieldError>{t('market.required.quantity')}</FieldError>
                )}
              </Field>
            </>
          )}
          <Field data-invalid={show('price') || undefined}>
            <FieldLabel htmlFor="listing-price">
              {t('market.askingPrice')}
              {unit && ` (${t('market.perUnitOf', { unit })})`}
            </FieldLabel>
            <Input
              id="listing-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              aria-invalid={show('price') || undefined}
            />
            {show('price') ? (
              <FieldError>{t('market.required.price')}</FieldError>
            ) : (
              <FieldDescription>{t('market.priceHint')}</FieldDescription>
            )}
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t('people.actions.working') : t('market.list')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
