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
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
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
import { CodePurpose } from '../auth/entities/verification-code.entity';
import { SmsSender } from '../auth/sms/sms-sender';
import {
  type CodeIssued,
  VerificationCodeService,
} from '../auth/verification-code.service';
import { TokenService } from '../auth/token.service';
import { PersonalDetails } from '../users/entities/personal-details.entity';
import { ChainState, User } from '../users/entities/user.entity';
import type { Language } from '../users/language';
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
import type { SignUpDto } from './dto/sign-up.dto';
import type {
  IntegrityReportDto,
  LedgerParticipantDto,
  ParticipantDetailDto,
  ParticipantSummaryDto,
  RegisteredParticipantDto,
  RegistrationCheckDto,
  TemporaryPasswordDto,
} from './dto/participant-response.dto';
import {
  type NormalisedDetails,
  normaliseNid,
  normalisePhone,
  runIdCheck,
} from './id-check/id-check';
import { temporaryPasswordText } from './temporary-password-sms';
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
    private readonly sms: SmsSender,
    private readonly codes: VerificationCodeService,
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
    { text = true }: { text?: boolean } = {},
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
          language: dto.language ?? null,
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

    // Unconfirmed, they are saved as `submitted` all the same: the indexer
    // or sync confirms them, and the password must still reach them.
    await this.submitRegistration(
      actor,
      id,
      dto.role,
      account,
      detailsHash,
      true,
    );
    const smsSent =
      text &&
      (await this.textPassword(
        'registered',
        d.phone,
        dto.language ?? null,
        temporaryPassword,
      ));
    return {
      participant: await this.findOne(actor, id),
      temporaryPassword,
      smsSent,
    };
  }

  /** Signing up, step 1: a code to the number, unless it is registered. */
  async signUpCode(
    phoneInput: string,
    language: Language | null,
  ): Promise<CodeIssued> {
    const phone = this.codes.phone(phoneInput);
    if (
      await this.users.exists({
        where: { phoneIndex: this.codec.phoneIndex(phone) },
      })
    ) {
      throw duplicate('uq_users_phone_index');
    }
    return this.codes.issue(CodePurpose.SIGN_UP, phone, {
      userId: null,
      language,
    });
  }

  /**
   * An investor or buyer signing up: the ID check, the code sent to their
   * number, then registered and verified on the ledger at once by the
   * platform's key. Returns them, to be signed in.
   */
  async signUp(dto: SignUpDto): Promise<User> {
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
    const [phoneTaken, nidTaken] = await Promise.all([
      this.users.exists({ where: { phoneIndex } }),
      this.details.exists({ where: { nidIndex } }),
    ]);
    if (phoneTaken) throw duplicate('uq_users_phone_index');
    if (nidTaken) throw duplicate('uq_personal_details_nid_index');

    const id = randomUUID();
    const detailsHash = this.codec.fingerprint(id, dto.role, d);
    const passwordHash = await this.hasher.hash(dto.password);
    let account = '';
    let refusal: UnprocessableEntityException | null;
    try {
      refusal = await this.dataSource.transaction(async (m) => {
        const checked = await this.codes.check(
          m,
          CodePurpose.SIGN_UP,
          d.phone,
          dto.phoneCode,
        );
        if (!checked.ok) return checked.refusal; // the wrong try still counts
        await this.codes.close(m, checked.row.id);
        const keyIndex = await this.keys.allocateIndex();
        account = this.keys.addressOf(keyIndex);
        await m.insert(User, {
          id,
          role: dto.role,
          status: ParticipantStatus.PENDING,
          chainState: ChainState.SUBMITTED,
          phoneIndex,
          passwordHash,
          mustChangePassword: false,
          keyIndex,
          account,
          registeredById: null,
          language: dto.language ?? null,
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
        return null;
      });
    } catch (error) {
      throw mapUniqueViolation(error);
    }
    if (refusal) throw refusal;

    // Unconfirmed, they stay `submitted` and pending until the indexer or
    // sync confirms them; they can sign in and see where it stands.
    await this.submitRegistration(
      'self',
      id,
      dto.role,
      account,
      detailsHash,
      true,
    );
    return this.users.findOneByOrFail({ id });
  }

  /**
   * The ID check and the duplicate checks of a registration, without saving
   * anything: what the registrar confirms before sending it to the ledger.
   */
  async check(
    actor: AuthUser,
    dto: RegisterParticipantDto,
  ): Promise<RegistrationCheckDto> {
    assertCanRegister(actor, dto.role);
    const report = runIdCheck(dto);
    const phone = normalisePhone(dto.phone);
    const nid = normaliseNid(dto.nid);
    const [phoneTaken, nidTaken] = await Promise.all([
      phone
        ? this.users.exists({
            where: { phoneIndex: this.codec.phoneIndex(phone) },
          })
        : false,
      nid
        ? this.details.exists({ where: { nidIndex: this.codec.nidIndex(nid) } })
        : false,
    ]);
    return {
      outcome: report.outcome,
      checks: report.checks,
      phoneTaken,
      nidTaken,
    };
  }

  /** Texts a temporary password; false if it could not be sent. */
  private async textPassword(
    kind: 'registered' | 'reset',
    phone: string,
    language: Language | null,
    password: string,
  ): Promise<boolean> {
    try {
      await this.sms.send(
        phone,
        temporaryPasswordText(kind, language, password),
      );
      return true;
    } catch (error) {
      this.logger.error(`Temporary password not sent: ${String(error)}`);
      return false;
    }
  }

  /**
   * Sends the registration. A rejection by the contracts (decided during
   * simulation, before anything is broadcast) removes the saved rows. Any
   * other failure leaves the person as `submitted` (answering false): the
   * indexer confirms them if the transaction did land, and `sync` finishes
   * the job if not.
   */
  private async submitRegistration(
    by: AuthUser | 'self',
    id: string,
    role: ParticipantRole,
    account: string,
    detailsHash: string,
    removeOnRejection: boolean,
  ): Promise<boolean> {
    let result: TxResult;
    try {
      // Someone who signed up is registered (and verified) by the platform's key.
      result =
        by === 'self'
          ? await this.tx.send(
              KeyService.OPERATOR_INDEX,
              'AccessRegistry',
              (c) =>
                c.selfRegisterParticipant.populateTransaction(
                  uuidToBytes32(id),
                  CHAIN_ROLE[role],
                  account,
                  detailsHash,
                ),
            )
          : await this.tx.send(by.keyIndex, 'AccessRegistry', (c) =>
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
      return false;
    }
    await this.applyReceipt(result);
    return true;
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
  ): Promise<TemporaryPasswordDto> {
    const { user, details } = await this.loadParticipant(id);
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
    const smsSent = await this.textPassword(
      'reset',
      this.codec.open(details).phone,
      user.language,
      temporaryPassword,
    );
    return { temporaryPassword, smsSent };
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
      // Signed up themselves: the only non-staff without a registrar.
      const self = !isStaffRole(user.role) && user.registeredById === null;
      if (!self) assertCanRegister(actor, user.role as ParticipantRole);
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
      const confirmed = await this.submitRegistration(
        self ? 'self' : actor,
        id,
        user.role as ParticipantRole,
        user.account,
        details.detailsHash,
        false,
      );
      if (!confirmed) {
        throw new HttpException(
          {
            message:
              'The ledger has not confirmed the registration yet. It will be confirmed automatically, or try sync again.',
            code: ErrorCode.REGISTRATION_UNCONFIRMED,
            details: { participantId: id },
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
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
    const names = await this.namesOf(
      [user.fieldOfficerId, user.registeredById].filter(
        (x): x is string => x !== null,
      ),
    );
    const person = (pid: string | null) =>
      pid === null ? null : { id: pid, name: names.get(pid) ?? '' };
    const email = this.codec.openEmail(details);
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
      registeredBy: person(user.registeredById),
      selfRegistered: !isStaffRole(user.role) && user.registeredById === null,
      fieldOfficer: person(user.fieldOfficerId),
      email: visibility === 'full' ? email : email && maskEmail(email),
      registrationTx: user.registrationTx,
      idCheck: details.idCheck,
    });
  }

  /** People's names by id, decrypting the names only. */
  private async namesOf(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.details.find({
      where: { userId: In(ids) },
      select: { userId: true, fullNameEnc: true },
    });
    return new Map(rows.map((r) => [r.userId, this.codec.openName(r)]));
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
  } else if (actor.role === Role.FIELD_OFFICER) {
    if (role !== Role.FARMER) {
      throw new ForbiddenException({
        message: 'Field officers register farmers only',
        code: ErrorCode.FIELD_OFFICER_FARMERS_ONLY,
      });
    }
  } else if (actor.role !== Role.ADMIN) {
    throw new ForbiddenException({
      message: 'Only admins and field officers register non-staff participants',
      code: ErrorCode.REGISTRATION_NOT_ALLOWED,
    });
  }
}

export function assertCanManage(actor: AuthUser, role: Role): void {
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

export function assertConfirmed(user: User): void {
  if (user.chainState !== ChainState.CONFIRMED) {
    throw new ConflictException({
      message: 'The registration is not confirmed on the ledger yet',
      code: ErrorCode.PARTICIPANT_UNCONFIRMED,
    });
  }
}

export function duplicate(constraint: string): ConflictException {
  const d = DUPLICATES[constraint];
  return new ConflictException({ message: d.message, code: d.code });
}

export function mapUniqueViolation(error: unknown): unknown {
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

/** ra•••@example.com */
export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  return `${name!.slice(0, 2)}•••@${domain}`;
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
