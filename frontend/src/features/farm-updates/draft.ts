import type {
  FieldRecordTypeDto,
  MeasurementDto,
} from '@/api/generated/catalog';
import type { FieldRecordDraftDto } from '@/api/generated/field-records';
import type { Draft } from '@/lib/drafts';
import { latinDigits } from '@/lib/format';

/** Where the phone was when the update was made. */
export interface DraftLocation {
  latitude: string;
  longitude: string;
  accuracyMeters: number | null;
}

/**
 * A farm update as kept on the phone until it is sent. The draft's id is
 * the record's id, so sending it twice can never make two records.
 */
export interface FarmUpdateData {
  projectId: string;
  projectTitle: string;
  farmerName: string;
  entryTypeCode: string;
  /** As typed, keyed by the record type's measurement keys. */
  measurements: Record<string, string>;
  notes: string;
  location: DraftLocation | null;
  /** When it was observed (ISO, by the phone's clock). */
  observedAt: string;
  correctsEntryId: string | null;
  /** The record being corrected, for showing it; not sent. */
  correcting: { observedAt: string; typeName: string } | null;
  /** Set once the photo is uploaded (or the original's, on a correction). */
  photoId: string | null;
}

export type FarmUpdateDraft = Draft<FarmUpdateData>;

/** What the server takes for one draft. */
export function toSyncRecord(d: FarmUpdateDraft): FieldRecordDraftDto {
  const x = d.data;
  const measurements = Object.fromEntries(
    Object.entries(x.measurements)
      .map(([k, v]) => [k, latinDigits(v).trim()] as const)
      .filter(([, v]) => v !== ''),
  );
  return {
    id: d.id,
    projectId: x.projectId,
    entryTypeCode: x.entryTypeCode,
    notes: x.notes.trim() || undefined,
    measurements,
    ...(x.location
      ? {
          latitude: x.location.latitude,
          longitude: x.location.longitude,
          accuracyMeters: x.location.accuracyMeters ?? undefined,
        }
      : {}),
    photoId: x.photoId ?? undefined,
    correctsEntryId: x.correctsEntryId ?? undefined,
    observedAt: x.observedAt,
  };
}

export type MeasurementProblem =
  | { kind: 'required' }
  | { kind: 'number' }
  | { kind: 'decimals'; decimals: number }
  | { kind: 'min'; min: number }
  | { kind: 'max'; max: number };

/** What is wrong with one typed reading, or null; the server checks again. */
export function measurementProblem(
  m: MeasurementDto,
  typed: string | undefined,
): MeasurementProblem | null {
  const text = latinDigits(typed ?? '').trim();
  if (text === '') return m.required ? { kind: 'required' } : null;
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { kind: 'number' };
  const decimals = text.split('.')[1]?.length ?? 0;
  if (decimals > m.decimals) return { kind: 'decimals', decimals: m.decimals };
  const n = Number(text);
  if (m.min != null && n < m.min) return { kind: 'min', min: m.min };
  if (m.max != null && n > m.max) return { kind: 'max', max: m.max };
  return null;
}

/** Whether the update can be saved: every check the phone can make itself. */
export function draftProblems(
  x: FarmUpdateData,
  type: FieldRecordTypeDto | undefined,
  hasPhoto: boolean,
  now = Date.now(),
): {
  project: boolean;
  type: boolean;
  photo: boolean;
  location: boolean;
  observedAt: boolean;
  measurements: Record<string, MeasurementProblem>;
} {
  const measurements: Record<string, MeasurementProblem> = {};
  for (const m of type?.measurements ?? []) {
    const p = measurementProblem(m, x.measurements[m.key]);
    if (p) measurements[m.key] = p;
  }
  const observed = Date.parse(x.observedAt);
  return {
    project: !x.projectId,
    type: !type,
    photo: !!type?.requiresPhoto && !hasPhoto,
    location: !!type?.requiresLocation && !x.location,
    observedAt: Number.isNaN(observed) || observed > now + 60_000,
    measurements,
  };
}

export const hasProblems = (p: ReturnType<typeof draftProblems>) =>
  p.project ||
  p.type ||
  p.photo ||
  p.location ||
  p.observedAt ||
  Object.keys(p.measurements).length > 0;

/** A map of the spot, for whoever may see it (approximate for some roles). */
export const mapLink = (lat: string, lng: string) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
