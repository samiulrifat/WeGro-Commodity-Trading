import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { District } from '@/api/generated/codes';
import { useParticipantsListQuery } from '@/api/generated/participants';
import { SearchBox } from '@/components/search-box';
import { cn } from '@/lib/utils';

/**
 * Choosing a verified person of `personRole` (a field officer unless said):
 * searched by name or number, twenty at a time; `exclude` are not offered
 * (their current or leaving officer).
 */
export function OfficerPicker({
  open,
  exclude,
  value,
  onChange,
  personRole = 'field_officer',
  placeholder,
}: {
  open: boolean;
  exclude: readonly string[];
  value: string | null;
  onChange: (personId: string | null) => void;
  personRole?: 'field_officer' | 'farmer' | 'insurer';
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState<string | undefined>();
  const officers = useParticipantsListQuery(
    { role: personRole, status: 'verified', q, limit: 20 },
    { skip: !open },
  );
  const shown = (officers.data?.data ?? []).filter(
    (o) => !exclude.includes(o.id),
  );
  const more = (officers.data?.meta.total ?? 0) > shown.length + exclude.length;

  return (
    <>
      <SearchBox
        value={q}
        onSearch={(next) => {
          setQ(next);
          onChange(null);
        }}
        placeholder={placeholder ?? t('people.actions.findOfficer')}
        inForm
      />
      <fieldset className="grid max-h-72 gap-1.5 overflow-y-auto">
        <legend className="sr-only">{t(`roles.${personRole}`)}</legend>
        {officers.isFetching && (
          <p className="text-sm text-muted-foreground">{t('states.loading')}</p>
        )}
        {!officers.isFetching && shown.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('people.noMatch')}</p>
        )}
        {shown.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className={cn(
              'flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              value === o.id
                ? 'border-ink bg-nav-active/40 ring-1 ring-ink'
                : 'hover:bg-muted',
            )}
          >
            <span className="font-medium">{o.fullName}</span>
            <span className="text-sm text-muted-foreground">
              {o.district ? t(`districts.${o.district as District}`) : ''}
            </span>
          </button>
        ))}
        {more && (
          <p className="text-sm text-muted-foreground">
            {t('people.actions.narrowOfficers')}
          </p>
        )}
      </fieldset>
    </>
  );
}
