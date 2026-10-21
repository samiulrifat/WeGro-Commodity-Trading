import { Link } from '@tanstack/react-router';
import {
  CloudUpload,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useCatalogGetQuery } from '@/api/generated/catalog';
import { useOnline } from '@/app/pwa/online';
import { PageHeader } from '@/components/page-header';
import { SearchBox } from '@/components/search-box';
import { StatusPill } from '@/components/status-pill';
import { EmptyState, LoadingState } from '@/components/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useFormat } from '@/i18n/use-format';
import { drafts } from '@/lib/drafts';
import { useDrafts } from '@/lib/use-drafts';
import type { FarmUpdateData, FarmUpdateDraft } from './draft';
import { useObjectUrl, useSendNow } from './hooks';
import { Rejection } from './new-update-page';

/**
 * Farm updates kept on this phone: waiting to be sent, or refused and to
 * be fixed. They leave only when sent or when the officer deletes them.
 */
export function DraftsPage() {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const catalog = useCatalogGetQuery({});
  const { drafts: list, loading } = useDrafts<FarmUpdateData>('farm-update');
  const { send, sending } = useSendNow();
  const [q, setQ] = useState<string | undefined>();
  const bengali = i18n.resolvedLanguage === 'bn';
  const typeName = (code: string) => {
    const x = catalog.data?.data.fieldRecordTypes.find((r) => r.code === code);
    return x ? (bengali ? x.nameBn : x.name) : code;
  };
  const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const shown = list.filter((d) => {
    const text =
      `${d.data.projectTitle} ${d.data.farmerName} ${typeName(d.data.entryTypeCode)}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const toFix = list.filter((d) => d.rejection).length;

  async function sendNow() {
    const s = await send().catch(() => null);
    if (!s || s.offline) toast.error(t('farmUpdates.couldNotSend'));
    else if (s.sent > 0)
      toast.success(t('farmUpdates.sentCount', { count: s.sent }));
    else if (s.rejected > 0) toast.error(t('farmUpdates.needsFixingToast'));
    else toast(t('farmUpdates.stillWaiting'));
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('nav.sub.updateDrafts')}
        description={t('farmUpdates.draftsIntro')}
        actions={
          <Link to="/farm-updates" className={buttonVariants()}>
            <Plus /> {t('nav.sub.newUpdate')}
          </Link>
        }
      />
      {list.length > 0 && (
        <Alert>
          {online ? <CloudUpload /> : <WifiOff />}
          <AlertTitle>
            {t('farmUpdates.waitingCount', { count: list.length - toFix })}
            {toFix > 0 && ` · ${t('farmUpdates.toFixCount', { count: toFix })}`}
          </AlertTitle>
          <AlertDescription className="grid gap-3">
            {online
              ? t('farmUpdates.sendsItself')
              : t('farmUpdates.offlineWaiting')}
            <Button
              className="w-fit"
              disabled={!online || sending}
              onClick={() => void sendNow()}
            >
              <CloudUpload />{' '}
              {sending ? t('farmUpdates.sending') : t('farmUpdates.sendNow')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {list.length > 0 && (
        <SearchBox
          className="lg:max-w-xl"
          value={q}
          onSearch={setQ}
          placeholder={t('farmUpdates.searchDrafts')}
        />
      )}
      {loading && <LoadingState />}
      {!loading && list.length === 0 && (
        <EmptyState
          icon={NotebookPen}
          title={t('farmUpdates.noDrafts')}
          description={t('farmUpdates.noDraftsHint')}
        />
      )}
      {list.length > 0 && shown.length === 0 && (
        <EmptyState icon={NotebookPen} title={t('farmUpdates.noDraftMatch')} />
      )}
      <ul className="grid gap-3">
        {shown.map((d) => (
          <li key={d.id}>
            <DraftCard draft={d} typeName={typeName(d.data.entryTypeCode)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DraftCard({
  draft: d,
  typeName,
}: {
  draft: FarmUpdateDraft;
  typeName: string;
}) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const photo = useObjectUrl(d.photos[0]);
  const [deleting, setDeleting] = useState(false);
  return (
    <article className="grid gap-3 rounded-2xl border bg-card p-4 shadow-xs sm:grid-cols-[6rem_minmax(0,1fr)]">
      <div className="size-24 overflow-hidden rounded-xl bg-muted">
        {photo && <img src={photo} alt="" className="size-full object-cover" />}
      </div>
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">{typeName}</h3>
          <StatusPill
            tone={d.rejection ? 'danger' : 'warning'}
            appearance="soft"
          >
            {d.rejection
              ? t('farmUpdates.needsFixing')
              : t('farmUpdates.waitingToSend')}
          </StatusPill>
          {d.data.correctsEntryId && (
            <StatusPill tone="neutral" appearance="soft">
              {t('farmUpdates.correction')}
            </StatusPill>
          )}
        </div>
        <p className="text-sm">
          <span className="font-medium">{d.data.projectTitle}</span>
          <span className="text-muted-foreground"> · {d.data.farmerName}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {t('farmUpdates.observedOn', { at: fmt.dateTime(d.data.observedAt) })}{' '}
          · {t('farmUpdates.savedOn', { at: fmt.relative(d.updatedAt) })}
        </p>
        {d.rejection && <Rejection rejection={d.rejection} />}
        <div className="flex flex-wrap gap-2">
          <Link
            to="/farm-updates"
            search={{ draft: d.id }}
            className={buttonVariants({
              variant: d.rejection ? 'default' : 'outline',
              size: 'sm',
            })}
          >
            <Pencil />{' '}
            {d.rejection ? t('farmUpdates.fix') : t('farmUpdates.edit')}
          </Link>
          <Button variant="ghost" size="sm" onClick={() => setDeleting(true)}>
            <Trash2 /> {t('farmUpdates.delete')}
          </Button>
        </div>
      </div>
      {deleting && (
        <Dialog open onOpenChange={(o) => !o && setDeleting(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('farmUpdates.deleteTitle')}</DialogTitle>
              <DialogDescription>
                {t('farmUpdates.deleteText')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleting(false)}>
                {t('catalog.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  void drafts.remove(d.id).then(() => {
                    toast.success(t('farmUpdates.deleted'));
                  })
                }
              >
                <Trash2 /> {t('farmUpdates.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </article>
  );
}
