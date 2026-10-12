import type { MeasurementDefinition } from '../catalog/entities/field-record-type.entity';

/**
 * Field-record values in one canonical text form, so the same reading always
 * produces the same fingerprint: decimals are strings with exactly the
 * places the definition allows, coordinates have six. No floating point is
 * involved after parsing the input.
 */

const DECIMAL = /^-?(0|[1-9]\d{0,14})(\.\d{1,15})?$/;

/** Number or numeric string -> canonical decimal string, or null if not a plain decimal. */
function asDecimal(value: unknown): string | null {
  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    text = String(value);
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    return null;
  }
  return DECIMAL.test(text) ? text.replace(/^-0(\.0+)?$/, '0') : null;
}

/** "12.5" with 2 places -> "12.50"; null if it has more places than allowed. */
function fixPlaces(decimal: string, places: number): string | null {
  const [whole, fraction = ''] = decimal.split('.');
  if (fraction.replace(/0+$/, '').length > places) return null;
  return places === 0
    ? whole
    : `${whole}.${fraction.padEnd(places, '0').slice(0, places)}`;
}

/** Exact comparison of two canonical decimals (same places). */
function compare(a: string, b: string): number {
  const sign = (s: string) => (s.startsWith('-') ? -1 : 1);
  if (sign(a) !== sign(b)) return sign(a);
  const [aw, af = ''] = a.replace('-', '').split('.');
  const [bw, bf = ''] = b.replace('-', '').split('.');
  const magnitude =
    aw.length !== bw.length
      ? aw.length - bw.length
      : aw !== bw
        ? aw > bw
          ? 1
          : -1
        : af === bf
          ? 0
          : af > bf
            ? 1
            : -1;
  return sign(a) * Math.sign(magnitude);
}

/**
 * Checks the readings against the record type's definitions: known keys only,
 * required ones present, within range, no more decimals than allowed.
 * Returns the canonical readings, or the list of problems.
 */
export function normaliseMeasurements(
  input: Record<string, unknown>,
  defs: readonly MeasurementDefinition[],
): { values: Record<string, string>; problems: string[] } {
  const problems: string[] = [];
  const values: Record<string, string> = {};
  const known = new Map(defs.map((d) => [d.key, d]));
  for (const key of Object.keys(input)) {
    if (!known.has(key))
      problems.push(`${key}: not a measurement of this record type`);
  }
  for (const d of defs) {
    const raw = input[d.key];
    if (raw === undefined || raw === null || raw === '') {
      if (d.required) problems.push(`${d.key}: required`);
      continue;
    }
    const decimal = asDecimal(raw);
    const fixed = decimal === null ? null : fixPlaces(decimal, d.decimals);
    if (fixed === null) {
      problems.push(
        `${d.key}: must be a number with at most ${d.decimals} decimal places`,
      );
      continue;
    }
    if (
      d.min !== null &&
      compare(fixed, fixPlaces(String(d.min), d.decimals)!) < 0
    ) {
      problems.push(`${d.key}: below the minimum ${d.min}`);
    } else if (
      d.max !== null &&
      compare(fixed, fixPlaces(String(d.max), d.decimals)!) > 0
    ) {
      problems.push(`${d.key}: above the maximum ${d.max}`);
    } else {
      values[d.key] = fixed;
    }
  }
  return { values, problems };
}

/** Bangladesh with a margin for GPS error near the borders and the coast. */
const BD_BOUNDS = { minLat: 20.3, maxLat: 26.8, minLng: 87.9, maxLng: 92.8 };

/** Coordinates as canonical 6-place strings (about 0.1 m), inside Bangladesh. */
export function normaliseLocation(
  latitude: unknown,
  longitude: unknown,
): { latitude: string; longitude: string } | { problem: string } {
  const lat = asDecimal(latitude);
  const lng = asDecimal(longitude);
  const latFixed = lat === null ? null : fixPlaces(lat, 6);
  const lngFixed = lng === null ? null : fixPlaces(lng, 6);
  if (latFixed === null || lngFixed === null) {
    return {
      problem:
        'Coordinates must be decimal degrees with at most 6 decimal places',
    };
  }
  const la = Number(latFixed);
  const lo = Number(lngFixed);
  if (
    la < BD_BOUNDS.minLat ||
    la > BD_BOUNDS.maxLat ||
    lo < BD_BOUNDS.minLng ||
    lo > BD_BOUNDS.maxLng
  ) {
    return { problem: 'The location is outside Bangladesh' };
  }
  return { latitude: latFixed, longitude: lngFixed };
}

/** A canonical coordinate rounded half away from zero to 2 places (about 1 km). */
export function roundCoordinate(value: string): string {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  const padded = fraction.padEnd(6, '0');
  let hundredths = BigInt(whole) * 100n + BigInt(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) hundredths += 1n;
  const text = `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')}`;
  return negative && hundredths !== 0n ? `-${text}` : text;
}
