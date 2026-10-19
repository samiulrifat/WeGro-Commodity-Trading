import type {
  DetailChangeRequestDto,
  DetailField,
  OwnDetailsDto,
} from '@/api/generated/participants';
import type { District } from '@/api/generated/codes';
import { latinDigits } from '@/lib/format';

/** Every detail, in the order shown. */
export const DETAIL_FIELDS: readonly DetailField[] = [
  'fullName',
  'phone',
  'nid',
  'dateOfBirth',
  'district',
  'address',
];

/** The super admin keeps only a name and a number. */
export const OPERATOR_FIELDS: readonly DetailField[] = ['fullName', 'phone'];

/** The form as typed: every value a string, the district '' until chosen. */
export type DetailsDraft = Record<Exclude<DetailField, 'district'>, string> & {
  district: District | '';
};

/** 01712345678, from +8801712345678, 8801…, with spaces or Bengali digits. */
export function localPhone(value: string): string {
  return latinDigits(value)
    .replace(/[\s\-().]/g, '')
    .replace(/^\+?88(?=01)/, '');
}

export function draftOf(current: OwnDetailsDto): DetailsDraft {
  return {
    fullName: current.fullName,
    phone: localPhone(current.phone),
    nid: current.nid ?? '',
    dateOfBirth: current.dateOfBirth ?? '',
    district: (current.district as District | null | undefined) ?? '',
    address: current.address ?? '',
  };
}

/** Fields left empty: all of them count, or only `fields` for the super admin. */
export function missingFields(
  draft: DetailsDraft,
  fields: readonly DetailField[],
): DetailField[] {
  return fields.filter((f) => !draft[f].trim());
}

/** What the server is sent; the server normalises and checks it again. */
export function requestOf(
  draft: DetailsDraft,
  fields: readonly DetailField[],
  phoneCode: string | undefined,
): DetailChangeRequestDto {
  const all: DetailChangeRequestDto = {
    fullName: draft.fullName.trim(),
    phone: localPhone(draft.phone),
    nid: latinDigits(draft.nid).replace(/[\s-]/g, ''),
    dateOfBirth: draft.dateOfBirth,
    district: draft.district || undefined,
    address: draft.address.trim(),
  };
  const request = Object.fromEntries(
    fields.map((f) => [f, all[f]]),
  ) as DetailChangeRequestDto;
  return phoneCode ? { ...request, phoneCode } : request;
}
