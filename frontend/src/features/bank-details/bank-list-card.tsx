import { Upload } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import { useBankListImportMutation } from '@/api/files';
import { useBankListStatusQuery } from '@/api/generated/bank-list';
import { FormError } from '@/app/auth/form-error';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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

/**
 * The official list payees pick their branch from: how big it is, where it
 * came from, and importing a new one in its place.
 */
export function BankListCard() {
  const { t } = useTranslation();
  const query = useBankListStatusQuery();
  const [open, setOpen] = useState(false);
  const status = query.data?.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('bank.list.title')}</CardTitle>
        <CardDescription className="col-start-1">
          {t('bank.list.intro')}
        </CardDescription>
        <CardAction>
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Upload /> {t('bank.list.import')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-1">
        {query.isLoading && <LoadingState />}
        {query.error && (
          <ErrorState
            error={toApiError(query.error)!}
            onRetry={() => void query.refetch()}
          />
        )}
        {status && status.branchCount === 0 && (
          <p className="text-muted-foreground">{t('bank.list.empty')}</p>
        )}
        {status && status.branchCount > 0 && (
          <>
            <p className="font-medium">
              {t('bank.list.counts', {
                banks: status.bankCount,
                branches: status.branchCount,
                districts: status.districtCount,
              })}
            </p>
            {status.importedAt && (
              <p className="text-sm text-muted-foreground">
                {status.importedBy
                  ? t('bank.list.uploaded', {
                      name: status.importedBy.name,
                      at: status.importedAt,
                    })
                  : t('bank.list.bundled', { at: status.importedAt })}
              </p>
            )}
          </>
        )}
      </CardContent>
      <ImportDialog open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

function ImportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [send, sending] = useBankListImportMutation();
  const [branches, setBranches] = useState<File | null>(null);
  const [districts, setDistricts] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  function close() {
    setBranches(null);
    setDistricts(null);
    setTried(false);
    setError(null);
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (!branches) return;
    setError(null);
    try {
      const done = await send({
        body: { branches, ...(districts ? { districts } : {}) },
      }).unwrap();
      toast.success(
        t('bank.list.imported', {
          banks: done.data.bankCount,
          branches: done.data.branchCount,
        }),
      );
      close();
    } catch (e) {
      setError(toApiError(e as never));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('bank.list.import')}</DialogTitle>
          <DialogDescription>{t('bank.list.importText')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          <Field data-invalid={(tried && !branches) || undefined}>
            <FieldLabel htmlFor="bank-list-branches">
              {t('bank.list.branchesFile')}
            </FieldLabel>
            <Input
              id="bank-list-branches"
              type="file"
              accept="application/json,.json"
              aria-invalid={(tried && !branches) || undefined}
              onChange={(e) => setBranches(e.target.files?.[0] ?? null)}
            />
            {tried && !branches && (
              <FieldError>{t('errors.code.BANK_LIST_FILE_MISSING')}</FieldError>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="bank-list-districts">
              {t('bank.list.districtsFile')}
            </FieldLabel>
            <Input
              id="bank-list-districts"
              type="file"
              accept="application/json,.json"
              onChange={(e) => setDistricts(e.target.files?.[0] ?? null)}
            />
          </Field>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              {t('bank.cancel')}
            </Button>
            <Button type="submit" disabled={sending.isLoading}>
              {sending.isLoading
                ? t('bank.list.importing')
                : t('bank.list.import')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
