import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  type FieldRecordTypeDto,
  useCatalogCreateFieldRecordTypeMutation,
  useCatalogUpdateFieldRecordTypeMutation,
} from '@/api/generated/catalog';
import { Button } from '@/components/ui/button';
import { FieldDescription } from '@/components/ui/field';
import type { EntryFormProps } from './catalog-list';
import {
  type BasicDraft,
  basicProblems,
  basicsOf,
  basicsRequest,
  newBasics,
} from './entry-draft';
import {
  BasicFields,
  CheckField,
  ChoiceField,
  EntryDialog,
  TextField,
} from './entry-form';
import {
  changeMeasurement,
  type MeasurementDraft,
  type MeasurementProblem,
  measurementOf,
  measurementProblems,
  measurementsRequest,
  newMeasurement,
} from './measurements';

/** As many as the server takes. */
const MAX_MEASUREMENTS = 20;

/** A kind of farm update: what it needs (photo, location) and the numbers it asks for. */
export function FieldRecordTypeForm({
  entry,
  onClose,
}: EntryFormProps<FieldRecordTypeDto>) {
  const { t } = useTranslation();
  const creating = entry === null;
  const [basics, setBasics] = useState<BasicDraft>(() =>
    entry ? basicsOf(entry) : newBasics(),
  );
  const [photo, setPhoto] = useState(entry?.requiresPhoto ?? false);
  const [location, setLocation] = useState(entry?.requiresLocation ?? true);
  const [list, setList] = useState<MeasurementDraft[]>(() =>
    (entry?.measurements ?? []).map(measurementOf),
  );
  const [tried, setTried] = useState(false);
  const [create] = useCatalogCreateFieldRecordTypeMutation();
  const [update] = useCatalogUpdateFieldRecordTypeMutation();
  const problems = basicProblems(basics, creating);
  const wrong = measurementProblems(list);

  async function submit() {
    setTried(true);
    if (problems.size > 0 || wrong.size > 0) return false;
    const common = {
      ...basicsRequest(basics),
      requiresPhoto: photo,
      requiresLocation: location,
      measurements: measurementsRequest(list),
    };
    if (entry) {
      await update({
        code: entry.code,
        updateFieldRecordTypeDto: { ...common, active: basics.active },
      }).unwrap();
      toast.success(t('catalog.saved', { name: common.name }));
    } else {
      await create({
        createFieldRecordTypeDto: { ...common, code: basics.code },
      }).unwrap();
      toast.success(t('catalog.created', { name: common.name }));
    }
    return true;
  }

  const change = (id: string, patch: Partial<MeasurementDraft>) =>
    setList((l) =>
      l.map((m) => (m.id === id ? changeMeasurement(m, patch) : m)),
    );
  const move = (index: number, by: -1 | 1) =>
    setList((l) => {
      const out = [...l];
      const [m] = out.splice(index, 1);
      out.splice(index + by, 0, m!);
      return out;
    });

  return (
    <EntryDialog
      open
      onClose={onClose}
      title={
        entry
          ? t('catalog.editTitle', { name: entry.name })
          : t('catalog.add.farmUpdateTypes')
      }
      onSubmit={submit}
    >
      <BasicFields
        idPrefix="record-type"
        draft={basics}
        onChange={setBasics}
        creating={creating}
        problems={tried ? problems : new Set()}
      />
      <CheckField
        id="record-type-photo"
        label={t('catalog.fields.requiresPhoto')}
        hint={t('catalog.fields.requiresPhotoHint')}
        checked={photo}
        onChange={setPhoto}
      />
      <CheckField
        id="record-type-location"
        label={t('catalog.fields.requiresLocation')}
        hint={t('catalog.fields.requiresLocationHint')}
        checked={location}
        onChange={setLocation}
      />

      <section className="grid gap-3" aria-labelledby="measurements-title">
        <div>
          <h3 id="measurements-title" className="font-semibold">
            {t('catalog.measurements.title')}
          </h3>
          <FieldDescription>{t('catalog.measurements.intro')}</FieldDescription>
        </div>
        {list.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('catalog.measurements.none')}
          </p>
        )}
        <ol className="grid gap-3">
          {list.map((m, i) => (
            <li key={m.id} className="grid gap-4 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {t('catalog.measurements.number', { n: i + 1 })}
                </p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('catalog.measurements.moveUp')}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('catalog.measurements.moveDown')}
                    disabled={i === list.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('catalog.measurements.remove')}
                    onClick={() =>
                      setList((l) => l.filter((x) => x.id !== m.id))
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <MeasurementFields
                m={m}
                problems={tried ? wrong.get(m.id) : undefined}
                onChange={(patch) => change(m.id, patch)}
              />
            </li>
          ))}
        </ol>
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={list.length >= MAX_MEASUREMENTS}
            onClick={() => setList((l) => [...l, newMeasurement()])}
          >
            <Plus /> {t('catalog.measurements.add')}
          </Button>
        </div>
      </section>
    </EntryDialog>
  );
}

function MeasurementFields({
  m,
  problems,
  onChange,
}: {
  m: MeasurementDraft;
  problems: ReadonlySet<MeasurementProblem> | undefined;
  onChange: (patch: Partial<MeasurementDraft>) => void;
}) {
  const { t } = useTranslation();
  const has = (p: MeasurementProblem) => problems?.has(p) ?? false;
  const id = (field: string) => `${m.id}-${field}`;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={id('label')}
          label={t('catalog.measurements.label')}
          value={m.label}
          maxLength={60}
          onChange={(label) => onChange({ label })}
          error={has('label') ? t('catalog.required.label') : undefined}
        />
        <TextField
          id={id('label-bn')}
          label={t('catalog.measurements.labelBn')}
          value={m.labelBn}
          maxLength={60}
          lang="bn"
          onChange={(labelBn) => onChange({ labelBn })}
          error={has('labelBn') ? t('catalog.required.labelBn') : undefined}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={id('key')}
          label={t('catalog.measurements.key')}
          value={m.key}
          maxLength={32}
          mono
          onChange={(key) => onChange({ key })}
          hint={t('catalog.measurements.keyHint')}
          error={
            has('key')
              ? t('catalog.required.key')
              : has('keyRepeated')
                ? t('catalog.required.keyRepeated')
                : undefined
          }
        />
        <TextField
          id={id('unit')}
          label={t('catalog.measurements.unit')}
          value={m.unit}
          maxLength={16}
          onChange={(unit) => onChange({ unit })}
          hint={t('catalog.measurements.unitHint')}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id={id('min')}
          label={t('catalog.measurements.min')}
          value={m.min}
          inputMode="decimal"
          maxLength={20}
          onChange={(min) => onChange({ min })}
          error={
            has('min')
              ? t('catalog.required.number')
              : has('range')
                ? t('catalog.required.range')
                : undefined
          }
        />
        <TextField
          id={id('max')}
          label={t('catalog.measurements.max')}
          value={m.max}
          inputMode="decimal"
          maxLength={20}
          onChange={(max) => onChange({ max })}
          error={has('max') ? t('catalog.required.number') : undefined}
        />
        <ChoiceField
          id={id('decimals')}
          label={t('catalog.measurements.decimals')}
          value={String(m.decimals) as '0' | '1' | '2' | '3'}
          options={(['0', '1', '2', '3'] as const).map((d) => ({
            value: d,
            label: t('catalog.measurements.decimalsN', { count: Number(d) }),
          }))}
          onChange={(d) => onChange({ decimals: Number(d || 0) })}
          error={
            has('decimals') ? t('catalog.required.boundDecimals') : undefined
          }
        />
      </div>
      <CheckField
        id={id('required')}
        label={t('catalog.measurements.required')}
        checked={m.required}
        onChange={(required) => onChange({ required })}
      />
    </>
  );
}
