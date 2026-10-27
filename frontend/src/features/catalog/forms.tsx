import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  type InputTypeDto,
  type ProduceTypeDto,
  type UnitDto,
  type WeatherEventTypeDto,
  useCatalogCreateInputTypeMutation,
  useCatalogCreateProduceTypeMutation,
  useCatalogCreateUnitMutation,
  useCatalogCreateWeatherEventTypeMutation,
  useCatalogUpdateInputTypeMutation,
  useCatalogUpdateProduceTypeMutation,
  useCatalogUpdateUnitMutation,
  useCatalogUpdateWeatherEventTypeMutation,
} from '@/api/generated/catalog';
import { wholeIn } from './catalog';
import type { EntryFormProps } from './catalog-list';
import {
  type BasicDraft,
  basicProblems,
  basicsOf,
  basicsRequest,
  newBasics,
  optionalText,
} from './entry-draft';
import {
  BasicFields,
  ChoiceField,
  EntryDialog,
  Fixed,
  TextField,
} from './entry-form';
import { useEntryLabels } from './labels';

const UNIT_KINDS = ['mass', 'volume', 'count'] as const;
const CATEGORIES = ['storable_crop', 'spice', 'perishable'] as const;
const INPUT_KINDS = ['seed', 'fertilizer', 'pesticide', 'other'] as const;

/** State and messages every entry form shares. */
function useEntryForm<T extends { code: string; name: string }>(
  entry: T | null,
  start: (entry: T) => BasicDraft,
) {
  const { t } = useTranslation();
  const creating = entry === null;
  const [basics, setBasics] = useState<BasicDraft>(() =>
    entry ? start(entry) : newBasics(),
  );
  const [tried, setTried] = useState(false);
  const problems = basicProblems(basics, creating);
  return {
    t,
    creating,
    basics,
    setBasics,
    tried,
    setTried,
    problems,
    shownProblems: tried ? problems : new Set<never>(),
    title: creating ? null : t('catalog.editTitle', { name: entry.name }),
    done: (name: string) =>
      toast.success(
        creating
          ? t('catalog.created', { name })
          : t('catalog.saved', { name }),
      ),
  };
}

export function UnitForm({ entry, onClose }: EntryFormProps<UnitDto>) {
  const f = useEntryForm(entry, basicsOf);
  const { t } = f;
  const [kind, setKind] = useState<UnitDto['kind'] | ''>(entry?.kind ?? '');
  const [symbol, setSymbol] = useState(entry?.symbol ?? '');
  const [symbolBn, setSymbolBn] = useState(entry?.symbolBn ?? '');
  const [create] = useCatalogCreateUnitMutation();
  const [update] = useCatalogUpdateUnitMutation();
  const bad = {
    kind: f.creating && kind === '',
    symbol: symbol.trim() === '',
    symbolBn: symbolBn.trim() === '',
  };

  async function submit() {
    f.setTried(true);
    if (f.problems.size > 0 || bad.kind || bad.symbol || bad.symbolBn)
      return false;
    const common = {
      ...basicsRequest(f.basics),
      symbol: symbol.trim(),
      symbolBn: symbolBn.trim(),
    };
    if (entry) {
      await update({
        code: entry.code,
        updateUnitDto: { ...common, active: f.basics.active },
      }).unwrap();
    } else {
      await create({
        createUnitDto: {
          ...common,
          code: f.basics.code,
          kind: kind as UnitDto['kind'],
        },
      }).unwrap();
    }
    f.done(common.name);
    return true;
  }

  return (
    <EntryDialog
      open
      onClose={onClose}
      title={f.title ?? t('catalog.add.units')}
      onSubmit={submit}
    >
      <BasicFields
        idPrefix="unit"
        draft={f.basics}
        onChange={f.setBasics}
        creating={f.creating}
        problems={f.shownProblems}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        {entry ? (
          <Fixed label={t('catalog.fields.unitKind')}>
            {t(`catalog.unitKind.${entry.kind}`)}
          </Fixed>
        ) : (
          <ChoiceField
            id="unit-kind"
            label={t('catalog.fields.unitKind')}
            value={kind}
            placeholder={t('catalog.choose')}
            options={UNIT_KINDS.map((k) => ({
              value: k,
              label: t(`catalog.unitKind.${k}`),
            }))}
            onChange={setKind}
            hint={t('catalog.fields.fixedHint')}
            error={
              f.tried && bad.kind ? t('catalog.required.choose') : undefined
            }
          />
        )}
        <TextField
          id="unit-symbol"
          label={t('catalog.fields.symbol')}
          value={symbol}
          maxLength={12}
          onChange={setSymbol}
          hint={t('catalog.fields.symbolHint')}
          error={
            f.tried && bad.symbol ? t('catalog.required.symbol') : undefined
          }
        />
        <TextField
          id="unit-symbol-bn"
          label={t('catalog.fields.symbolBn')}
          value={symbolBn}
          maxLength={12}
          onChange={setSymbolBn}
          hint={t('catalog.fields.symbolBnHint')}
          error={
            f.tried && bad.symbolBn ? t('catalog.required.symbolBn') : undefined
          }
        />
      </div>
    </EntryDialog>
  );
}

export function ProduceForm({
  entry,
  catalog,
  onClose,
}: EntryFormProps<ProduceTypeDto>) {
  const f = useEntryForm(entry, basicsOf);
  const { t } = f;
  const labels = useEntryLabels();
  const [category, setCategory] = useState<ProduceTypeDto['category'] | ''>(
    entry?.category ?? '',
  );
  const [unitCode, setUnitCode] = useState(entry?.unitCode ?? '');
  const [months, setMonths] = useState(
    entry?.typicalDurationMonths != null
      ? String(entry.typicalDurationMonths)
      : '',
  );
  const [description, setDescription] = useState(entry?.description ?? '');
  const [descriptionBn, setDescriptionBn] = useState(
    entry?.descriptionBn ?? '',
  );
  const [create] = useCatalogCreateProduceTypeMutation();
  const [update] = useCatalogUpdateProduceTypeMutation();
  const duration = wholeIn(months, 1, 60);
  const bad = {
    category: f.creating && category === '',
    unit: f.creating && unitCode === '',
    duration: duration === 'invalid',
  };

  async function submit() {
    f.setTried(true);
    if (f.problems.size > 0 || Object.values(bad).some(Boolean)) return false;
    const months = duration as number | null;
    const text = {
      description: optionalText(description),
      descriptionBn: optionalText(descriptionBn),
    };
    const name = basicsRequest(f.basics).name;
    if (entry) {
      await update({
        code: entry.code,
        updateProduceTypeDto: {
          ...basicsRequest(f.basics),
          active: f.basics.active,
          typicalDurationMonths: months,
          ...text,
        },
      }).unwrap();
    } else {
      await create({
        createProduceTypeDto: {
          ...basicsRequest(f.basics),
          code: f.basics.code,
          category: category as ProduceTypeDto['category'],
          unitCode,
          ...(months !== null && { typicalDurationMonths: months }),
          ...(text.description && { description: text.description }),
          ...(text.descriptionBn && { descriptionBn: text.descriptionBn }),
        },
      }).unwrap();
    }
    f.done(name);
    return true;
  }

  const units = catalog.units.filter((u) => u.active);
  return (
    <EntryDialog
      open
      onClose={onClose}
      title={f.title ?? t('catalog.add.produce')}
      onSubmit={submit}
    >
      <BasicFields
        idPrefix="produce"
        draft={f.basics}
        onChange={f.setBasics}
        creating={f.creating}
        problems={f.shownProblems}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        {entry ? (
          <Fixed label={t('catalog.fields.category')}>
            {t(`catalog.category.${entry.category}`)}
          </Fixed>
        ) : (
          <ChoiceField
            id="produce-category"
            label={t('catalog.fields.category')}
            value={category}
            placeholder={t('catalog.choose')}
            options={CATEGORIES.map((c) => ({
              value: c,
              label: t(`catalog.category.${c}`),
            }))}
            onChange={setCategory}
            hint={
              category
                ? t(`catalog.categoryMeans.${category}`)
                : t('catalog.fields.fixedHint')
            }
            error={
              f.tried && bad.category ? t('catalog.required.choose') : undefined
            }
          />
        )}
        {entry ? (
          <Fixed label={t('catalog.fields.unit')}>
            {labels.unit(catalog, entry.unitCode)}
          </Fixed>
        ) : (
          <ChoiceField
            id="produce-unit"
            label={t('catalog.fields.unit')}
            value={unitCode}
            placeholder={t('catalog.choose')}
            options={units.map((u) => ({
              value: u.code,
              label: labels.unit(catalog, u.code),
            }))}
            onChange={setUnitCode}
            hint={t('catalog.fields.produceUnitHint')}
            error={
              f.tried && bad.unit ? t('catalog.required.choose') : undefined
            }
          />
        )}
      </div>
      <TextField
        id="produce-months"
        label={t('catalog.fields.duration')}
        value={months}
        inputMode="numeric"
        maxLength={3}
        onChange={setMonths}
        hint={t('catalog.fields.durationHint')}
        error={
          f.tried && bad.duration ? t('catalog.required.duration') : undefined
        }
      />
      <TextField
        id="produce-description"
        label={t('catalog.fields.description')}
        value={description}
        maxLength={500}
        multiline
        onChange={setDescription}
      />
      <TextField
        id="produce-description-bn"
        label={t('catalog.fields.descriptionBn')}
        value={descriptionBn}
        maxLength={500}
        lang="bn"
        multiline
        onChange={setDescriptionBn}
      />
    </EntryDialog>
  );
}

export function InputForm({
  entry,
  catalog,
  onClose,
}: EntryFormProps<InputTypeDto>) {
  const f = useEntryForm(entry, basicsOf);
  const { t } = f;
  const labels = useEntryLabels();
  const [kind, setKind] = useState<InputTypeDto['kind'] | ''>(
    entry?.kind ?? '',
  );
  const [unitCode, setUnitCode] = useState(entry?.unitCode ?? '');
  const [produceCode, setProduceCode] = useState(entry?.produceCode ?? '');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [create] = useCatalogCreateInputTypeMutation();
  const [update] = useCatalogUpdateInputTypeMutation();
  const bad = {
    kind: f.creating && kind === '',
    unit: f.creating && unitCode === '',
  };

  async function submit() {
    f.setTried(true);
    if (f.problems.size > 0 || bad.kind || bad.unit) return false;
    const text = optionalText(description);
    const name = basicsRequest(f.basics).name;
    if (entry) {
      await update({
        code: entry.code,
        updateInputTypeDto: {
          ...basicsRequest(f.basics),
          active: f.basics.active,
          description: text,
        },
      }).unwrap();
    } else {
      await create({
        createInputTypeDto: {
          ...basicsRequest(f.basics),
          code: f.basics.code,
          kind: kind as InputTypeDto['kind'],
          unitCode,
          ...(kind === 'seed' && produceCode && { produceCode }),
          ...(text && { description: text }),
        },
      }).unwrap();
    }
    f.done(name);
    return true;
  }

  const units = catalog.units.filter((u) => u.active);
  const crops = catalog.produceTypes.filter((p) => p.active);
  return (
    <EntryDialog
      open
      onClose={onClose}
      title={f.title ?? t('catalog.add.inputs')}
      onSubmit={submit}
    >
      <BasicFields
        idPrefix="input"
        draft={f.basics}
        onChange={f.setBasics}
        creating={f.creating}
        problems={f.shownProblems}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        {entry ? (
          <Fixed label={t('catalog.fields.inputKind')}>
            {t(`catalog.inputKind.${entry.kind}`)}
          </Fixed>
        ) : (
          <ChoiceField
            id="input-kind"
            label={t('catalog.fields.inputKind')}
            value={kind}
            placeholder={t('catalog.choose')}
            options={INPUT_KINDS.map((k) => ({
              value: k,
              label: t(`catalog.inputKind.${k}`),
            }))}
            onChange={setKind}
            hint={t('catalog.fields.fixedHint')}
            error={
              f.tried && bad.kind ? t('catalog.required.choose') : undefined
            }
          />
        )}
        {entry ? (
          <Fixed label={t('catalog.fields.unit')}>
            {labels.unit(catalog, entry.unitCode)}
          </Fixed>
        ) : (
          <ChoiceField
            id="input-unit"
            label={t('catalog.fields.unit')}
            value={unitCode}
            placeholder={t('catalog.choose')}
            options={units.map((u) => ({
              value: u.code,
              label: labels.unit(catalog, u.code),
            }))}
            onChange={setUnitCode}
            hint={t('catalog.fields.inputUnitHint')}
            error={
              f.tried && bad.unit ? t('catalog.required.choose') : undefined
            }
          />
        )}
      </div>
      {entry
        ? entry.produceCode && (
            <Fixed label={t('catalog.fields.crop')}>
              {labels.produce(catalog, entry.produceCode)}
            </Fixed>
          )
        : kind === 'seed' && (
            <ChoiceField
              id="input-crop"
              label={t('catalog.fields.crop')}
              value={produceCode}
              options={[
                { value: '', label: t('catalog.fields.noCrop') },
                ...crops.map((p) => ({
                  value: p.code,
                  label: labels.produce(catalog, p.code),
                })),
              ]}
              onChange={setProduceCode}
              hint={t('catalog.fields.cropHint')}
            />
          )}
      <TextField
        id="input-description"
        label={t('catalog.fields.description')}
        value={description}
        maxLength={500}
        multiline
        onChange={setDescription}
      />
    </EntryDialog>
  );
}

export function WeatherEventForm({
  entry,
  onClose,
}: EntryFormProps<WeatherEventTypeDto>) {
  const f = useEntryForm(entry, basicsOf);
  const { t } = f;
  const [description, setDescription] = useState(entry?.description ?? '');
  const [create] = useCatalogCreateWeatherEventTypeMutation();
  const [update] = useCatalogUpdateWeatherEventTypeMutation();

  async function submit() {
    f.setTried(true);
    if (f.problems.size > 0) return false;
    const text = optionalText(description);
    const name = basicsRequest(f.basics).name;
    if (entry) {
      await update({
        code: entry.code,
        updateWeatherEventTypeDto: {
          ...basicsRequest(f.basics),
          active: f.basics.active,
          description: text,
        },
      }).unwrap();
    } else {
      await create({
        createWeatherEventTypeDto: {
          ...basicsRequest(f.basics),
          code: f.basics.code,
          ...(text && { description: text }),
        },
      }).unwrap();
    }
    f.done(name);
    return true;
  }

  return (
    <EntryDialog
      open
      onClose={onClose}
      title={f.title ?? t('catalog.add.weatherEvents')}
      onSubmit={submit}
    >
      <BasicFields
        idPrefix="weather"
        draft={f.basics}
        onChange={f.setBasics}
        creating={f.creating}
        problems={f.shownProblems}
      />
      <TextField
        id="weather-description"
        label={t('catalog.fields.description')}
        value={description}
        maxLength={500}
        multiline
        onChange={setDescription}
      />
    </EntryDialog>
  );
}
