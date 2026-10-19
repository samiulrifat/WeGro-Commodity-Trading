import type { District, IdCheckReason } from '@/api/generated/codes';
import type {
  DetailField,
  IdCheckItemDto,
  OwnDetailsDto,
} from '@/api/generated/participants';
import { latinDigits } from '@/lib/format';

/** Every detail of a person, in the order shown. */
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

/** A person's details as typed: every value a string, the district '' until chosen. */
export type PersonDraft = Record<Exclude<DetailField, 'district'>, string> & {
  district: District | '';
};

export const EMPTY_PERSON: PersonDraft = {
  fullName: '',
  phone: '',
  nid: '',
  dateOfBirth: '',
  district: '',
  address: '',
};

/** 01712345678, from +8801712345678, 8801…, with spaces or Bengali digits. */
export function localPhone(value: string): string {
  return latinDigits(value)
    .replace(/[\s\-().]/g, '')
    .replace(/^\+?88(?=01)/, '');
}

/** Digits only, as the card shows them (spaces, hyphens and Bengali digits allowed when typing). */
export function plainNid(value: string): string {
  return latinDigits(value).replace(/[\s-]/g, '');
}

export function draftOf(current: OwnDetailsDto): PersonDraft {
  return {
    fullName: current.fullName,
    phone: localPhone(current.phone),
    nid: current.nid ?? '',
    dateOfBirth: current.dateOfBirth ?? '',
    district: (current.district as District | null | undefined) ?? '',
    address: current.address ?? '',
  };
}

/** Fields of `fields` left empty. */
export function missingFields(
  draft: PersonDraft,
  fields: readonly DetailField[],
): DetailField[] {
  return fields.filter((f) => !draft[f].trim());
}

/** The details as the API takes them; the server normalises and checks them again. */
export function personRequest(draft: PersonDraft) {
  return {
    fullName: draft.fullName.trim(),
    phone: localPhone(draft.phone),
    nid: plainNid(draft.nid),
    dateOfBirth: draft.dateOfBirth,
    district: draft.district as District,
    address: draft.address.trim(),
  };
}

/** Which detail each ID check rule is about. */
const FIELD_OF_RULE: Record<string, DetailField> = {
  NAME: 'fullName',
  PHONE_FORMAT: 'phone',
  DATE_OF_BIRTH: 'dateOfBirth',
  AGE: 'dateOfBirth',
  DISTRICT: 'district',
  ADDRESS: 'address',
  NID_FORMAT: 'nid',
  NID_BIRTH_YEAR: 'nid',
  NID_DISTRICT: 'nid',
};

export const fieldOfRule = (rule: string): DetailField | undefined =>
  FIELD_OF_RULE[rule];

/** A check as the app words it: its reason and values (older checks have only English). */
export type IdCheck = Pick<IdCheckItemDto, 'code' | 'result' | 'message'> & {
  reason?: IdCheckReason;
  params?: Record<string, string | number>;
};
