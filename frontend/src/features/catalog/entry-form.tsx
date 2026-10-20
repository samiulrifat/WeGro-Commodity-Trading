import { type FormEvent, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, toApiError } from '@/api/errors';
import { FormError } from '@/app/auth/form-error';
import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  type BasicDraft,
  type BasicProblem,
  changeBasics,
} from './entry-draft';

/**
 * Adding or changing one entry, in a dialog. `onSubmit` returns whether the
 * form was complete; a refusal from the server is shown in the form.
 */
export function EntryDialog({
  open,
  onClose,
  title,
  description,
  onSubmit,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  onSubmit: () => Promise<boolean>;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (await onSubmit()) onClose();
    } catch (e) {
      setError(toApiError(e as never));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="grid gap-5"
        >
          {children}
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('catalog.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t('catalog.saving') : t('catalog.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Code (when adding), both names, position in lists, and whether it is in use. */
export function BasicFields({
  draft,
  onChange,
  creating,
  problems,
  idPrefix,
}: {
  draft: BasicDraft;
  onChange: (next: BasicDraft) => void;
  creating: boolean;
  /** Shown once the form was tried. */
  problems: ReadonlySet<BasicProblem>;
  idPrefix: string;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<BasicDraft>) =>
    onChange(changeBasics(draft, patch, creating));
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id={`${idPrefix}-name`}
          label={t('catalog.fields.name')}
          value={draft.name}
          maxLength={80}
          onChange={(name) => set({ name })}
          error={problems.has('name') ? t('catalog.required.name') : undefined}
        />
        <TextField
          id={`${idPrefix}-name-bn`}
          label={t('catalog.fields.nameBn')}
          value={draft.nameBn}
          maxLength={80}
          lang="bn"
          onChange={(nameBn) => set({ nameBn })}
          error={
            problems.has('nameBn') ? t('catalog.required.nameBn') : undefined
          }
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {creating ? (
          <TextField
            id={`${idPrefix}-code`}
            label={t('catalog.fields.code')}
            value={draft.code}
            maxLength={31}
            mono
            onChange={(code) => set({ code })}
            hint={t('catalog.fields.codeHint')}
            error={
              problems.has('code') ? t('catalog.required.code') : undefined
            }
          />
        ) : (
          <Fixed label={t('catalog.fields.code')} mono>
            {draft.code}
          </Fixed>
        )}
        <TextField
          id={`${idPrefix}-order`}
          label={t('catalog.fields.sortOrder')}
          value={draft.sortOrder}
          inputMode="numeric"
          maxLength={6}
          onChange={(sortOrder) => set({ sortOrder })}
          hint={t('catalog.fields.sortOrderHint')}
          error={
            problems.has('sortOrder')
              ? t('catalog.required.sortOrder')
              : undefined
          }
        />
      </div>
      {!creating && (
        <CheckField
          id={`${idPrefix}-active`}
          label={t('catalog.fields.active')}
          hint={t('catalog.fields.activeHint')}
          checked={draft.active}
          onChange={(active) => set({ active })}
        />
      )}
    </>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  maxLength,
  inputMode,
  mono,
  lang,
  multiline,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  maxLength?: number;
  inputMode?: 'numeric' | 'decimal';
  mono?: boolean;
  lang?: string;
  multiline?: boolean;
}) {
  const props = {
    id,
    value,
    maxLength,
    lang,
    'aria-invalid': error ? true : undefined,
  };
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline ? (
        <Textarea
          {...props}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          {...props}
          inputMode={inputMode}
          autoComplete="off"
          className={mono ? 'font-mono tracking-wide' : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        hint && <FieldDescription>{hint}</FieldDescription>
      )}
    </Field>
  );
}

export function ChoiceField<V extends string>({
  id,
  label,
  value,
  options,
  onChange,
  placeholder,
  hint,
  error,
}: {
  id: string;
  label: string;
  value: V | '';
  options: ReadonlyArray<{ value: V | ''; label: string }>;
  onChange: (value: V | '') => void;
  placeholder?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select<string>
        items={options}
        // Nothing chosen yet shows the placeholder, unless "none" is a choice.
        value={
          value === '' && !options.some((o) => o.value === '') ? null : value
        }
        onValueChange={(v) => onChange((v ?? '') as V | '')}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={error ? true : undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value || 'none'} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        hint && <FieldDescription>{hint}</FieldDescription>
      )}
    </Field>
  );
}

export function CheckField({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Field orientation="horizontal">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <div className="grid gap-0.5">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {hint && <FieldDescription>{hint}</FieldDescription>}
      </div>
    </Field>
  );
}

/** A value that cannot change once saved, shown with why. */
export function Fixed({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid content-start gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      <p
        className={
          mono
            ? 'flex min-h-10 items-center rounded-md bg-muted px-2.5 font-mono tracking-wide'
            : 'flex min-h-10 items-center rounded-md bg-muted px-2.5'
        }
      >
        {children}
      </p>
      <p className="text-sm text-muted-foreground">
        {t('catalog.fields.fixed')}
      </p>
    </div>
  );
}
