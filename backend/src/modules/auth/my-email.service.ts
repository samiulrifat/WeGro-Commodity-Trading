import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, QueryFailedError, Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors/error-code';
import { PersonalDetails } from '../users/entities/personal-details.entity';
import { User } from '../users/entities/user.entity';
import { PersonalDetailsCodec } from '../users/personal-details.codec';
import type { AuthUser } from './auth-user';
import { CodePurpose } from './entities/verification-code.entity';
import {
  type CodeIssued,
  normaliseEmail,
  VerificationCodeService,
} from './verification-code.service';

const TAKEN = {
  message: 'This email address is already in use',
  code: ErrorCode.EMAIL_ALREADY_REGISTERED,
};

/**
 * Someone's email address: it signs in like their number once they confirm
 * it with a code emailed to it. Not part of their identity details, so it
 * needs no admin and never reaches the ledger.
 */
@Injectable()
export class MyEmailService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PersonalDetails)
    private readonly details: Repository<PersonalDetails>,
    private readonly codec: PersonalDetailsCodec,
    private readonly codes: VerificationCodeService,
  ) {}

  /** Emails a code to the address, to be given back to confirm it. */
  async requestCode(actor: AuthUser, input: string): Promise<CodeIssued> {
    const email = normaliseEmail(input);
    const index = this.codec.emailIndex(email);
    const me = await this.users.findOneOrFail({
      where: { id: actor.id },
      select: { id: true, emailIndex: true, language: true },
    });
    if (me.emailIndex === index) {
      throw new UnprocessableEntityException({
        message: 'This is already your email address',
        code: ErrorCode.EMAIL_UNCHANGED,
      });
    }
    await this.assertFree(index, actor.id);
    return this.codes.issue(CodePurpose.EMAIL, email, {
      userId: me.id,
      language: me.language,
    });
  }

  /** Saves the address once its code is right; it signs in from then on. */
  async confirm(actor: AuthUser, input: string, code: string): Promise<void> {
    const email = normaliseEmail(input);
    const index = this.codec.emailIndex(email);
    await this.assertFree(index, actor.id);
    const refusal = await this.users.manager.transaction(async (m) => {
      const checked = await this.codes.check(
        m,
        CodePurpose.EMAIL,
        email,
        code,
        actor.id,
      );
      if (!checked.ok) return checked.refusal; // the wrong try still counts
      await this.codes.close(m, checked.row.id);
      try {
        await m.update(User, { id: actor.id }, { emailIndex: index });
      } catch (error) {
        // Someone confirmed the same address a moment earlier.
        const unique =
          error instanceof QueryFailedError &&
          (error.driverError as { code?: string }).code === '23505';
        throw unique ? new ConflictException(TAKEN) : error;
      }
      await m.update(
        PersonalDetails,
        { userId: actor.id },
        { emailEnc: this.codec.sealEmail(actor.id, email) },
      );
      return null;
    });
    if (refusal) throw refusal;
  }

  /** Takes the address off: they sign in by number only. */
  async remove(actor: AuthUser): Promise<void> {
    const me = await this.users.findOneOrFail({
      where: { id: actor.id },
      select: { id: true, emailIndex: true },
    });
    if (!me.emailIndex) {
      throw new NotFoundException({
        message: 'There is no email address on this account',
        code: ErrorCode.EMAIL_NOT_SET,
      });
    }
    await this.users.manager.transaction(async (m) => {
      await m.update(User, { id: actor.id }, { emailIndex: null });
      await m.update(PersonalDetails, { userId: actor.id }, { emailEnc: null });
    });
  }

  /** The address as stored, or null. */
  async current(userId: string): Promise<string | null> {
    const row = await this.details.findOneOrFail({
      where: { userId },
      select: { userId: true, emailEnc: true },
    });
    return this.codec.openEmail(row);
  }

  private async assertFree(index: string, userId: string): Promise<void> {
    if (
      await this.users.exists({ where: { emailIndex: index, id: Not(userId) } })
    ) {
      throw new ConflictException(TAKEN);
    }
  }
}
