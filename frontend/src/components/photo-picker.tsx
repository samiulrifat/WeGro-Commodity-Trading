import { ImagePlus, X } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useObjectUrl } from '@/features/farm-updates/hooks';
import { type PickedPhoto, usePhotoPicks } from '@/lib/use-photo-picks';
import { cn } from '@/lib/utils';

/** Tiles of the picked photos and a tile to add more. */
export function PhotoPicker({
  picks,
  invalid = false,
}: {
  picks: ReturnType<typeof usePhotoPicks>;
  invalid?: boolean;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {picks.photos.map((p) => (
          <PhotoTile
            key={p.key}
            photo={p}
            onRemove={() => picks.remove(p.key)}
          />
        ))}
        {picks.photos.length < picks.max && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className={cn(
              'grid aspect-square place-items-center rounded-xl border-2 border-dashed text-sm font-semibold text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
              invalid && 'border-danger',
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
        onChange={(e) => {
          const files = e.target.files;
          void picks.add(files).then(() => {
            if (input.current) input.current.value = '';
          });
        }}
      />
    </>
  );
}

function PhotoTile({
  photo,
  onRemove,
}: {
  photo: PickedPhoto;
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
