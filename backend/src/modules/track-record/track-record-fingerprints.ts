import { fingerprint } from '../../blockchain/utils/fingerprint';
import type { Bank } from './entities/bank.entity';

/** The ledger's detailsHash for a bank. */
export function bankFingerprint(
  b: Pick<Bank, 'id' | 'name' | 'branchName' | 'districtCode' | 'address'>,
): string {
  return fingerprint('consent.bank', {
    v: 1,
    bankId: b.id,
    name: b.name,
    branchName: b.branchName,
    districtCode: b.districtCode,
    address: b.address,
  });
}

/**
 * The ledger's evidenceHash for a grant: the farmer's signed form, bound to
 * this grant, farmer, bank and expiry.
 */
export function consentFingerprint(c: {
  consentId: string;
  farmerId: string;
  bankId: string;
  expiresAt: number;
  photoHash: string;
}): string {
  return fingerprint('consent.grant', { v: 1, ...c });
}
