import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { PasswordHasher } from '../../common/crypto/password-hasher.service';
import type { EnvironmentVariables } from '../../config/env.validation';
import { normalisePhone } from '../participants/id-check/id-check';
import { PersonalDetails } from '../users/entities/personal-details.entity';
import { ChainState, User } from '../users/entities/user.entity';
import { PersonalDetailsCodec } from '../users/personal-details.codec';
import { ParticipantStatus, type Role } from '../users/roles';
import type { AuthUser } from './auth-user';
import type { UpdateMeDto } from './dto/auth-request.dto';
import type { MeResponseDto } from './dto/auth-response.dto';
import { type IssuedTokens, TokenService } from './token.service';
import { normaliseEmail } from './verification-code.service';
import { ErrorCode } from '../../common/errors/error-code';

/** Failed sign-ins allowed before the account locks. */
export const MAX_FAILED_LOGINS = 5;
/** Lock doubles with each further failure: 1, 2, 4 ... minutes, at most an hour. */
const MAX_LOCK_MINUTES = 60;

const BAD_CREDENTIALS = {
  message: 'Phone number, email or password is incorrect',
  code: ErrorCode.BAD_CREDENTIALS,
};

export interface SignInResult {
  user: User;
  tokens: IssuedTokens;
}

@Injectable()
export class AuthService {
  private readonly demoMode: boolean;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PersonalDetails)
    private readonly details: Repository<PersonalDetails>,
    private readonly hasher: PasswordHasher,
    private readonly codec: PersonalDetailsCodec,
    private readonly tokens: TokenService,
  ) {
    this.demoMode = config.get('DEMO_MODE', { infer: true });
  }

  /**
   * Phone (or confirmed email) + password sign-in. Unknown numbers and
   * addresses cost the same hashing time as known ones and get the same
   * message, so the endpoint does not reveal who is registered. Failures
   * are counted atomically per account.
   */
  async login(
    by: { phone?: string; email?: string },
    password: string,
  ): Promise<SignInResult> {
    // Exactly one of the two; anything else is as good as unknown.
    const phone =
      by.phone !== undefined && by.email === undefined
        ? normalisePhone(by.phone)
        : null;
    const email =
      by.email !== undefined && by.phone === undefined
        ? normaliseEmail(by.email)
        : null;
    const user = phone
      ? await this.users.findOne({
          where: { phoneIndex: this.codec.phoneIndex(phone) },
        })
      : email
        ? await this.users.findOne({
            where: { emailIndex: this.codec.emailIndex(email) },
          })
        : null;
    if (!user) {
      await this.hasher.verifyDummy(password);
      throw new UnauthorizedException(BAD_CREDENTIALS);
    }

    this.assertNotLocked(user);

    if (!(await this.hasher.verify(password, user.passwordHash))) {
      await this.recordFailure(user.id);
      throw new UnauthorizedException(BAD_CREDENTIALS);
    }

    // Only now, with the right password, say why the account cannot sign in.
    assertMaySignIn(user);

    const patch: Partial<User> = {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    };
    if (this.hasher.needsRehash(user.passwordHash)) {
      patch.passwordHash = await this.hasher.hash(password);
    }
    await this.users.update({ id: user.id }, patch);
    return { user, tokens: await this.tokens.issue(user) };
  }

  /** Demo mode only: sign in as the ready-made account for a role. */
  async demoLogin(role: Role): Promise<SignInResult> {
    if (!this.demoMode)
      throw new NotFoundException({
        message: 'Not found',
        code: ErrorCode.NOT_FOUND,
      });
    const user = await this.users.findOne({ where: { role, isDemo: true } });
    if (!user) {
      throw new NotFoundException({
        message: `No demo account for role ${role} yet`,
        code: ErrorCode.NO_DEMO_ACCOUNT,
        details: { role },
      });
    }
    assertMaySignIn(user);
    await this.users.update({ id: user.id }, { lastLoginAt: new Date() });
    return { user, tokens: await this.tokens.issue(user) };
  }

  async demoAccounts(): Promise<Array<{ role: Role; fullName: string }>> {
    if (!this.demoMode)
      throw new NotFoundException({
        message: 'Not found',
        code: ErrorCode.NOT_FOUND,
      });
    const users = await this.users.find({
      where: { isDemo: true },
      relations: { details: true },
      order: { role: 'ASC' },
    });
    return users.map((u) => ({
      role: u.role,
      fullName: this.codec.openName(u.details!),
    }));
  }

  refresh(presented: string): Promise<SignInResult> {
    return this.tokens
      .rotate(presented, async (id, m) => {
        const user = await m.findOne(User, { where: { id } });
        if (!user) return null;
        try {
          assertMaySignIn(user);
        } catch {
          return null;
        }
        return user;
      })
      .then(({ user, tokens }) => ({ user, tokens }));
  }

  async logout(presented: string | undefined): Promise<void> {
    if (presented) await this.tokens.revokeFamilyOf(presented);
  }

  /** Ends every session on every device. */
  async logoutEverywhere(userId: string): Promise<void> {
    await this.users.manager.transaction(async (m) => {
      await m.increment(User, { id: userId }, 'tokenVersion', 1);
      await this.tokens.revokeAllForUser(userId, m);
    });
  }

  /**
   * Replaces the password, ends all other sessions (every older access and
   * refresh token stops working) and starts a fresh one.
   */
  async changePassword(
    userId: string,
    current: string,
    next: string,
  ): Promise<SignInResult> {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    this.assertNotLocked(user);
    // Counts towards the lockout like a failed sign-in: a stolen access token
    // must not become a way to guess the password.
    if (!(await this.hasher.verify(current, user.passwordHash))) {
      await this.recordFailure(user.id);
      throw new BadRequestException({
        message: 'Current password is incorrect',
        code: ErrorCode.WRONG_CURRENT_PASSWORD,
      });
    }
    if (current.normalize('NFKC') === next.normalize('NFKC')) {
      throw new BadRequestException({
        message: 'New password must differ from the current one',
        code: ErrorCode.PASSWORD_UNCHANGED,
      });
    }
    const passwordHash = await this.hasher.hash(next);
    return this.users.manager.transaction(async (m) => {
      await m.update(
        User,
        { id: userId },
        {
          passwordHash,
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      );
      await m.increment(User, { id: userId }, 'tokenVersion', 1);
      await this.tokens.revokeAllForUser(userId, m);
      const updated = await m.findOneOrFail(User, { where: { id: userId } });
      return { user: updated, tokens: await this.tokens.issue(updated, m) };
    });
  }

  async me(auth: AuthUser): Promise<MeResponseDto> {
    const [user, details] = await Promise.all([
      this.users.findOneOrFail({ where: { id: auth.id } }),
      this.details.findOneOrFail({ where: { userId: auth.id } }),
    ]);
    const plain = this.codec.open(details);
    return {
      id: user.id,
      role: user.role,
      status: user.status,
      fullName: plain.fullName,
      phone: plain.phone,
      district: plain.district,
      account: user.account,
      mustChangePassword: user.mustChangePassword,
      isDemo: user.isDemo,
      language: user.language,
      email: this.codec.openEmail(details),
    };
  }

  /** Saves my settings (for now, the language). */
  async updateMe(auth: AuthUser, dto: UpdateMeDto): Promise<MeResponseDto> {
    await this.users.update({ id: auth.id }, { language: dto.language });
    return this.me(auth);
  }

  private assertNotLocked(user: User): void {
    if (!user.lockedUntil || user.lockedUntil.getTime() <= Date.now()) return;
    const minutes = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / 60_000,
    );
    throw new HttpException(
      {
        message: `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        code: ErrorCode.ACCOUNT_LOCKED,
        details: { minutes },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** One statement, so concurrent failures are all counted. */
  private async recordFailure(
    userId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager ?? this.users.manager).query(
      `UPDATE "users"
          SET "failed_login_count" = "failed_login_count" + 1,
              "locked_until" = CASE
                WHEN "failed_login_count" + 1 >= $2::int
                THEN now() + make_interval(mins => LEAST(power(2, LEAST("failed_login_count" + 1 - $2::int, 6)), $3::int)::int)
                ELSE "locked_until" END
        WHERE "id" = $1`,
      [userId, MAX_FAILED_LOGINS, MAX_LOCK_MINUTES],
    );
  }
}

/** Pending participants may sign in (to see their status); rejected or unconfirmed ones may not. */
export function assertMaySignIn(user: User): void {
  if (user.chainState === ChainState.SUBMITTED) {
    throw new ForbiddenException({
      message: 'Your registration is still being confirmed. Try again shortly.',
      code: ErrorCode.REGISTRATION_CONFIRMING,
    });
  }
  if (user.status === ParticipantStatus.REJECTED) {
    throw new ForbiddenException(
      user.accessRevokedAt
        ? {
            message: 'Your access to WeGro has been revoked',
            code: ErrorCode.ACCESS_REVOKED,
          }
        : {
            message: 'This account was not approved',
            code: ErrorCode.ACCOUNT_REJECTED,
          },
    );
  }
}
