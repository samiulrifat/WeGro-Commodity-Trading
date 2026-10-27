import { Link } from '@tanstack/react-router';
import { Camera, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  CatalogDto,
  FieldRecordTypeDto,
  InputTypeDto,
  ProduceTypeDto,
  UnitDto,
  WeatherEventTypeDto,
} from '@/api/generated/catalog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFormat } from '@/i18n/use-format';
import type { CatalogSearch } from './catalog';
import { CatalogEntryPage } from './catalog-entry';
import { CatalogList } from './catalog-list';
import { InputForm, ProduceForm, UnitForm, WeatherEventForm } from './forms';
import { useEntryLabels } from './labels';
import { FieldRecordTypeForm } from './record-type-form';

// Stable selectors: the lists are filtered in memos keyed on them.
const units = (c: CatalogDto) => c.units;
const produce = (c: CatalogDto) => c.produceTypes;
const inputs = (c: CatalogDto) => c.inputTypes;
const recordTypes = (c: CatalogDto) => c.fieldRecordTypes;
const weather = (c: CatalogDto) => c.weatherEventTypes;

const unitSearch = (u: UnitDto) => [u.symbol, u.symbolBn];

// --- Units ---

export function UnitsPage({ search }: { search: CatalogSearch }) {
  const { t } = useTranslation();
  return (
    <CatalogList
      path="/catalog/units"
      detail="/catalog/units/$code"
      title={t('nav.sub.units')}
      intro={t('catalog.intro.units')}
      addLabel={t('catalog.add.units')}
      select={units}
      searchExtra={unitSearch}
      search={search}
      Form={UnitForm}
      columns={[
        {
          header: t('catalog.fields.unitKind'),
          cell: (u) => t(`catalog.unitKind.${u.kind}`),
        },
        { header: t('catalog.fields.symbol'), cell: (u) => u.symbol },
        { header: t('catalog.fields.symbolBn'), cell: (u) => u.symbolBn },
      ]}
    />
  );
}

export function UnitPage({ code }: { code: string }) {
  const { t } = useTranslation();
  return (
    <CatalogEntryPage
      code={code}
      list="/catalog/units"
      listLabel={t('nav.sub.units')}
      select={units}
      Form={UnitForm}
      facts={(u) => [
        {
          label: t('catalog.fields.unitKind'),
          value: t(`catalog.unitKind.${u.kind}`),
        },
        { label: t('catalog.fields.symbol'), value: u.symbol },
        { label: t('catalog.fields.symbolBn'), value: u.symbolBn },
      ]}
    />
  );
}

// --- Produce ---

function Months({ months }: { months: number | null | undefined }) {
  const { t } = useTranslation();
  return months ? t('catalog.months', { count: months }) : '—';
}

export function ProduceListPage({ search }: { search: CatalogSearch }) {
  const { t } = useTranslation();
  const labels = useEntryLabels();
  return (
    <CatalogList
      path="/catalog/produce"
      detail="/catalog/produce/$code"
      title={t('nav.sub.produce')}
      intro={t('catalog.intro.produce')}
      addLabel={t('catalog.add.produce')}
      select={produce}
      search={search}
      Form={ProduceForm}
      columns={[
        {
          header: t('catalog.fields.category'),
          cell: (p) => t(`catalog.category.${p.category}`),
        },
        {
          header: t('catalog.fields.unit'),
          cell: (p, c) => labels.unit(c, p.unitCode),
        },
        {
          header: t('catalog.column.duration'),
          cell: (p) => <Months months={p.typicalDurationMonths} />,
        },
      ]}
    />
  );
}

export function ProducePage({ code }: { code: string }) {
  const { t, i18n } = useTranslation();
  const labels = useEntryLabels();
  const bengali = i18n.resolvedLanguage === 'bn';
  return (
    <CatalogEntryPage
      code={code}
      list="/catalog/produce"
      listLabel={t('nav.sub.produce')}
      select={produce}
      Form={ProduceForm}
      facts={(p: ProduceTypeDto, c) => [
        {
          label: t('catalog.fields.category'),
          value: (
            <>
              {t(`catalog.category.${p.category}`)}
              <span className="block text-sm font-normal text-muted-foreground">
                {t(`catalog.categoryMeans.${p.category}`)}
              </span>
            </>
          ),
        },
        { label: t('catalog.fields.unit'), value: labels.unit(c, p.unitCode) },
        {
          label: t('catalog.fields.duration'),
          value: <Months months={p.typicalDurationMonths} />,
        },
        {
          label: t('catalog.fields.about'),
          value:
            (bengali ? p.descriptionBn || p.description : p.description) || '—',
          wide: true,
        },
      ]}
      more={(p, c) => <SeedsFor crop={p} catalog={c} />}
    />
  );
}

/** The inputs a voucher can buy that are seed for this crop. */
function SeedsFor({
  crop,
  catalog,
}: {
  crop: ProduceTypeDto;
  catalog: CatalogDto;
}) {
  const { t } = useTranslation();
  const labels = useEntryLabels();
  const seeds = catalog.inputTypes.filter(
    (i) => i.produceCode === crop.code && i.active,
  );
  if (seeds.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('catalog.seedsFor')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2">
          {seeds.map((s) => (
            <li key={s.code}>
              <Link
                to="/catalog/inputs/$code"
                params={{ code: s.code }}
                className="font-medium underline-offset-4 hover:underline"
              >
                {labels.name(s)}
              </Link>
              <span className="text-sm text-muted-foreground">
                {' · '}
                {labels.unit(catalog, s.unitCode)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// --- Inputs ---

const inputSearch = (i: InputTypeDto, c: CatalogDto) => {
  const crop = c.produceTypes.find((p) => p.code === i.produceCode);
  return crop ? [crop.name, crop.nameBn] : [];
};

export function InputsPage({ search }: { search: CatalogSearch }) {
  const { t } = useTranslation();
  const labels = useEntryLabels();
  return (
    <CatalogList
      path="/catalog/inputs"
      detail="/catalog/inputs/$code"
      title={t('nav.sub.inputs')}
      intro={t('catalog.intro.inputs')}
      addLabel={t('catalog.add.inputs')}
      select={inputs}
      searchExtra={inputSearch}
      search={search}
      Form={InputForm}
      columns={[
        {
          header: t('catalog.fields.inputKind'),
          cell: (i) => t(`catalog.inputKind.${i.kind}`),
        },
        {
          header: t('catalog.fields.unit'),
          cell: (i, c) => labels.unit(c, i.unitCode),
        },
        {
          header: t('catalog.column.crop'),
          cell: (i, c) =>
            i.produceCode ? labels.produce(c, i.produceCode) : '—',
        },
      ]}
    />
  );
}

export function InputPage({ code }: { code: string }) {
  const { t } = useTranslation();
  const labels = useEntryLabels();
  return (
    <CatalogEntryPage
      code={code}
      list="/catalog/inputs"
      listLabel={t('nav.sub.inputs')}
      select={inputs}
      Form={InputForm}
      facts={(i, c) => [
        {
          label: t('catalog.fields.inputKind'),
          value: t(`catalog.inputKind.${i.kind}`),
        },
        { label: t('catalog.fields.unit'), value: labels.unit(c, i.unitCode) },
        {
          label: t('catalog.column.crop'),
          value: i.produceCode ? labels.produce(c, i.produceCode) : '—',
        },
        {
          label: t('catalog.fields.about'),
          value: i.description || '—',
          wide: true,
        },
      ]}
    />
  );
}

// --- Farm update types ---

function Needs({ type }: { type: FieldRecordTypeDto }) {
  const { t } = useTranslation();
  const needs = [
    type.requiresPhoto && t('catalog.needs.photo'),
    type.requiresLocation && t('catalog.needs.location'),
  ].filter(Boolean);
  return needs.length > 0 ? needs.join(', ') : t('catalog.needs.nothing');
}

export function FarmUpdateTypesPage({ search }: { search: CatalogSearch }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <CatalogList
      path="/catalog/farm-update-types"
      detail="/catalog/farm-update-types/$code"
      title={t('nav.sub.farmUpdateTypes')}
      intro={t('catalog.intro.farmUpdateTypes')}
      addLabel={t('catalog.add.farmUpdateTypes')}
      select={recordTypes}
      search={search}
      Form={FieldRecordTypeForm}
      columns={[
        { header: t('catalog.column.needs'), cell: (r) => <Needs type={r} /> },
        {
          header: t('catalog.column.measurements'),
          cell: (r) => fmt.number(r.measurements.length),
        },
      ]}
    />
  );
}

export function FarmUpdateTypePage({ code }: { code: string }) {
  const { t } = useTranslation();
  return (
    <CatalogEntryPage
      code={code}
      list="/catalog/farm-update-types"
      listLabel={t('nav.sub.farmUpdateTypes')}
      select={recordTypes}
      Form={FieldRecordTypeForm}
      facts={(r) => [
        {
          label: t('catalog.fields.requiresPhoto'),
          value: (
            <span className="inline-flex items-center gap-1.5">
              <Camera aria-hidden className="size-4" />
              {r.requiresPhoto ? t('catalog.yes') : t('catalog.no')}
            </span>
          ),
        },
        {
          label: t('catalog.fields.requiresLocation'),
          value: (
            <span className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden className="size-4" />
              {r.requiresLocation ? t('catalog.yes') : t('catalog.no')}
            </span>
          ),
        },
      ]}
      more={(r) => <MeasurementTable type={r} />}
    />
  );
}

/** The numbers the field officer fills in with this update. */
function MeasurementTable({ type }: { type: FieldRecordTypeDto }) {
  const { t, i18n } = useTranslation();
  const fmt = useFormat();
  const bengali = i18n.resolvedLanguage === 'bn';
  const bound = (n: number | null | undefined) =>
    n === null || n === undefined ? '—' : fmt.number(n);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t('catalog.measurements.title')}
        </CardTitle>
        <CardDescription>{t('catalog.measurements.intro')}</CardDescription>
      </CardHeader>
      <CardContent>
        {type.measurements.length === 0 ? (
          <p className="text-muted-foreground">
            {t('catalog.measurements.none')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('catalog.measurements.label')}</TableHead>
                  <TableHead>{t('catalog.measurements.unit')}</TableHead>
                  <TableHead>{t('catalog.measurements.allowed')}</TableHead>
                  <TableHead>{t('catalog.measurements.decimals')}</TableHead>
                  <TableHead>{t('catalog.measurements.required')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {type.measurements.map((m) => (
                  <TableRow key={m.key}>
                    <TableCell className="whitespace-normal">
                      <span className="font-medium">
                        {bengali ? m.labelBn : m.label}
                      </span>
                      <span className="block font-mono text-sm text-muted-foreground">
                        {m.key}
                      </span>
                    </TableCell>
                    <TableCell>{m.unit || '—'}</TableCell>
                    <TableCell>
                      {bound(m.min)} – {bound(m.max)}
                    </TableCell>
                    <TableCell>{fmt.number(m.decimals)}</TableCell>
                    <TableCell>
                      {m.required ? t('catalog.yes') : t('catalog.no')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Weather events ---

export function WeatherEventsPage({ search }: { search: CatalogSearch }) {
  const { t } = useTranslation();
  return (
    <CatalogList
      path="/catalog/weather-events"
      detail="/catalog/weather-events/$code"
      title={t('nav.sub.weatherEvents')}
      intro={t('catalog.intro.weatherEvents')}
      addLabel={t('catalog.add.weatherEvents')}
      select={weather}
      search={search}
      Form={WeatherEventForm}
      columns={[
        {
          header: t('catalog.fields.about'),
          cell: (w: WeatherEventTypeDto) => w.description || '—',
        },
      ]}
    />
  );
}

export function WeatherEventPage({ code }: { code: string }) {
  const { t } = useTranslation();
  return (
    <CatalogEntryPage
      code={code}
      list="/catalog/weather-events"
      listLabel={t('nav.sub.weatherEvents')}
      select={weather}
      Form={WeatherEventForm}
      facts={(w) => [
        {
          label: t('catalog.fields.about'),
          value: w.description || '—',
          wide: true,
        },
      ]}
    />
  );
}
