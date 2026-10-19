import {
  DISTRICT_BY_GEO,
  type DistrictCode,
  isDistrictCode,
} from '../../../common/reference/bd-districts';

/**
 * The practice ID check: strict, deterministic rules run on a person's
 * details before they are registered. Nothing here touches the database or
 * the network, so the same input always gives the same result.
 *
 * A `fail` blocks registration. A `warn` is a mismatch an honest person can
 * have (e.g. living outside the district their NID was issued in); it is
 * recorded and the admin must acknowledge it before verifying.
 *
 * Messages never repeat the personal details themselves: results are stored
 * and shown in lists, and must not leak data.
 */
export const ID_CHECK_VERSION = 1;

export type CheckResult = 'pass' | 'warn' | 'fail';

/**
 * Why a rule passed, warned or failed: one per outcome, so the app can word
 * it in the reader's language (with `params`). `message` stays the English.
 */
export enum IdCheckReason {
  NAME_OK = 'NAME_OK',
  NAME_LENGTH = 'NAME_LENGTH',
  NAME_CHARACTERS = 'NAME_CHARACTERS',
  PHONE_OK = 'PHONE_OK',
  PHONE_FORMAT = 'PHONE_FORMAT',
  DATE_OF_BIRTH_INVALID = 'DATE_OF_BIRTH_INVALID',
  DATE_OF_BIRTH_FUTURE = 'DATE_OF_BIRTH_FUTURE',
  AGE_OK = 'AGE_OK',
  AGE_UNDER = 'AGE_UNDER',
  AGE_OVER = 'AGE_OVER',
  DISTRICT_OK = 'DISTRICT_OK',
  DISTRICT_UNKNOWN = 'DISTRICT_UNKNOWN',
  ADDRESS_OK = 'ADDRESS_OK',
  ADDRESS_LENGTH = 'ADDRESS_LENGTH',
  ADDRESS_CONTROL = 'ADDRESS_CONTROL',
  NID_OK = 'NID_OK',
  NID_DIGITS = 'NID_DIGITS',
  NID_LENGTH = 'NID_LENGTH',
  NID_PLACEHOLDER = 'NID_PLACEHOLDER',
  NID_BIRTH_YEAR_OK = 'NID_BIRTH_YEAR_OK',
  NID_BIRTH_YEAR_UNCHECKED = 'NID_BIRTH_YEAR_UNCHECKED',
  NID_BIRTH_YEAR_MISMATCH = 'NID_BIRTH_YEAR_MISMATCH',
  NID_DISTRICT_OK = 'NID_DISTRICT_OK',
  NID_DISTRICT_UNKNOWN = 'NID_DISTRICT_UNKNOWN',
  NID_DISTRICT_DIFFERENT = 'NID_DISTRICT_DIFFERENT',
}

export interface CheckOutcome {
  /** The rule (NAME, NID_FORMAT, ...). */
  code: string;
  result: CheckResult;
  /** Absent on reports saved before reasons were recorded. */
  reason?: IdCheckReason;
  message: string;
  params?: Record<string, string | number>;
}

export interface IdCheckInput {
  fullName: string;
  phone: string;
  nid: string;
  dateOfBirth: string;
  district: string;
  address: string;
}

/** The details as stored and fingerprinted: one canonical form per person. */
export interface NormalisedDetails {
  fullName: string;
  /** +8801XXXXXXXXX */
  phone: string;
  /** Digits only, as written on the card (10, 13 or 17 digits). */
  nid: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  district: DistrictCode;
  address: string;
}

export interface IdCheckReport {
  version: number;
  outcome: 'passed' | 'flagged' | 'failed';
  checks: CheckOutcome[];
  /** Present unless the outcome is `failed`. */
  details?: NormalisedDetails;
}

export const MIN_AGE_YEARS = 18;
const MAX_AGE_YEARS = 120;
const NAME_MIN = 2;
const NAME_MAX = 100;
const ADDRESS_MIN = 5;
const ADDRESS_MAX = 300;
/** Dates are judged by the calendar day in Bangladesh (UTC+6, no DST). */
const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

// --- Normalisation ---

const BENGALI_ZERO = 0x09e6;

/** Bengali digits (০-৯) -> ASCII, so either keyboard gives the same value. */
export function toAsciiDigits(value: string): string {
  return value.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - BENGALI_ZERO));
}

/** NFC, trimmed, inner whitespace collapsed to single spaces. */
export function normaliseText(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** +8801XXXXXXXXX, or null if it is not a Bangladeshi mobile number. */
export function normalisePhone(value: string): string | null {
  const compact = toAsciiDigits(value).replace(/[\s\-().]/g, '');
  const m = /^(?:\+?88)?(01[3-9]\d{8})$/.exec(compact);
  return m ? `+88${m[1]}` : null;
}

/** Digits only, or null if anything other than digits, spaces and hyphens is present. */
export function normaliseNid(value: string): string | null {
  const compact = toAsciiDigits(value).replace(/[\s-]/g, '');
  return /^\d+$/.test(compact) ? compact : null;
}

/**
 * The part of an NID that identifies the person regardless of format: a
 * 17-digit NID is the birth year followed by the 13-digit NID, so both are
 * reduced to the 13 digits. Used for duplicate detection.
 */
export function nidIdentity(nid: string): string {
  return nid.length === 17 ? nid.slice(4) : nid;
}

// --- The check ---

export function runIdCheck(
  input: IdCheckInput,
  now = new Date(),
): IdCheckReport {
  const checks: CheckOutcome[] = [];
  const add: Add = (code, result, reason, message, params) =>
    checks.push(
      params
        ? { code, result, reason, message, params }
        : { code, result, reason, message },
    );

  const fullName = normaliseText(input.fullName);
  checkName(fullName, add);

  const phone = normalisePhone(input.phone);
  if (phone) {
    add(
      'PHONE_FORMAT',
      'pass',
      IdCheckReason.PHONE_OK,
      'Bangladeshi mobile number',
    );
  } else {
    add(
      'PHONE_FORMAT',
      'fail',
      IdCheckReason.PHONE_FORMAT,
      'Phone must be a Bangladeshi mobile number: 01 then 9 digits (3rd digit 3-9), optionally starting +88',
    );
  }

  const dob = parseDate(toAsciiDigits(input.dateOfBirth.trim()));
  checkDateOfBirth(dob, now, add);

  const district = input.district.trim().toUpperCase();
  if (isDistrictCode(district)) {
    add('DISTRICT', 'pass', IdCheckReason.DISTRICT_OK, 'Known district');
  } else {
    add(
      'DISTRICT',
      'fail',
      IdCheckReason.DISTRICT_UNKNOWN,
      'District must be one of the 64 districts',
    );
  }

  const address = normaliseText(input.address);
  if (address.length < ADDRESS_MIN || address.length > ADDRESS_MAX) {
    add(
      'ADDRESS',
      'fail',
      IdCheckReason.ADDRESS_LENGTH,
      `Address must be ${ADDRESS_MIN} to ${ADDRESS_MAX} characters`,
      { min: ADDRESS_MIN, max: ADDRESS_MAX },
    );
  } else if (/\p{Cc}/u.test(address)) {
    add(
      'ADDRESS',
      'fail',
      IdCheckReason.ADDRESS_CONTROL,
      'Address contains control characters',
    );
  } else {
    add('ADDRESS', 'pass', IdCheckReason.ADDRESS_OK, 'Address given');
  }

  const nid = normaliseNid(input.nid);
  checkNid(nid, dob, isDistrictCode(district) ? district : null, add);

  const failed = checks.some((c) => c.result === 'fail');
  const flagged = checks.some((c) => c.result === 'warn');
  return {
    version: ID_CHECK_VERSION,
    outcome: failed ? 'failed' : flagged ? 'flagged' : 'passed',
    checks,
    details: failed
      ? undefined
      : {
          fullName,
          phone: phone!,
          nid: nid!,
          dateOfBirth: formatDate(dob!),
          district: district as DistrictCode,
          address,
        },
  };
}

type Add = (
  code: string,
  result: CheckResult,
  reason: IdCheckReason,
  message: string,
  params?: Record<string, string | number>,
) => void;

function checkName(name: string, add: Add): void {
  // Letters and combining marks (Bengali vowel signs are marks), with
  // spaces, dots, hyphens and apostrophes between them.
  const shape = /^[\p{L}\p{M}]+(?:[ .'-]+[\p{L}\p{M}]+)*\.?$/u;
  const letters = name.match(/\p{L}/gu)?.length ?? 0;
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    add(
      'NAME',
      'fail',
      IdCheckReason.NAME_LENGTH,
      `Name must be ${NAME_MIN} to ${NAME_MAX} characters`,
      { min: NAME_MIN, max: NAME_MAX },
    );
  } else if (!shape.test(name) || letters < 2) {
    add(
      'NAME',
      'fail',
      IdCheckReason.NAME_CHARACTERS,
      'Name may contain only letters, spaces, dots, hyphens and apostrophes',
    );
  } else {
    add('NAME', 'pass', IdCheckReason.NAME_OK, 'Name is well formed');
  }
}

function checkDateOfBirth(dob: UtcDate | null, now: Date, add: Add): void {
  if (!dob) {
    add(
      'DATE_OF_BIRTH',
      'fail',
      IdCheckReason.DATE_OF_BIRTH_INVALID,
      'Date of birth must be a real date as YYYY-MM-DD',
    );
    return;
  }
  const age = ageOn(dob, bdToday(now));
  if (age < 0) {
    add(
      'DATE_OF_BIRTH',
      'fail',
      IdCheckReason.DATE_OF_BIRTH_FUTURE,
      'Date of birth is in the future',
    );
  } else if (age < MIN_AGE_YEARS) {
    add(
      'AGE',
      'fail',
      IdCheckReason.AGE_UNDER,
      `Must be at least ${MIN_AGE_YEARS} years old`,
      { min: MIN_AGE_YEARS },
    );
  } else if (age > MAX_AGE_YEARS) {
    add(
      'AGE',
      'fail',
      IdCheckReason.AGE_OVER,
      `Age over ${MAX_AGE_YEARS} years is not plausible`,
      { max: MAX_AGE_YEARS },
    );
  } else {
    add(
      'AGE',
      'pass',
      IdCheckReason.AGE_OK,
      `At least ${MIN_AGE_YEARS} years old`,
      { min: MIN_AGE_YEARS },
    );
  }
}

function checkNid(
  nid: string | null,
  dob: UtcDate | null,
  district: DistrictCode | null,
  add: Add,
): void {
  if (!nid) {
    add(
      'NID_FORMAT',
      'fail',
      IdCheckReason.NID_DIGITS,
      'NID may contain only digits (spaces and hyphens are ignored)',
    );
    return;
  }
  if (nid.length !== 10 && nid.length !== 13 && nid.length !== 17) {
    add(
      'NID_FORMAT',
      'fail',
      IdCheckReason.NID_LENGTH,
      'NID must have 10 (smart card), 13 or 17 digits',
    );
    return;
  }
  if (
    /^(\d)\1+$/.test(nid) ||
    '01234567890123456789'.includes(nid) ||
    '98765432109876543210'.includes(nid)
  ) {
    add(
      'NID_FORMAT',
      'fail',
      IdCheckReason.NID_PLACEHOLDER,
      'NID is a placeholder pattern, not a real number',
    );
    return;
  }
  add('NID_FORMAT', 'pass', IdCheckReason.NID_OK, `${nid.length}-digit NID`, {
    digits: nid.length,
  });

  if (nid.length === 17) {
    // The 17-digit form is the birth year followed by the 13-digit NID.
    const year = Number(nid.slice(0, 4));
    if (!dob) {
      add(
        'NID_BIRTH_YEAR',
        'fail',
        IdCheckReason.NID_BIRTH_YEAR_UNCHECKED,
        'Cannot compare the NID birth year without a valid date of birth',
      );
    } else if (year !== dob.year) {
      add(
        'NID_BIRTH_YEAR',
        'fail',
        IdCheckReason.NID_BIRTH_YEAR_MISMATCH,
        'The first 4 digits of a 17-digit NID must be the birth year',
      );
    } else {
      add(
        'NID_BIRTH_YEAR',
        'pass',
        IdCheckReason.NID_BIRTH_YEAR_OK,
        'Birth year matches the NID',
      );
    }
  }

  if (nid.length !== 10) {
    // Old NIDs begin with the geo-code of the district they were issued in.
    const geo = nidIdentity(nid).slice(0, 2);
    const issued = DISTRICT_BY_GEO.get(geo);
    if (!issued) {
      add(
        'NID_DISTRICT',
        'warn',
        IdCheckReason.NID_DISTRICT_UNKNOWN,
        'NID does not begin with a known district code',
      );
    } else if (district && issued !== district) {
      // District names are public reference data, not the person's details.
      add(
        'NID_DISTRICT',
        'warn',
        IdCheckReason.NID_DISTRICT_DIFFERENT,
        'NID was issued in a different district from the one given',
        { issued, given: district },
      );
    } else {
      add(
        'NID_DISTRICT',
        'pass',
        IdCheckReason.NID_DISTRICT_OK,
        'NID district code is valid',
      );
    }
  }
}

// --- Dates, in whole calendar days ---

interface UtcDate {
  year: number;
  month: number;
  day: number;
}

function parseDate(value: string): UtcDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  // Round trip rejects 2023-02-30 and similar.
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function bdToday(now: Date): UtcDate {
  const d = new Date(now.getTime() + BD_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** Whole years from `dob` to `today`; negative if `dob` is after `today`. */
function ageOn(dob: UtcDate, today: UtcDate): number {
  if (
    dob.year > today.year ||
    (dob.year === today.year &&
      (dob.month > today.month ||
        (dob.month === today.month && dob.day > today.day)))
  ) {
    return -1;
  }
  let age = today.year - dob.year;
  if (
    today.month < dob.month ||
    (today.month === dob.month && today.day < dob.day)
  ) {
    age--;
  }
  return age;
}

function formatDate(d: UtcDate): string {
  return `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}
