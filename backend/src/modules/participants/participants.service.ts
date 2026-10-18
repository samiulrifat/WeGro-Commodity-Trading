import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getAddress } from 'ethers';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import { KeyService } from '../../blockchain/keys/key.service';
import {
  type TxResult,
  TransactionService,
} from '../../blockchain/tx/transaction.service';
import { uuidToBytes32, ZERO_BYTES32 } from '../../blockchain/utils/ids';
import { Paginated } from '../../common/dto/pagination.dto';
import { PasswordHasher } from '../../common/crypto/password-hasher.service';
import { generateTemporaryPassword } from '../../common/crypto/temporary-password';
import type { AuthUser } from '../auth/auth-user';
import { TokenService } from '../auth/token.service';
import { PersonalDetails } from '../users/entities/personal-details.entity';
import { ChainState, User } from '../users/entities/user.entity';
import {
  type PlainDetails,
  PersonalDetailsCodec,
} from '../users/personal-details.codec';
import {
  CHAIN_ROLE,
  isStaffRole,
  type ParticipantRole,
  ParticipantStatus,
  Role,
  ROLE_BY_CHAIN_ID,
  STATUS_BY_CHAIN,
} from '../users/roles';
import type {
  ListParticipantsQueryDto,
  RegisterParticipantDto,
} from './dto/participant-request.dto';
import type {
  IntegrityReportDto,
  LedgerParticipantDto,
  ParticipantDetailDto,
  ParticipantSummaryDto,
  RegisteredParticipantDto,
} from './dto/participant-response.dto';
import {
  type NormalisedDetails,
  normaliseNid,
  normalisePhone,
  runIdCheck,
} from './id-check/id-check';
import { ErrorCode } from '../../common/errors/error-code';

/** Which unique index a duplicate hit, and what to tell the caller. */
const DUPLICATES: Record<string, { code: ErrorCode; message: string }> = {
  uq_users_phone_index: {
    code: ErrorCode.PHONE_ALREADY_REGISTERED,
    message: 'This phone number is already registered',
  },
  uq_personal_details_nid_index: {
    code: ErrorCode.NID_ALREADY_REGISTERED,
    message: 'A person with this NID is already registered',
  },
};

type Visibility = 'full' | 'masked';

@Injectable()
export class ParticipantsService {
  private readonly logger = new Logger(ParticipantsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PersonalDetails)
    private readonly details: Repository<PersonalDetails>,
    private readonly codec: PersonalDetailsCodec,
    private readonly hasher: PasswordHasher,
    private readonly keys: KeyService,
    private readonly tx: TransactionService,
    private readonly contracts: ContractsRegistry,
    private readonly receipts: ReceiptApplier,
    private readonly tokens: TokenService,
  ) {}

  // --- Registration ---

  /**
   * Practice ID check, then registration: details saved encrypted, the
   * salted fingerprint and the person's new key registered on-chain as
   * Pending. Returns a one-time temporary password for the person.
   */
  async register(
    actor: AuthUser,
    dto: RegisterParticipantDto,
  ): Promise<RegisteredParticipantDto> {
    assertCanRegister(actor, dto.role);

    const report = runIdCheck(dto);
    if (report.outcome === 'failed' || !report.details) {
      throw new UnprocessableEntityException({
        message: 'The ID check failed',
        code: ErrorCode.ID_CHECK_FAILED,
        details: { checks: report.checks.filter((c) => c.result === 'fail') },
      });
    }
    const d = report.details;
    const phoneIndex = this.codec.phoneIndex(d.phone);
    const nidIndex = this.codec.nidIndex(d.nid);

    // Fast, precise answer for the common case; the unique indexes below
    // still decide if two registrations race.
    const [phoneTaken, nidTaken] = await Promise.all([
      this.users.exists({ where: { phoneIndex } }),
      this.details.exists({ where: { nidIndex } }),
    ]);
    if (phoneTaken) throw duplicate('uq_users_phone_index');
    if (nidTaken) throw duplicate('uq_personal_details_nid_index');

    const id = randomUUID();
    const keyIndex = await this.keys.allocateIndex();
    const account = this.keys.addressOf(keyIndex);
    const detailsHash = this.codec.fingerprint(id, dto.role, d);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.hasher.hash(temporaryPassword);

    try {
      await this.dataSource.transaction(async (m) => {
        await m.insert(User, {
          id,
          role: dto.role,
          status: ParticipantStatus.PENDING,
          chainState: ChainState.SUBMITTED,
          phoneIndex,
          passwordHash,
          mustChangePassword: true,
          keyIndex,
          account,
          registeredById: actor.role === Role.SUPER_ADMIN ? null : actor.id,
        });
        await m.insert(PersonalDetails, {
          ...this.codec.seal(id, d),
          detailsHash,
          idCheck: {
            version: report.version,
            outcome: report.outcome,
            checks: report.checks,
          },
        });
      });
    } catch (error) {
      throw mapUniqueViolation(error);
    }

    await this.submitRegistration(
      actor,
      id,
      dto.role,
      account,
      detailsHash,
      true,
    );
    return {
      participant: await this.findOne(actor, id),
      temporaryPassword,
    };
  }

  /**
   * Sends the registration. A rejection by the contracts (decided during
   * simulation, before anything is broadcast) removes the saved rows. Any
   * other failure leaves the person as `submitted`: the indexer confirms
   * them if the transaction did land, and `sync` finishes the job if not.
   */
  private async submitRegistration(
    actor: AuthUser,
    id: string,
    role: ParticipantRole,
    account: string,
    detailsHash: string,
    removeOnRejection: boolean,
  ): Promise<void> {
    let result: TxResult;
    try {
      result = await this.tx.send(actor.keyIndex, 'AccessRegistry', (c) =>
        c.registerParticipant.populateTransaction(
          uuidToBytes32(id),
          CHAIN_ROLE[role],
          account,
          detailsHash,
        ),
      );
    } catch (error) {
      if (error instanceof ContractRevertException && removeOnRejection) {
        await this.users.delete({ id });
        throw error;
      }
      if (error instanceof ContractRevertException) throw error;
      this.logger.warn(
        `Registration of ${id} not confirmed; left as submitted`,
      );
      throw new HttpException(
        {
          message:
            'Saved, but the ledger has not confirmed the registration yet. It will be confirmed automatically, or use sync.',
          code: ErrorCode.REGISTRATION_UNCONFIRMED,
          details: { participantId: id },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    await this.applyReceipt(result);
  }

  // --- Ledger actions ---

  async verify(
    actor: AuthUser,
    id: string,
    acknowledgeFlags = false,
  ): Promise<ParticipantDetailDto> {
    const { user, details } = await this.loadParticipant(id);
    assertCanManage(actor, user.role);
    assertConfirmed(user);
    if (user.status === ParticipantStatus.VERIFIED) {
      throw new ConflictException({
        message: 'Already verified',
        code: ErrorCode.ALREADY_VERIFIED,
      });
    }
    const flagged =
      details.idCheck?.checks.filter((c) => c.result === 'warn') ?? [];
    if (flagged.length > 0 && !acknowledgeFlags) {
      throw new UnprocessableEntityException({
        message:
          'The ID check flagged this person; review the flags and confirm with acknowledgeFlags',
        code: ErrorCode.ID_CHECK_FLAGS_NOT_ACKNOWLEDGED,
        details: { checks: flagged },
      });
    }
    // Verify only what the ledger holds: stored details must still produce
    // the registered fingerprint.
    const integrity = await this.integrityOf(user, details);
    if (!integrity.matches) {
      throw new ConflictException({
        message: 'Stored details do not match the ledger; cannot verify',
        code: ErrorCode.DETAILS_MISMATCH,
        details: { mismatches: integrity.mismatches },
      });
    }

    await this.applyReceipt(
      await this.tx.send(actor.keyIndex, 'AccessRegistry', (c) =>
        c.verifyParticipant.populateTransaction(uuidToBytes32(id)),
      ),
    );
    await this.users.update({ id }, { statusReason: null });
    return this.findOne(actor, id);
  }

  /** Rejects (or withdraws verification), revokes the role on-chain and ends their sessions. */
  async reject(
    actor: AuthUser,
    id: string,
    reason: string,
  ): Promise<ParticipantDetailDto> {
    const { user } = await this.loadParticipant(id);
    assertCanManage(actor, user.role);
    assertConfirmed(user);
    if (user.status === ParticipantStatus.REJECTED) {
      throw new ConflictException({
        message: 'Already rejected',
        code: ErrorCode.ALREADY_REJECTED,
      });
    }
    const result = await this.tx.send(actor.keyIndex, 'AccessRegistry', (c) =>
      c.rejectParticipant.populateTransaction(uuidToBytes32(id)),
    );
    await this.dataSource.transaction(async (m) => {
      await this.receipts.apply(result, m);
      await m.update(User, { id }, { statusReason: reason });
      await m.increment(User, { id }, 'tokenVersion', 1);
      await this.tokens.revokeAllForUser(id, m);
    });
    await this.receipts.announce(result);
    return this.findOne(actor, id);
  }

  async assignFieldOfficer(
    actor: AuthUser,
    farmerId: string,
    officerId: string,
  ): Promise<ParticipantDetailDto> {
    const [{ user: farmer }, officer] = await Promise.all([
      this.loadParticipant(farmerId),
      this.users.findOne({ where: { id: officerId } }),
    ]);
    if (farmer.role !== Role.FARMER) {
      throw new BadRequestException({
        message: 'Only farmers have a field officer',
        code: ErrorCode.NOT_A_FARMER,
      });
    }
    assertConfirmed(farmer);
    if (
      !officer ||
      officer.role !== Role.FIELD_OFFICER ||
      officer.status !== ParticipantStatus.VERIFIED ||
      officer.chainState !== ChainState.CONFIRMED
    ) {
      throw new BadRequestException({
        message: 'officerId must be a verified field officer',
        code: ErrorCode.FIELD_OFFICER_INVALID,
      });
    }
    if (farmer.fieldOfficerId === officerId) {
      throw new ConflictException({
        message: 'Already assigned to this field officer',
        code: ErrorCode.ALREADY_ASSIGNED,
      });
    }
    await this.applyReceipt(
      await this.tx.send(actor.keyIndex, 'AccessRegistry', (c) =>
        c.assignFieldOfficer.populateTransaction(
          uuidToBytes32(farmerId),
          uuidToBytes32(officerId),
        ),
      ),
    );
    return this.findOne(actor, farmerId);
  }

  /**
   * Gives the person a brand-new key (lost or leaked one). The ledger moves
   * their role to it and retires the old key for good. The new index is
   * saved as pending first, so the ledger event can be matched to it even
   * if this request is interrupted.
   */
  async replaceKey(actor: AuthUser, id: string): Promise<ParticipantDetailDto> {
    const { user } = await this.loadParticipant(id);
    assertCanManage(actor, user.role);
    assertConfirmed(user);
    if (user.pendingKeyIndex !== null) {
      throw new ConflictException({
        message: 'A key replacement is already in progress',
        code: ErrorCode.KEY_REPLACEMENT_PENDING,
      });
    }
    const newIndex = await this.keys.allocateIndex();
    await this.users.update({ id }, { pendingKeyIndex: newIndex });
    try {
      await this.applyReceipt(
        await this.tx.send(actor.keyIndex, 'AccessRegistry', (c) =>
          c.changeAccount.populateTransaction(
            uuidToBytes32(id),
            this.keys.addressOf(newIndex),
          ),
        ),
      );
    } catch (error) {
      if (error instanceof ContractRevertException) {
        await this.users.update({ id }, { pendingKeyIndex: null });
      }
      throw error;
    }
    return this.findOne(actor, id);
  }

  /** New one-time password for someone who forgot theirs; ends all their sessions. */
  async resetPassword(
    actor: AuthUser,
    id: string,
  ): Promise<{ temporaryPassword: string }> {
    const { user } = await this.loadParticipant(id);
    assertCanManage(actor, user.role);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.hasher.hash(temporaryPassword);
    await this.dataSource.transaction(async (m) => {
      await m.update(
        User,
        { id },
        {
          passwordHash,
          mustChangePassword: true,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      );
      await m.increment(User, { id }, 'tokenVersion', 1);
      await this.tokens.revokeAllForUser(id, m);
    });
    return { temporaryPassword };
  }

  /**
   * Brings one person's record in line with the ledger: registers them if the
   * ledger has no record (an unconfirmed submission, or a reset chain), or
   * copies status and account from it.
   */
  async syncWithLedger(
    actor: AuthUser,
    id: string,
  ): Promise<ParticipantDetailDto> {
    const { user, details } = await this.loadParticipant(id);
    assertCanManage(actor, user.role);
    const ledger = await this.readLedger(id);

    if (ledger.status === 'none') {
      assertCanRegister(actor, user.role as ParticipantRole);
      if (!details.detailsHash)
        throw new ConflictException({
          message: 'No fingerprint stored',
          code: ErrorCode.NO_FINGERPRINT,
        });
      if (user.chainState === ChainState.CONFIRMED) {
        this.logger.warn(
          `Participant ${id} is missing from the ledger; registering again`,
        );
      }
      await this.submitRegistration(
        actor,
        id,
        user.role as ParticipantRole,
        user.account,
        details.detailsHash,
        false,
      );
      return this.findOne(actor, id);
    }

    if (
      ledger.role !== user.role ||
      ledger.detailsHash !== details.detailsHash
    ) {
      throw new ConflictException({
        message: 'The ledger record does not match this person',
        code: ErrorCode.LEDGER_MISMATCH,
      });
    }
    await this.users.update(
      { id },
      {
        chainState: ChainState.CONFIRMED,
        status: ledger.status,
        account: ledger.account!,
      },
    );
    return this.findOne(actor, id);
  }

  async integrity(id: string): Promise<IntegrityReportDto> {
    const { user, details } = await this.loadParticipant(id);
    return this.integrityOf(user, details);
  }

  // --- Reading ---

  async list(
    actor: AuthUser,
    query: ListParticipantsQueryDto,
  ): Promise<Paginated<ParticipantSummaryDto>> {
    const qb = this.users
      .createQueryBuilder('u')
      .innerJoinAndSelect('u.details', 'd')
      .where('u.role <> :operator', { operator: Role.SUPER_ADMIN });

    if (actor.role === Role.FIELD_OFFICER) {
      qb.andWhere('(u.field_officer_id = :me OR u.registered_by_id = :me)', {
        me: actor.id,
      });
    }
    if (query.role) qb.andWhere('u.role = :role', { role: query.role });
    if (query.status)
      qb.andWhere('u.status = :status', { status: query.status });
    if (query.chainState) {
      qb.andWhere('u.chain_state = :chainState', {
        chainState: query.chainState,
      });
    }
    if (query.district) {
      qb.andWhere('d.district = :district', { district: query.district });
    }
    // Exact searches go through the keyed indexes: no decryption, one index probe.
    if (query.phone !== undefined) {
      const phone = normalisePhone(query.phone);
      qb.andWhere('u.phone_index = :phoneIndex', {
        phoneIndex: phone ? this.codec.phoneIndex(phone) : '',
      });
    }
    if (query.nid !== undefined) {
      const nid = normaliseNid(query.nid);
      qb.andWhere('d.nid_index = :nidIndex', {
        nidIndex: nid ? this.codec.nidIndex(nid) : '',
      });
    }

    const [rows, total] = await qb
      .orderBy('u.created_at', 'DESC')
      .addOrderBy('u.id', 'ASC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
    return new Paginated(
      rows.map((u) => this.summary(u, u.details!)),
      total,
      query,
    );
  }

  async findOne(actor: AuthUser, id: string): Promise<ParticipantDetailDto> {
    const { user, details } = await this.loadParticipant(id);
    if (
      actor.role === Role.FIELD_OFFICER &&
      user.fieldOfficerId !== actor.id &&
      user.registeredById !== actor.id
    ) {
      throw new NotFoundException({
        message: 'Participant not found',
        code: ErrorCode.PARTICIPANT_NOT_FOUND,
      });
    }
    const visibility: Visibility =
      actor.role === Role.AUDITOR ? 'masked' : 'full';
    const plain = this.codec.open(details);
    return Object.assign(this.summary(user, details, plain), {
      phone: visibility === 'full' ? plain.phone : maskPhone(plain.phone),
      nid: visibility === 'full' ? plain.nid : maskTail(plain.nid, 4),
      dateOfBirth: visibility === 'full' ? plain.dateOfBirth : null,
      address: visibility === 'full' ? plain.address : null,
      masked: visibility === 'masked',
      account: user.account,
      statusReason: user.statusReason,
      statusChangedAt: user.statusChangedAt,
      registeredById: user.registeredById,
      registrationTx: user.registrationTx,
      idCheck: details.idCheck,
    });
  }

  // --- Helpers ---

  private summary(
    user: User,
    details: PersonalDetails,
    plain?: PlainDetails,
  ): ParticipantSummaryDto {
    const fullName = plain?.fullName ?? this.codec.openName(details);
    const phone = plain?.phone ?? this.codec.openPhone(details);
    return {
      id: user.id,
      role: user.role,
      status: user.status,
      chainState: user.chainState,
      fullName,
      phone: maskPhone(phone),
      district: details.district,
      fieldOfficerId: user.fieldOfficerId,
      idCheckOutcome: details.idCheck?.outcome ?? null,
      createdAt: user.createdAt,
    };
  }

  private async loadParticipant(
    id: string,
  ): Promise<{ user: User; details: PersonalDetails }> {
    const user = await this.users.findOne({
      where: { id },
      relations: { details: true },
    });
    if (!user || user.role === Role.SUPER_ADMIN || !user.details) {
      throw new NotFoundException({
        message: 'Participant not found',
        code: ErrorCode.PARTICIPANT_NOT_FOUND,
      });
    }
    return { user, details: user.details };
  }

  private async applyReceipt(result: TxResult): Promise<void> {
    await this.receipts.apply(result);
  }

  private async readLedger(id: string): Promise<LedgerParticipantDto> {
    const p = await this.contracts
      .get('AccessRegistry')
      .getParticipant(uuidToBytes32(id));
    const status = STATUS_BY_CHAIN[Number(p.status)];
    if (!status) {
      return { status: 'none', role: null, account: null, detailsHash: null };
    }
    return {
      status,
      role: ROLE_BY_CHAIN_ID.get(p.role) ?? null,
      account: getAddress(p.account),
      detailsHash: p.detailsHash === ZERO_BYTES32 ? null : p.detailsHash,
    };
  }

  private async integrityOf(
    user: User,
    details: PersonalDetails,
  ): Promise<IntegrityReportDto> {
    const mismatches: string[] = [];
    let computedHash = '';
    try {
      const plain = this.codec.open(details) as NormalisedDetails &
        PlainDetails;
      computedHash = this.codec.fingerprint(user.id, user.role, plain);
    } catch {
      mismatches.push('decryption');
    }
    const ledger = await this.readLedger(user.id);
    if (computedHash && computedHash !== details.detailsHash)
      mismatches.push('storedHash');
    if (ledger.status === 'none') {
      mismatches.push('notOnLedger');
    } else {
      if (ledger.detailsHash !== computedHash) mismatches.push('ledgerHash');
      if (ledger.role !== user.role) mismatches.push('role');
      if (ledger.status !== user.status) mismatches.push('status');
      if (ledger.account !== user.account) mismatches.push('account');
    }
    return {
      matches: mismatches.length === 0,
      computedHash,
      storedHash: details.detailsHash,
      ledger,
      mismatches,
    };
  }
}

// --- Rules (the contracts enforce the same ones) ---

function assertCanRegister(actor: AuthUser, role: ParticipantRole): void {
  if (isStaffRole(role)) {
    if (actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException({
        message: 'Only the super admin registers staff',
        code: ErrorCode.STAFF_REGISTERED_BY_SUPER_ADMIN,
      });
    }
  } else if (actor.role !== Role.ADMIN && actor.role !== Role.FIELD_OFFICER) {
    throw new ForbiddenException({
      message: 'Only admins and field officers register non-staff participants',
      code: ErrorCode.REGISTRATION_NOT_ALLOWED,
    });
  }
}

function assertCanManage(actor: AuthUser, role: Role): void {
  if (isStaffRole(role)) {
    if (actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException({
        message: 'Only the super admin manages staff',
        code: ErrorCode.STAFF_MANAGED_BY_SUPER_ADMIN,
      });
    }
  } else if (actor.role !== Role.ADMIN) {
    throw new ForbiddenException({
      message: 'Only admins manage participants',
      code: ErrorCode.PARTICIPANTS_MANAGED_BY_ADMINS,
    });
  }
}

function assertConfirmed(user: User): void {
  if (user.chainState !== ChainState.CONFIRMED) {
    throw new ConflictException({
      message: 'The registration is not confirmed on the ledger yet',
      code: ErrorCode.PARTICIPANT_UNCONFIRMED,
    });
  }
}

function duplicate(constraint: string): ConflictException {
  const d = DUPLICATES[constraint];
  return new ConflictException({ message: d.message, code: d.code });
}

function mapUniqueViolation(error: unknown): unknown {
  if (error instanceof QueryFailedError) {
    const driver = error.driverError as { code?: string; constraint?: string };
    if (
      driver.code === '23505' &&
      driver.constraint &&
      DUPLICATES[driver.constraint]
    ) {
      return duplicate(driver.constraint);
    }
  }
  return error;
}

/** +88017•••••678 */
export function maskPhone(phone: string): string {
  return phone.length > 9
    ? `${phone.slice(0, 6)}${'•'.repeat(phone.length - 9)}${phone.slice(-3)}`
    : '•'.repeat(phone.length);
}

export function maskTail(value: string | null, keep: number): string | null {
  if (value === null) return null;
  return value.length > keep
    ? `${'•'.repeat(value.length - keep)}${value.slice(-keep)}`
    : '•'.repeat(value.length);
}
