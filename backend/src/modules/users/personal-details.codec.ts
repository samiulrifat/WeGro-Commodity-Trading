import { Injectable } from '@nestjs/common';
import { fingerprint } from '../../blockchain/utils/fingerprint';
import { IdentityCryptoService } from '../../common/crypto/identity-crypto.service';
import {
  nidIdentity,
  type NormalisedDetails,
} from '../participants/id-check/id-check';
import type { PersonalDetails } from './entities/personal-details.entity';
import type { Role } from './roles';

/** Details after decryption. NID, birth date, address and district are absent only for the super admin. */
export interface PlainDetails {
  fullName: string;
  phone: string;
  nid: string | null;
  dateOfBirth: string | null;
  district: string | null;
  address: string | null;
}

type EncryptedField =
  | 'fullNameEnc'
  | 'phoneEnc'
  | 'nidEnc'
  | 'dateOfBirthEnc'
  | 'addressEnc'
  | 'emailEnc';

/** Fingerprint layout version, part of the hashed data. */
const FINGERPRINT_VERSION = 1;

/**
 * Turns a person's details into their stored form (encrypted fields and
 * lookup indexes) and back, and computes the fingerprint put on the ledger.
 */
@Injectable()
export class PersonalDetailsCodec {
  constructor(private readonly crypto: IdentityCryptoService) {}

  phoneIndex(normalisedPhone: string): string {
    return this.crypto.blindIndex('phone', normalisedPhone);
  }

  /** Of a normalised (trimmed, lower-case) address. */
  emailIndex(normalisedEmail: string): string {
    return this.crypto.blindIndex('email', normalisedEmail);
  }

  sealEmail(userId: string, email: string): string {
    return this.crypto.encrypt(email, context(userId, 'emailEnc'));
  }

  openEmail(row: Pick<PersonalDetails, 'userId' | 'emailEnc'>): string | null {
    return row.emailEnc
      ? this.crypto.decrypt(row.emailEnc, context(row.userId, 'emailEnc'))
      : null;
  }

  /** 13- and 17-digit forms of the same old NID share one index. */
  nidIndex(nid: string): string {
    return this.crypto.blindIndex('nid', nidIdentity(nid));
  }

  /** The identity details (never the email, which is kept apart). */
  seal(
    userId: string,
    d: NormalisedDetails,
  ): Omit<
    PersonalDetails,
    'updatedAt' | 'user' | 'detailsHash' | 'idCheck' | 'emailEnc'
  > {
    const enc = (field: EncryptedField, value: string) =>
      this.crypto.encrypt(value, context(userId, field));
    return {
      userId,
      fullNameEnc: enc('fullNameEnc', d.fullName),
      phoneEnc: enc('phoneEnc', d.phone),
      nidEnc: enc('nidEnc', d.nid),
      dateOfBirthEnc: enc('dateOfBirthEnc', d.dateOfBirth),
      addressEnc: enc('addressEnc', d.address),
      district: d.district,
      nidIndex: this.nidIndex(d.nid),
    };
  }

  /** The super admin's row: name and phone only. */
  sealOperator(userId: string, fullName: string, phone: string) {
    return {
      userId,
      fullNameEnc: this.crypto.encrypt(
        fullName,
        context(userId, 'fullNameEnc'),
      ),
      phoneEnc: this.crypto.encrypt(phone, context(userId, 'phoneEnc')),
      nidEnc: null,
      dateOfBirthEnc: null,
      addressEnc: null,
      district: null,
      nidIndex: null,
    };
  }

  /** Throws if any field was tampered with or moved between rows. */
  open(row: PersonalDetails): PlainDetails {
    const dec = (field: EncryptedField) => {
      const value = row[field];
      return value === null
        ? null
        : this.crypto.decrypt(value, context(row.userId, field));
    };
    return {
      fullName: dec('fullNameEnc')!,
      phone: dec('phoneEnc')!,
      nid: dec('nidEnc'),
      dateOfBirth: dec('dateOfBirthEnc'),
      district: row.district,
      address: dec('addressEnc'),
    };
  }

  /** Name only: for lists, without decrypting fields nobody will see. */
  openName(row: Pick<PersonalDetails, 'userId' | 'fullNameEnc'>): string {
    return this.crypto.decrypt(
      row.fullNameEnc,
      context(row.userId, 'fullNameEnc'),
    );
  }

  openPhone(row: Pick<PersonalDetails, 'userId' | 'phoneEnc'>): string {
    return this.crypto.decrypt(row.phoneEnc, context(row.userId, 'phoneEnc'));
  }

  /**
   * The salted fingerprint registered on-chain (detailsHash). Covers every
   * detail plus the participant id and role, so it can only ever match this
   * person's record.
   */
  fingerprint(userId: string, role: Role, d: NormalisedDetails): string {
    return fingerprint('participant.details', {
      v: FINGERPRINT_VERSION,
      participantId: userId,
      role,
      fullName: d.fullName,
      phone: d.phone,
      nid: d.nid,
      dateOfBirth: d.dateOfBirth,
      district: d.district,
      address: d.address,
      salt: this.crypto.detailsSalt(userId),
    });
  }
}

/** Associated data binding a ciphertext to its row and column. */
function context(userId: string, field: EncryptedField): string {
  return `personal_details.${field}:${userId}`;
}
