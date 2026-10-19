import type { ListedBranchDto } from '@/api/generated/bank-list';
import type { ComboboxOption } from '@/components/ui/combobox';
import { latinDigits } from '@/lib/format';

/** As the server takes it: 6 to 20 digits. */
const ACCOUNT_NUMBER = /^\d{6,20}$/;

/** What was typed, as digits: Bengali digits, spaces and hyphens allowed. */
export function accountDigits(text: string): string {
  return latinDigits(text).replace(/[\s-]/g, '');
}

export const isAccountNumber = (text: string) =>
  ACCOUNT_NUMBER.test(accountDigits(text));

/** A collapsed name, as the server keeps it. */
export const holderName = (text: string) => text.trim().replace(/\s+/g, ' ');

/**
 * A district's branches to pick from. A name can occur twice in one
 * district; those show their routing number so the two can be told apart.
 */
export function branchOptions(
  branches: readonly ListedBranchDto[],
): ComboboxOption[] {
  const seen = new Map<string, number>();
  for (const b of branches) seen.set(b.name, (seen.get(b.name) ?? 0) + 1);
  return branches.map((b) => ({
    value: b.routingNumber,
    label:
      (seen.get(b.name) ?? 0) > 1 ? `${b.name} (${b.routingNumber})` : b.name,
  }));
}

/** The verification queue's search, kept in the address. */
export interface BankQueueSearch {
  page?: number;
  /** A mobile number, an NID or words of the payee's name. */
  q?: string;
}

export function parseBankQueueSearch(
  raw: Record<string, unknown>,
): BankQueueSearch {
  const out: BankQueueSearch = {};
  const page = Number(raw.page);
  if (Number.isInteger(page) && page > 1) out.page = page;
  if (typeof raw.q === 'string' && raw.q.trim() && raw.q.length <= 100) {
    out.q = raw.q.trim();
  }
  return out;
}
