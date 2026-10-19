import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordHasher } from '../../common/crypto/password-hasher.service';
import { ErrorCode } from '../../common/errors/error-code';
import { User } from '../users/entities/user.entity';
import { PersonalDetailsCodec } from '../users/personal-details.codec';
import { assertMaySignIn, type SignInResult } from './auth.service';
import { CodePurpose } from './entities/verification-code.entity';
import {
  type CodeIssued,
  VerificationCodeService,
} from './verification-code.service';
import { TokenService } from './token.service';

const PURPOSE = CodePurpose.PASSWORD_RESET;

/**
 * Forgotten passwords: a 6-digit code by SMS, then a new password. Asking
 * answers the same whether or not the number is registered, so nobody can
 * find out who uses WeGro; the limits apply to every number alike.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly codec: PersonalDetailsCodec,
    private readonly codes: VerificationCodeService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  /** Sends a code if the number is registered; answers the same either way. */
  async request(phoneInput: string): Promise<CodeIssued> {
    const phone = this.codes.phone(phoneInput);
    const user = await this.users.findOne({
      where: { phoneIndex: this.codec.phoneIndex(phone) },
      select: { id: true, language: true },
    });
    return this.codes.issue(
      PURPOSE,
      phone,
      user ? { userId: user.id, language: user.language } : null,
    );
  }

  /** Checks a code without using it up (a wrong one still counts). */
  async verify(phoneInput: string, code: string): Promise<void> {
    const phone = this.codes.phone(phoneInput);
    const checked = await this.users.manager.transaction((m) =>
      this.codes.check(m, PURPOSE, phone, code),
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
    const phone = this.codes.phone(phoneInput);
    const passwordHash = await this.hasher.hash(newPassword);
    const outcome = await this.users.manager.transaction(async (m) => {
      const checked = await this.codes.check(m, PURPOSE, phone, code);
      if (!checked.ok) return checked;
      const { row } = checked;
      // Only a registered number's code is ever sent.
      const user = await m.findOneOrFail(User, { where: { id: row.userId! } });
      assertMaySignIn(user);
      if (await this.hasher.verify(newPassword, user.passwordHash)) {
        throw new UnprocessableEntityException({
          message: 'New password must differ from the current one',
          code: ErrorCode.PASSWORD_UNCHANGED,
        });
      }
      await this.codes.close(m, row.id);
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
}
