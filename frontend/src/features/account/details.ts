import type {
  DetailChangeRequestDto,
  DetailField,
} from '@/api/generated/participants';
import { type PersonDraft, personRequest } from '@/features/people/person';

/** What the server is sent: only the details that apply, with the code for a new number. */
export function requestOf(
  draft: PersonDraft,
  fields: readonly DetailField[],
  phoneCode: string | undefined,
): DetailChangeRequestDto {
  const all: DetailChangeRequestDto = {
    ...personRequest(draft),
    district: draft.district || undefined,
  };
  const request = Object.fromEntries(
    fields.map((f) => [f, all[f]]),
  ) as DetailChangeRequestDto;
  return phoneCode ? { ...request, phoneCode } : request;
}
