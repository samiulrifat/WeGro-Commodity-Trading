import type { MeasurementDto } from '@/api/generated/catalog';
import { decimalsOf, MEASUREMENT_KEY, numberOf, suggestKey } from './catalog';

/** One number a farm update asks for, as typed. */
export interface MeasurementDraft {
  /** Stable while editing, for React. */
  id: string;
  key: string;
  /** The key was typed by hand: stop following the label. */
  keyTyped: boolean;
  label: string;
  labelBn: string;
  unit: string;
  min: string;
  max: string;
  decimals: number;
  required: boolean;
}

export type MeasurementProblem =
  | 'key'
  | 'keyRepeated'
  | 'label'
  | 'labelBn'
  | 'min'
  | 'max'
  | 'range'
  | 'decimals';

let next = 0;
const newId = () => `m${++next}`;

export const newMeasurement = (): MeasurementDraft => ({
  id: newId(),
  key: '',
  keyTyped: false,
  label: '',
  labelBn: '',
  unit: '',
  min: '',
  max: '',
  decimals: 0,
  required: true,
});

export const measurementOf = (m: MeasurementDto): MeasurementDraft => ({
  id: newId(),
  key: m.key,
  keyTyped: true,
  label: m.label,
  labelBn: m.labelBn,
  unit: m.unit ?? '',
  min: m.min != null ? String(m.min) : '',
  max: m.max != null ? String(m.max) : '',
  decimals: m.decimals,
  required: m.required,
});

/** A change; the English label carries the key along until it is typed. */
export function changeMeasurement(
  m: MeasurementDraft,
  patch: Partial<MeasurementDraft>,
): MeasurementDraft {
  const out = { ...m, ...patch };
  if (patch.label !== undefined && !out.keyTyped) {
    out.key = suggestKey(patch.label);
  }
  if (patch.key !== undefined) {
    out.key = patch.key.toLowerCase();
    out.keyTyped = patch.key !== '';
  }
  return out;
}

const clean = (text: string) =>
  text.normalize('NFC').trim().replace(/\s+/g, ' ');

/** What is wrong with each measurement (by its id), as the server would refuse it. */
export function measurementProblems(
  list: readonly MeasurementDraft[],
): Map<string, Set<MeasurementProblem>> {
  const out = new Map<string, Set<MeasurementProblem>>();
  const counts = new Map<string, number>();
  for (const m of list) counts.set(m.key, (counts.get(m.key) ?? 0) + 1);
  for (const m of list) {
    const p = new Set<MeasurementProblem>();
    if (!MEASUREMENT_KEY.test(m.key)) p.add('key');
    else if ((counts.get(m.key) ?? 0) > 1) p.add('keyRepeated');
    if (clean(m.label) === '') p.add('label');
    if (clean(m.labelBn) === '') p.add('labelBn');
    const min = numberOf(m.min);
    const max = numberOf(m.max);
    if (Number.isNaN(min)) p.add('min');
    if (Number.isNaN(max)) p.add('max');
    if (min !== null && max !== null && !Number.isNaN(min + max) && min > max) {
      p.add('range');
    }
    for (const bound of [min, max]) {
      if (
        bound !== null &&
        !Number.isNaN(bound) &&
        decimalsOf(bound) > m.decimals
      ) {
        p.add('decimals');
      }
    }
    if (p.size > 0) out.set(m.id, p);
  }
  return out;
}

/** The list as the server takes it (only once it has no problems). */
export function measurementsRequest(
  list: readonly MeasurementDraft[],
): MeasurementDto[] {
  return list.map((m) => ({
    key: m.key,
    label: clean(m.label),
    labelBn: clean(m.labelBn),
    unit: clean(m.unit) === '' ? null : clean(m.unit),
    min: numberOf(m.min),
    max: numberOf(m.max),
    decimals: m.decimals,
    required: m.required,
  }));
}
