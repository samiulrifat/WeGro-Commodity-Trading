import { randomInt } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, IsNull, MoreThan, Repository } from 'typeorm';
import { IdentityCryptoService } from '../../common/crypto/identity-crypto.service';
import { ErrorCode } from '../../common/errors/error-code';
import { normalisePhone } from '../participants/id-check/id-check';
import { Language } from '../users/language';
import { PersonalDetailsCodec } from '../users/personal-details.codec';
import { EmailSender } from './email/email-sender';
import {
  CodePurpose,
  VerificationCode,
} from './entities/verification-code.entity';
import { SmsSender } from './sms/sms-sender';

/** How long a code is good for. */
export const CODE_MINUTES = 10;
/** Before another code may be asked for, per number (or address) and purpose. */
export const RESEND_SECONDS = 60;
/** Codes per number (or address) and purpose in any hour. */
export const CODES_PER_HOUR = 5;
/** Wrong codes before the code stops working. */
export const CODE_TRIES = 5;

const MINUTE = 60_000;

const bengaliDigits = (n: number) =>
  String(n).replace(/\d/g, (d) => String.fromCharCode(0x09e6 + Number(d)));

const WHAT: Record<CodePurpose, { en: string; bn: string }> = {
  [CodePurpose.PASSWORD_RESET]: {
    en: 'your password reset code is',
    bn: 'পাসওয়ার্ড বদলানোর কোড',
  },
  [CodePurpose.PHONE_CHANGE]: {
    en: 'your code to confirm this number is',
    bn: 'এই নম্বর নিশ্চিত করার কোড',
  },
  [CodePurpose.SIGN_UP]: {
    en: 'your sign-up code is',
    bn: 'নিবন্ধনের কোড',
  },
  [CodePurpose.EMAIL]: {
    en: 'your code to confirm this email address is',
    bn: 'এই ইমেইল ঠিকানা নিশ্চিত করার কোড',
  },
};

/** The message, in the person's language. The code stays in plain digits to type. */
function message(
  purpose: CodePurpose,
  language: Language | null,
  code: string,
): string {
  return language === Language.BENGALI
    ? `WeGro: ${WHAT[purpose].bn} ${code}। ${bengaliDigits(CODE_MINUTES)} মিনিট পর্যন্ত বৈধ। কাউকে জানাবেন না।`
    : `WeGro: ${WHAT[purpose].en} ${code}. It expires in ${CODE_MINUTES} minutes. Never share it.`;
}

/** Codes for these go by email; the rest by SMS. */
const BY_EMAIL: ReadonlySet<CodePurpose> = new Set([CodePurpose.EMAIL]);

/** Lower case, trimmed: one form per address, for its index and its codes. */
export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

export interface CodeIssued {
  resendAfterSeconds: number;
  expiresInSeconds: number;
}

/** What checking a code found. Refusals are raised after the transaction, so a wrong try still counts. */
export type CodeChecked =
  | { ok: true; row: VerificationCode }
  | { ok: false; refusal: UnprocessableEntityException };

const refused = (refusal: UnprocessableEntityException): CodeChecked => ({
  ok: false,
  refusal,
});

/**
 * 6-digit codes, for one purpose each: by SMS for a forgotten password, a new
 * mobile number or signing up; by email to confirm an address. `target` is a
 * normalised number or address. Only a keyed hash is stored; the limits apply
 * per target and purpose, and one target's requests are serialised (an
 * advisory lock), so they hold however many arrive at once.
 */
@Injectable()
export class VerificationCodeService {
  private readonly logger = new Logger(VerificationCodeService.name);

  constructor(
    @InjectRepository(VerificationCode)
    private readonly codes: Repository<VerificationCode>,
    private readonly codec: PersonalDetailsCodec,
    private readonly crypto: IdentityCryptoService,
    private readonly sms: SmsSender,
    private readonly email: EmailSender,
  ) {}

  /** A normalised number, or the reason it is not one. */
  phone(input: string): string {
    const phone = normalisePhone(input);
    if (!phone) {
      throw new UnprocessableEntityException({
        message: 'Enter a Bangladeshi mobile number',
        code: ErrorCode.PHONE_INVALID,
      });
    }
    return phone;
  }

  /**
   * Issues a code for `target` (a normalised number or address) and sends
   * it, unless `to` is null (an unregistered number asking for a reset: the
   * answer must look the same, so a row is still kept and the limits still
   * apply). `to.userId` is null for someone without an account yet.
   */
  async issue(
    purpose: CodePurpose,
    target: string,
    to: { userId: string | null; language: Language | null } | null,
  ): Promise<CodeIssued> {
    const targetIndex = this.indexOf(purpose, target);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.codes.manager.transaction(async (m) => {
      await this.lock(m, purpose, targetIndex);
      const now = Date.now();
      const recent = await m.find(VerificationCode, {
        where: {
          purpose,
          targetIndex,
          createdAt: MoreThan(new Date(now - 60 * MINUTE)),
        },
        order: { createdAt: 'DESC' },
        select: { id: true, createdAt: true },
      });
      const last = recent[0];
      if (last && now - last.createdAt.getTime() < RESEND_SECONDS * 1000) {
        const seconds = Math.ceil(
          RESEND_SECONDS - (now - last.createdAt.getTime()) / 1000,
        );
        throw new HttpException(
          {
            message: `Wait ${seconds} seconds before asking for another code`,
            code: ErrorCode.CODE_WAIT,
            details: { seconds },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (recent.length >= CODES_PER_HOUR) {
        const oldest = recent[recent.length - 1]!.createdAt.getTime();
        const minutes = Math.ceil((oldest + 60 * MINUTE - now) / MINUTE);
        throw new HttpException(
          {
            message: `Too many codes for this number or address. Try again in ${minutes} minutes.`,
            code: ErrorCode.CODE_TOO_MANY,
            details: { minutes },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      // One code at a time: earlier ones stop working.
      await m.update(
        VerificationCode,
        { purpose, targetIndex, closedAt: IsNull() },
        { closedAt: new Date(now) },
      );
      await m.insert(VerificationCode, {
        purpose,
        targetIndex,
        userId: to?.userId ?? null,
        sent: to !== null,
        codeHash: this.hash(purpose, targetIndex, code),
        expiresAt: new Date(now + CODE_MINUTES * MINUTE),
      });
      // Housekeeping: this target's codes older than a day.
      await m.query(
        `DELETE FROM "verification_codes" WHERE "purpose" = $1 AND "target_index" = $2 AND "created_at" < now() - interval '1 day'`,
        [purpose, targetIndex],
      );
    });
    if (to) {
      // Not awaited: the answer takes as long whether or not a code goes out.
      const text = message(purpose, to.language, code);
      const sending = BY_EMAIL.has(purpose)
        ? this.email.send(
            target,
            to.language === Language.BENGALI
              ? 'WeGro: আপনার কোড'
              : 'WeGro: your code',
            text,
          )
        : this.sms.send(target, text);
      void sending.catch((error: unknown) =>
        this.logger.error(`Code not sent: ${String(error)}`),
      );
    }
    return {
      resendAfterSeconds: RESEND_SECONDS,
      expiresInSeconds: CODE_MINUTES * 60,
    };
  }

  /**
   * The target's open code, if `code` is it (and, when `userId` is given,
   * issued to that person). A wrong code counts against it; the last allowed
   * wrong try closes it. A code never sent (a reset for an unregistered
   * number) is always wrong. Run inside the caller's transaction.
   */
  async check(
    m: EntityManager,
    purpose: CodePurpose,
    target: string,
    code: string,
    userId?: string,
  ): Promise<CodeChecked> {
    const targetIndex = this.indexOf(purpose, target);
    await this.lock(m, purpose, targetIndex);
    const row = await m.findOne(VerificationCode, {
      where: {
        purpose,
        targetIndex,
        closedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
        ...(userId && { userId }),
      },
      order: { createdAt: 'DESC' },
    });
    if (!row) {
      return refused(
        new UnprocessableEntityException({
          message: 'This code has expired. Ask for a new one.',
          code: ErrorCode.CODE_EXPIRED,
        }),
      );
    }
    if (row.sent && row.codeHash === this.hash(purpose, targetIndex, code)) {
      return { ok: true, row };
    }
    const attempts = row.attempts + 1;
    const attemptsLeft = CODE_TRIES - attempts;
    await m.update(
      VerificationCode,
      { id: row.id },
      { attempts, ...(attemptsLeft <= 0 && { closedAt: new Date() }) },
    );
    return refused(
      attemptsLeft <= 0
        ? new UnprocessableEntityException({
            message: 'Too many wrong codes. Ask for a new one.',
            code: ErrorCode.CODE_EXPIRED,
          })
        : new UnprocessableEntityException({
            message: `That code is not right. ${attemptsLeft} tries left.`,
            code: ErrorCode.CODE_WRONG,
            details: { attemptsLeft },
          }),
    );
  }

  /** Used up: it will not be accepted again. */
  async close(m: EntityManager, id: string): Promise<void> {
    await m.update(VerificationCode, { id }, { closedAt: new Date() });
  }

  /** The number's index as on users, or the address's as on users. */
  private indexOf(purpose: CodePurpose, target: string): string {
    return BY_EMAIL.has(purpose)
      ? this.codec.emailIndex(target)
      : this.codec.phoneIndex(target);
  }

  private hash(purpose: CodePurpose, targetIndex: string, code: string) {
    return this.crypto.blindIndex('code', `${purpose}:${targetIndex}:${code}`);
  }

  /** One target's requests for one purpose at a time, until the transaction ends. */
  private lock(
    m: EntityManager,
    purpose: CodePurpose,
    targetIndex: string,
  ): Promise<unknown> {
    return m.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `code:${purpose}:${targetIndex}`,
    ]);
  }
}
