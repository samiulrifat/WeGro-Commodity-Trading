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
import { PasswordHasher } from '../../common/crypto/password-hasher.service';
import { ErrorCode } from '../../common/errors/error-code';
import { normalisePhone } from '../participants/id-check/id-check';
import { User } from '../users/entities/user.entity';
import { Language } from '../users/language';
import { PersonalDetailsCodec } from '../users/personal-details.codec';
import { assertMaySignIn, type SignInResult } from './auth.service';
import { PasswordResetCode } from './entities/password-reset-code.entity';
import { SmsSender } from './sms/sms-sender';
import { TokenService } from './token.service';

/** How long a code is good for. */
export const CODE_MINUTES = 10;
/** Before another code may be asked for, per number. */
export const RESEND_SECONDS = 60;
/** Codes per number in any hour. */
export const CODES_PER_HOUR = 5;
/** Wrong codes before the code stops working. */
export const CODE_TRIES = 5;

const MINUTE = 60_000;

const bengaliDigits = (n: number) =>
  String(n).replace(/\d/g, (d) => String.fromCharCode(0x09e6 + Number(d)));

/** The message, in the person's language. The code stays in plain digits to type. */
function message(language: Language | null, code: string): string {
  return language === Language.BENGALI
    ? `WeGro: পাসওয়ার্ড বদলানোর কোড ${code}। ${bengaliDigits(CODE_MINUTES)} মিনিট পর্যন্ত বৈধ। কাউকে জানাবেন না।`
    : `WeGro: your password reset code is ${code}. It expires in ${CODE_MINUTES} minutes. Never share it.`;
}

/** What checking a code found. Refusals are raised after the transaction, so a wrong try still counts. */
type Checked =
  | { ok: true; row: PasswordResetCode & { userId: string } }
  | { ok: false; refusal: UnprocessableEntityException };

function refused(refusal: UnprocessableEntityException): Checked {
  return { ok: false, refusal };
}

/**
 * Forgotten passwords: a 6-digit code by SMS, then a new password. Asking
 * answers the same whether or not the number is registered, so nobody can
 * find out who uses WeGro; the limits apply to every number alike. One
 * number's requests are serialised (an advisory lock), so the limits hold
 * however many arrive at once.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(PasswordResetCode)
    private readonly codes: Repository<PasswordResetCode>,
    private readonly codec: PersonalDetailsCodec,
    private readonly crypto: IdentityCryptoService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly sms: SmsSender,
  ) {}

  /** Sends a code if the number is registered; answers the same either way. */
  async request(
    phoneInput: string,
  ): Promise<{ resendAfterSeconds: number; expiresInSeconds: number }> {
    const phone = this.phone(phoneInput);
    const phoneIndex = this.codec.phoneIndex(phone);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const user = await this.codes.manager.transaction(async (m) => {
      await this.lock(m, phoneIndex);
      const now = Date.now();
      const recent = await m.find(PasswordResetCode, {
        where: { phoneIndex, createdAt: MoreThan(new Date(now - 60 * MINUTE)) },
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
            code: ErrorCode.RESET_WAIT,
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
            code: ErrorCode.RESET_TOO_MANY,
            details: { minutes },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const user = await m.findOne(User, {
        where: { phoneIndex },
        select: { id: true, language: true },
      });
      // One code at a time: earlier ones stop working.
      await m.update(
        PasswordResetCode,
        { phoneIndex, closedAt: IsNull() },
        { closedAt: new Date(now) },
      );
      await m.insert(PasswordResetCode, {
        phoneIndex,
        userId: user?.id ?? null,
        codeHash: this.hash(phoneIndex, code),
        expiresAt: new Date(now + CODE_MINUTES * MINUTE),
      });
      // Housekeeping: this number's codes older than a day.
      await m.query(
        `DELETE FROM "password_reset_codes" WHERE "phone_index" = $1 AND "created_at" < now() - interval '1 day'`,
        [phoneIndex],
      );
      return user;
    });
    if (user) {
      // Not awaited: the answer takes as long for registered numbers as for others.
      void this.sms
        .send(phone, message(user.language, code))
        .catch((error: unknown) =>
          this.logger.error(`Reset code not sent: ${String(error)}`),
        );
    }
    return {
      resendAfterSeconds: RESEND_SECONDS,
      expiresInSeconds: CODE_MINUTES * 60,
    };
  }

  /** Checks a code without using it up (a wrong one still counts). */
  async verify(phoneInput: string, code: string): Promise<void> {
    const phone = this.phone(phoneInput);
    const checked = await this.codes.manager.transaction((m) =>
      this.check(m, phone, code),
    );
    if (!checked.ok) throw checked.refusal;
  }

  /**
   * Sets the new password with a valid code: the code is used up, any
   * lockout cleared, every other session ended, and the person signed in.
   */
  async complete(
    phoneInput: string,
    code: string,
    newPassword: string,
  ): Promise<SignInResult> {
    const phone = this.phone(phoneInput);
    const passwordHash = await this.hasher.hash(newPassword);
    const outcome = await this.codes.manager.transaction(async (m) => {
      const checked = await this.check(m, phone, code);
      if (!checked.ok) return checked;
      const { row } = checked;
      const user = await m.findOneOrFail(User, { where: { id: row.userId } });
      assertMaySignIn(user);
      if (await this.hasher.verify(newPassword, user.passwordHash)) {
        throw new UnprocessableEntityException({
          message: 'New password must differ from the current one',
          code: ErrorCode.PASSWORD_UNCHANGED,
        });
      }
      await m.update(
        PasswordResetCode,
        { id: row.id },
        { closedAt: new Date() },
      );
      await m.update(
        User,
        { id: user.id },
        {
          passwordHash,
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      );
      await m.increment(User, { id: user.id }, 'tokenVersion', 1);
      await this.tokens.revokeAllForUser(user.id, m);
      const updated = await m.findOneOrFail(User, { where: { id: user.id } });
      return {
        ok: true as const,
        result: { user: updated, tokens: await this.tokens.issue(updated, m) },
      };
    });
    if (!outcome.ok) throw outcome.refusal;
    return outcome.result;
  }

  /**
   * The number's open code, if `code` is it. A wrong code counts against it;
   * the last allowed wrong try closes it. An unregistered number's code was
   * never sent, so it is always wrong.
   */
  private async check(
    m: EntityManager,
    phone: string,
    code: string,
  ): Promise<Checked> {
    const phoneIndex = this.codec.phoneIndex(phone);
    await this.lock(m, phoneIndex);
    const row = await m.findOne(PasswordResetCode, {
      where: {
        phoneIndex,
        closedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });
    if (!row) {
      return refused(
        new UnprocessableEntityException({
          message: 'This code has expired. Ask for a new one.',
          code: ErrorCode.RESET_CODE_EXPIRED,
        }),
      );
    }
    if (row.userId && row.codeHash === this.hash(phoneIndex, code)) {
      return { ok: true, row: row as PasswordResetCode & { userId: string } };
    }
    const attempts = row.attempts + 1;
    const attemptsLeft = CODE_TRIES - attempts;
    await m.update(
      PasswordResetCode,
      { id: row.id },
      { attempts, ...(attemptsLeft <= 0 && { closedAt: new Date() }) },
    );
    return refused(
      attemptsLeft <= 0
        ? new UnprocessableEntityException({
            message: 'Too many wrong codes. Ask for a new one.',
            code: ErrorCode.RESET_CODE_EXPIRED,
          })
        : new UnprocessableEntityException({
            message: `That code is not right. ${attemptsLeft} tries left.`,
            code: ErrorCode.RESET_CODE_WRONG,
            details: { attemptsLeft },
          }),
    );
  }

  private phone(input: string): string {
    const phone = normalisePhone(input);
    if (!phone) {
      throw new UnprocessableEntityException({
        message: 'Enter a Bangladeshi mobile number',
        code: ErrorCode.PHONE_INVALID,
      });
    }
    return phone;
  }

  private hash(phoneIndex: string, code: string): string {
    return this.crypto.blindIndex('reset-code', `${phoneIndex}:${code}`);
  }

  /** One number's requests one at a time, until the transaction ends. */
  private lock(m: EntityManager, phoneIndex: string): Promise<unknown> {
    return m.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `password-reset:${phoneIndex}`,
    ]);
  }
}
