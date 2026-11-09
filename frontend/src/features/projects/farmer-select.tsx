import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { District } from '@/api/generated/codes';
import { useProjectsFarmersQuery } from '@/api/generated/projects';
import { SearchSelect } from '@/components/ui/combobox';
import { SearchBox } from '@/components/search-box';

/** The most farmers one list brings (the API's page limit). */
const LIMIT = 100;

/**
 * The project's farmer, from a dropdown of every verified farmer (name and
 * district) that narrows as you type. With more farmers than one list
 * holds, a search by name or number fetches the right ones first.
 */
export function FarmerSelect({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string | null;
  onChange: (farmer: { id: string; name: string } | null) => void;
  invalid?: boolean;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState<string | undefined>();
  const farmers = useProjectsFarmersQuery({ q, limit: LIMIT });
  const rows = farmers.data?.data ?? [];
  const more = (farmers.data?.meta.total ?? 0) > rows.length;
  // By name, so a farmer is found by eye as in any list of people.
  const options = [...rows]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => ({
      value: f.id,
      label: f.district
        ? `${f.name} · ${t(`districts.${f.district as District}`, { defaultValue: f.district })}`
        : f.name,
    }));
  return (
    <div className="grid gap-2">
      {(more || q) && (
        <SearchBox
          value={q}
          onSearch={setQ}
          placeholder={t('projects.form.findFarmer')}
          inForm
        />
      )}
      <SearchSelect
        id={id}
        options={options}
        value={value}
        onValueChange={(farmerId) => {
          const f = rows.find((r) => r.id === farmerId);
          onChange(f ? { id: f.id, name: f.name } : null);
        }}
        placeholder={
          farmers.isFetching
            ? t('states.loading')
            : t('projects.form.chooseFarmer')
        }
        emptyText={t('projects.form.noFarmers')}
        invalid={invalid}
      />
      {more && (
        <p className="text-sm text-muted-foreground">
          {t('projects.form.moreFarmers', {
            n: rows.length,
            count: rows.length,
          })}
        </p>
      )}
    </div>
  );
}
