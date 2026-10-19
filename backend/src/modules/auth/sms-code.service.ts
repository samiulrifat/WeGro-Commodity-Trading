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
import { SmsCode, SmsCodePurpose } from './entities/sms-code.entity';
import { SmsSender } from './sms/sms-sender';

/** How long a code is good for. */
export const CODE_MINUTES = 10;
/** Before another code may be asked for, per number and purpose. */
export const RESEND_SECONDS = 60;
/** Codes per number and purpose in any hour. */
export const CODES_PER_HOUR = 5;
/** Wrong codes before the code stops working. */
export const CODE_TRIES = 5;

const MINUTE = 60_000;

const bengaliDigits = (n: number) =>
  String(n).replace(/\d/g, (d) => String.fromCharCode(0x09e6 + Number(d)));

/** The message, in the person's language. The code stays in plain digits to type. */
function message(
  purpose: SmsCodePurpose,
  language: Language | null,
  code: string,
): string {
  const bengali = language === Language.BENGALI;
  const what =
    purpose === SmsCodePurpose.PASSWORD_RESET
      ? bengali
        ? 'পাসওয়ার্ড বদলানোর কোড'
        : 'your password reset code is'
      : bengali
        ? 'এই নম্বর নিশ্চিত করার কোড'
        : 'your code to confirm this number is';
  return bengali
    ? `WeGro: ${what} ${code}। ${bengaliDigits(CODE_MINUTES)} মিনিট পর্যন্ত বৈধ। কাউকে জানাবেন না।`
    : `WeGro: ${what} ${code}. It expires in ${CODE_MINUTES} minutes. Never share it.`;
}

export interface CodeIssued {
  resendAfterSeconds: number;
  expiresInSeconds: number;
}

/** What checking a code found. Refusals are raised after the transaction, so a wrong try still counts. */
export type CodeChecked =
  | { ok: true; row: SmsCode & { userId: string } }
  | { ok: false; refusal: UnprocessableEntityException };

const refused = (refusal: UnprocessableEntityException): CodeChecked => ({
  ok: false,
  refusal,
});

/**
 * 6-digit codes by SMS, for one purpose each: a forgotten password, or
 * confirming a new mobile number. Only a keyed hash is stored; the limits
 * apply per number and purpose, and one number's requests are serialised (an
 * advisory lock), so they hold however many arrive at once.
 */
@Injectable()
export class SmsCodeService {
  private readonly logger = new Logger(SmsCodeService.name);

  constructor(
    @InjectRepository(SmsCode) private readonly codes: Repository<SmsCode>,
    private readonly codec: PersonalDetailsCodec,
    private readonly crypto: IdentityCryptoService,
    private readonly sms: SmsSender,
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
   * Issues a code for `phone` and texts it, unless `to` is null (an
   * unregistered number asking for a reset: the answer must look the same,
   * so a row is still kept and the limits still apply).
   */
  async issue(
    purpose: SmsCodePurpose,
    phone: string,
    to: { userId: string; language: Language | null } | null,
  ): Promise<CodeIssued> {
    const phoneIndex = this.codec.phoneIndex(phone);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.codes.manager.transaction(async (m) => {
      await this.lock(m, purpose, phoneIndex);
      const now = Date.now();
      const recent = await m.find(SmsCode, {
        where: {
          purpose,
          phoneIndex,
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
            code: ErrorCode.SMS_CODE_WAIT,
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
            message: `Too many codes for this number. Try again in ${minutes} minutes.`,
            code: ErrorCode.SMS_CODE_TOO_MANY,
            details: { minutes },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      // One code at a time: earlier ones stop working.
      await m.update(
        SmsCode,
        { purpose, phoneIndex, closedAt: IsNull() },
        { closedAt: new Date(now) },
      );
      await m.insert(SmsCode, {
        purpose,
        phoneIndex,
        userId: to?.userId ?? null,
        codeHash: this.hash(purpose, phoneIndex, code),
        expiresAt: new Date(now + CODE_MINUTES * MINUTE),
      });
      // Housekeeping: this number's codes older than a day.
      await m.query(
        `DELETE FROM "sms_codes" WHERE "purpose" = $1 AND "phone_index" = $2 AND "created_at" < now() - interval '1 day'`,
        [purpose, phoneIndex],
      );
    });
    if (to) {
      // Not awaited: the answer takes as long whether or not a text goes out.
      void this.sms
        .send(phone, message(purpose, to.language, code))
        .catch((error: unknown) =>
          this.logger.error(`Code not sent: ${String(error)}`),
        );
    }
    return {
      resendAfterSeconds: RESEND_SECONDS,
      expiresInSeconds: CODE_MINUTES * 60,
    };
  }

  /**
   * The number's open code, if `code` is it (and, when `userId` is given,
   * issued to that person). A wrong code counts against it; the last allowed
   * wrong try closes it. A code for an unregistered number was never sent, so
   * it is always wrong. Run inside the caller's transaction.
   */
  async check(
    m: EntityManager,
    purpose: SmsCodePurpose,
    phone: string,
    code: string,
    userId?: string,
  ): Promise<CodeChecked> {
    const phoneIndex = this.codec.phoneIndex(phone);
    await this.lock(m, purpose, phoneIndex);
    const row = await m.findOne(SmsCode, {
      where: {
        purpose,
        phoneIndex,
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
          code: ErrorCode.SMS_CODE_EXPIRED,
        }),
      );
    }
    if (row.userId && row.codeHash === this.hash(purpose, phoneIndex, code)) {
      return { ok: true, row: row as SmsCode & { userId: string } };
    }
    const attempts = row.attempts + 1;
    const attemptsLeft = CODE_TRIES - attempts;
    await m.update(
      SmsCode,
      { id: row.id },
      { attempts, ...(attemptsLeft <= 0 && { closedAt: new Date() }) },
    );
    return refused(
      attemptsLeft <= 0
        ? new UnprocessableEntityException({
            message: 'Too many wrong codes. Ask for a new one.',
            code: ErrorCode.SMS_CODE_EXPIRED,
          })
        : new UnprocessableEntityException({
            message: `That code is not right. ${attemptsLeft} tries left.`,
            code: ErrorCode.SMS_CODE_WRONG,
            details: { attemptsLeft },
          }),
    );
  }

  /** Used up: it will not be accepted again. */
  async close(m: EntityManager, id: string): Promise<void> {
    await m.update(SmsCode, { id }, { closedAt: new Date() });
  }

  private hash(purpose: SmsCodePurpose, phoneIndex: string, code: string) {
    return this.crypto.blindIndex(
      'sms-code',
      `${purpose}:${phoneIndex}:${code}`,
    );
  }

  /** One number's requests for one purpose at a time, until the transaction ends. */
  private lock(
    m: EntityManager,
    purpose: SmsCodePurpose,
    phoneIndex: string,
  ): Promise<unknown> {
    return m.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `sms-code:${purpose}:${phoneIndex}`,
    ]);
  }
}
