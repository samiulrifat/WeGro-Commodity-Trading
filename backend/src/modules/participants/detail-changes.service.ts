import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import { TransactionService } from '../../blockchain/tx/transaction.service';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { Paginated } from '../../common/dto/pagination.dto';
import { IdentityCryptoService } from '../../common/crypto/identity-crypto.service';
import { ErrorCode } from '../../common/errors/error-code';
import type { AuthUser } from '../auth/auth-user';
import { CodePurpose } from '../auth/entities/verification-code.entity';
import {
  type CodeIssued,
  VerificationCodeService,
} from '../auth/verification-code.service';
import { NotificationWriter } from '../notifications/notification-writer';
import {
  NotificationCategory,
  NotificationKind,
} from '../notifications/notification.enums';
import { PersonalDetails } from '../users/entities/personal-details.entity';
import { User } from '../users/entities/user.entity';
import { PersonalDetailsCodec } from '../users/personal-details.codec';
import { NameIndexService } from '../users/name-index.service';
import { PersonSearch } from '../users/person-search';
import { isStaffRole, Role } from '../users/roles';
import type {
  DetailChangeDto,
  DetailChangeRequestDto,
  DetailChangeReviewDto,
  DetailChangesQueryDto,
  DetailChangeSummaryDto,
  MyDetailsDto,
  OwnDetailsDto,
} from './dto/detail-change.dto';
import {
  DetailChangeRequest,
  DetailChangeStatus,
  DetailField,
} from './entities/detail-change-request.entity';
import { type NormalisedDetails, runIdCheck } from './id-check/id-check';
import {
  assertCanManage,
  assertConfirmed,
  duplicate,
  mapUniqueViolation,
} from './participants.service';

const FIELDS = Object.values(DetailField);

/**
 * People changing their own details. A change is a request until an admin
 * approves it (the super admin for staff): the ledger accepts a new details
 * fingerprint only from them, so it is recorded signed by the approver, and
 * the stored details, fingerprint and sign-in number change in the same step.
 * A new mobile number must first be confirmed with a code sent to it. The
 * super admin, the ledger's operator rather than a registered participant,
 * changes their name and number at once.
 */
@Injectable()
export class DetailChangesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PersonalDetails)
    private readonly details: Repository<PersonalDetails>,
    @InjectRepository(DetailChangeRequest)
    private readonly changes: Repository<DetailChangeRequest>,
    private readonly codec: PersonalDetailsCodec,
    private readonly crypto: IdentityCryptoService,
    private readonly codes: VerificationCodeService,
    private readonly tx: TransactionService,
    private readonly receipts: ReceiptApplier,
    private readonly writer: NotificationWriter,
    private readonly nameIndex: NameIndexService,
    private readonly search: PersonSearch,
  ) {}

  // --- The person ---

  async mine(actor: AuthUser): Promise<MyDetailsDto> {
    const [details, latest] = await Promise.all([
      this.details.findOneByOrFail({ userId: actor.id }),
      this.changes.findOne({
        where: { userId: actor.id },
        order: { createdAt: 'DESC' },
      }),
    ]);
    return {
      current: this.codec.open(details),
      change: latest ? this.view(latest) : null,
      needsApproval: actor.role !== Role.SUPER_ADMIN,
    };
  }

  /** Texts a code to a new number, to be given with the change. */
  async phoneCode(actor: AuthUser, phoneInput: string): Promise<CodeIssued> {
    const phone = this.codes.phone(phoneInput);
    const { current } = await this.mine(actor);
    if (phone === current.phone) {
      throw new UnprocessableEntityException({
        message: 'This is already your number',
        code: ErrorCode.PHONE_UNCHANGED,
      });
    }
    await this.assertPhoneFree(phone, actor.id);
    const me = await this.users.findOneOrFail({
      where: { id: actor.id },
      select: { id: true, language: true },
    });
    return this.codes.issue(CodePurpose.PHONE_CHANGE, phone, {
      userId: me.id,
      language: me.language,
    });
  }

  /**
   * Asks for the details to be as given. A new number needs its code. A new
   * request replaces one still waiting. The super admin's applies at once.
   */
  async submit(
    actor: AuthUser,
    dto: DetailChangeRequestDto,
  ): Promise<MyDetailsDto> {
    const user = await this.users.findOneOrFail({ where: { id: actor.id } });
    const current = this.codec.open(
      await this.details.findOneByOrFail({ userId: actor.id }),
    );
    const operator = user.role === Role.SUPER_ADMIN;

    let requested:
      NormalisedDetails | Pick<NormalisedDetails, 'fullName' | 'phone'>;
    let idCheck: DetailChangeRequest['idCheck'] = null;
    if (operator) {
      requested = {
        fullName: dto.fullName.replace(/\s+/g, ' ').trim(),
        phone: this.codes.phone(dto.phone),
      };
    } else {
      const report = runIdCheck({
        fullName: dto.fullName,
        phone: dto.phone,
        nid: dto.nid ?? '',
        dateOfBirth: dto.dateOfBirth ?? '',
        district: dto.district ?? '',
        address: dto.address ?? '',
      });
      if (report.outcome === 'failed' || !report.details) {
        throw new UnprocessableEntityException({
          message: 'The ID check failed',
          code: ErrorCode.ID_CHECK_FAILED,
          details: {
            checks: report.checks.filter((c) => c.result === 'fail'),
          },
        });
      }
      requested = report.details;
      idCheck = {
        version: report.version,
        outcome: report.outcome,
        checks: report.checks,
      };
    }

    const changedFields = FIELDS.filter(
      (f) =>
        f in requested && requested[f as keyof typeof requested] !== current[f],
    );
    if (changedFields.length === 0) {
      throw new UnprocessableEntityException({
        message: 'Nothing in these details is different from the current ones',
        code: ErrorCode.DETAILS_UNCHANGED,
      });
    }
    const phoneChanged = changedFields.includes(DetailField.PHONE);
    if (phoneChanged) {
      await this.assertPhoneFree(requested.phone, actor.id);
      if (!dto.phoneCode) {
        throw new UnprocessableEntityException({
          message: 'Confirm the new number with the code sent to it',
          code: ErrorCode.PHONE_NOT_CONFIRMED,
        });
      }
    }
    const nid = 'nid' in requested ? requested.nid : null;
    if (nid && changedFields.includes(DetailField.NID)) {
      await this.assertNidFree(nid, actor.id);
    }

    const refusal = await this.dataSource.transaction(async (m) => {
      if (phoneChanged) {
        const checked = await this.codes.check(
          m,
          CodePurpose.PHONE_CHANGE,
          requested.phone,
          dto.phoneCode!,
          actor.id,
        );
        if (!checked.ok) return checked.refusal; // the wrong try still counts
        await this.codes.close(m, checked.row.id);
      }
      if (operator) {
        await m.update(
          PersonalDetails,
          { userId: actor.id },
          this.codec.sealOperator(
            actor.id,
            requested.fullName,
            requested.phone,
          ),
        );
        await m.update(
          User,
          { id: actor.id },
          { phoneIndex: this.codec.phoneIndex(requested.phone) },
        );
        await this.nameIndex.write(m, actor.id, requested.fullName);
        return null;
      }
      const full = requested as NormalisedDetails;
      await m.update(
        DetailChangeRequest,
        { userId: actor.id, status: DetailChangeStatus.PENDING },
        { status: DetailChangeStatus.WITHDRAWN },
      );
      const id = randomUUID();
      await m.insert(DetailChangeRequest, {
        id,
        userId: actor.id,
        status: DetailChangeStatus.PENDING,
        detailsEnc: this.seal(id, full),
        changedFields,
        phoneIndex: this.codec.phoneIndex(full.phone),
        nidIndex: this.codec.nidIndex(full.nid),
        idCheck,
      });
      await this.writer.send(
        m,
        await this.writer.withRole(
          m,
          isStaffRole(user.role) ? [Role.SUPER_ADMIN] : [Role.ADMIN],
          [actor.id],
        ),
        {
          category: NotificationCategory.ACTION,
          kind: NotificationKind.DETAILS_CHANGE_REQUESTED,
          title: 'A change of personal details is waiting for review',
          params: { role: user.role },
          subject: { type: 'detail-change', id },
          key: `detail-change:${id}:requested`,
        },
      );
      return null;
    });
    if (refusal) throw refusal;
    return this.mine(actor);
  }

  /** Takes back a change still waiting for review. */
  async withdraw(actor: AuthUser): Promise<MyDetailsDto> {
    const done = await this.changes.update(
      { userId: actor.id, status: DetailChangeStatus.PENDING },
      { status: DetailChangeStatus.WITHDRAWN },
    );
    if (!done.affected) {
      throw new NotFoundException({
        message: 'No details change is waiting',
        code: ErrorCode.CHANGE_NOT_FOUND,
      });
    }
    return this.mine(actor);
  }

  // --- The approvers ---

  /** Admins see others' changes; the super admin sees staff's. */
  async list(
    actor: AuthUser,
    q: DetailChangesQueryDto,
  ): Promise<Paginated<DetailChangeSummaryDto>> {
    const roles = this.reviewableRoles(actor);
    const qb = this.changes
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.user', 'u')
      .where('c.status = :status', { status: q.status })
      .andWhere('u.role IN (:...roles)', { roles });
    const [rows, total] = await this.search
      .apply(qb, 'u.id', q.q)
      .orderBy('c.created_at', 'ASC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    const names = await this.names(rows.map((r) => r.userId));
    return new Paginated(
      rows.map((r) => this.summary(r, r.user!.role, names)),
      total,
      q,
    );
  }

  async review(actor: AuthUser, id: string): Promise<DetailChangeReviewDto> {
    const { change, user, details } = await this.load(id);
    assertCanManage(actor, user.role);
    const names = await this.names(
      [user.id, change.decidedById].filter((x): x is string => !!x),
    );
    return {
      ...this.summary(change, user.role, names),
      current: this.codec.open(details),
      requested: this.open(change),
      idCheck: change.idCheck,
      decidedBy: change.decidedById
        ? { id: change.decidedById, name: names.get(change.decidedById) ?? '' }
        : null,
      decidedAt: change.decidedAt,
      reason: change.reason,
    };
  }

  /**
   * Records the new fingerprint on the ledger, signed by the approver, then
   * the new details, fingerprint and sign-in number, in one step.
   */
  async approve(
    actor: AuthUser,
    id: string,
    acknowledgeFlags = false,
  ): Promise<DetailChangeReviewDto> {
    const { change, user } = await this.load(id);
    this.assertDecidable(actor, change, user);
    assertConfirmed(user);
    const flagged =
      change.idCheck?.checks.filter((c) => c.result === 'warn') ?? [];
    if (flagged.length > 0 && !acknowledgeFlags) {
      throw new UnprocessableEntityException({
        message:
          'The ID check flagged this change; review the flags and confirm with acknowledgeFlags',
        code: ErrorCode.ID_CHECK_FLAGS_NOT_ACKNOWLEDGED,
        details: { checks: flagged },
      });
    }
    const requested = this.open(change) as NormalisedDetails;
    // Still free? Someone may have registered the number or NID meanwhile.
    if (change.changedFields.includes(DetailField.PHONE)) {
      await this.assertPhoneFree(requested.phone, user.id);
    }
    if (change.changedFields.includes(DetailField.NID)) {
      await this.assertNidFree(requested.nid, user.id);
    }
    const detailsHash = this.codec.fingerprint(user.id, user.role, requested);
    const result = await this.tx.send(actor.keyIndex, 'AccessRegistry', (c) =>
      c.updateDetailsHash.populateTransaction(
        uuidToBytes32(user.id),
        detailsHash,
      ),
    );
    try {
      await this.dataSource.transaction(async (m) => {
        await this.receipts.apply(result, m);
        await m.update(
          PersonalDetails,
          { userId: user.id },
          {
            ...this.codec.seal(user.id, requested),
            detailsHash,
            idCheck: change.idCheck,
          },
        );
        await m.update(
          User,
          { id: user.id },
          { phoneIndex: this.codec.phoneIndex(requested.phone) },
        );
        await this.nameIndex.write(m, user.id, requested.fullName);
        await m.update(
          DetailChangeRequest,
          { id },
          {
            status: DetailChangeStatus.APPROVED,
            decidedById: actor.id,
            decidedAt: new Date(),
            txHash: result.hash,
          },
        );
        await this.notifyDecided(
          m,
          change,
          NotificationKind.DETAILS_CHANGE_APPROVED,
          {},
        );
      });
    } catch (error) {
      throw mapUniqueViolation(error);
    }
    await this.receipts.announce(result);
    return this.review(actor, id);
  }

  async reject(
    actor: AuthUser,
    id: string,
    reason: string,
  ): Promise<DetailChangeReviewDto> {
    const { change, user } = await this.load(id);
    this.assertDecidable(actor, change, user);
    await this.dataSource.transaction(async (m) => {
      await m.update(
        DetailChangeRequest,
        { id },
        {
          status: DetailChangeStatus.REJECTED,
          decidedById: actor.id,
          decidedAt: new Date(),
          reason,
        },
      );
      await this.notifyDecided(
        m,
        change,
        NotificationKind.DETAILS_CHANGE_REJECTED,
        {
          reason,
        },
      );
    });
    return this.review(actor, id);
  }

  // --- Internals ---

  private assertDecidable(
    actor: AuthUser,
    change: DetailChangeRequest,
    user: User,
  ): void {
    assertCanManage(actor, user.role);
    if (user.id === actor.id) {
      throw new ForbiddenException({
        message: 'Someone else must review your own details change',
        code: ErrorCode.CHANGE_OWN_REQUEST,
      });
    }
    if (change.status !== DetailChangeStatus.PENDING) {
      throw new ConflictException({
        message: `This details change is ${change.status}`,
        code: ErrorCode.CHANGE_NOT_PENDING,
        details: { status: change.status },
      });
    }
  }

  private notifyDecided(
    m: Parameters<NotificationWriter['send']>[0],
    change: DetailChangeRequest,
    kind:
      | NotificationKind.DETAILS_CHANGE_APPROVED
      | NotificationKind.DETAILS_CHANGE_REJECTED,
    params: Record<string, string>,
  ) {
    const approved = kind === NotificationKind.DETAILS_CHANGE_APPROVED;
    return this.writer.send(m, [change.userId], {
      category: NotificationCategory.OUTCOME,
      kind,
      title: approved
        ? 'Your new details are approved'
        : 'Your change of details was not approved',
      body: approved ? null : (params.reason ?? null),
      params,
      subject: { type: 'detail-change', id: change.id },
      key: `detail-change:${change.id}:${approved ? 'approved' : 'rejected'}`,
    });
  }

  private reviewableRoles(actor: AuthUser): Role[] {
    const staff = actor.role === Role.SUPER_ADMIN;
    return Object.values(Role).filter(
      (r) => r !== Role.SUPER_ADMIN && isStaffRole(r) === staff,
    );
  }

  private async load(id: string) {
    const change = await this.changes.findOne({ where: { id } });
    if (!change) {
      throw new NotFoundException({
        message: 'Details change not found',
        code: ErrorCode.CHANGE_NOT_FOUND,
      });
    }
    const [user, details] = await Promise.all([
      this.users.findOneOrFail({ where: { id: change.userId } }),
      this.details.findOneByOrFail({ userId: change.userId }),
    ]);
    return { change, user, details };
  }

  private async assertPhoneFree(phone: string, userId: string): Promise<void> {
    const taken = await this.users.exists({
      where: { phoneIndex: this.codec.phoneIndex(phone), id: Not(userId) },
    });
    if (taken) throw duplicate('uq_users_phone_index');
  }

  private async assertNidFree(nid: string, userId: string): Promise<void> {
    const taken = await this.details.exists({
      where: { nidIndex: this.codec.nidIndex(nid), userId: Not(userId) },
    });
    if (taken) throw duplicate('uq_personal_details_nid_index');
  }

  private async names(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.details.find({
      where: { userId: In([...new Set(ids)]) },
      select: { userId: true, fullNameEnc: true },
    });
    return new Map(rows.map((r) => [r.userId, this.codec.openName(r)]));
  }

  private summary(
    c: DetailChangeRequest,
    role: Role,
    names: Map<string, string>,
  ): Pick<DetailChangeSummaryDto, keyof DetailChangeSummaryDto> {
    return {
      id: c.id,
      participant: { id: c.userId, name: names.get(c.userId) ?? '' },
      role,
      status: c.status,
      changedFields: c.changedFields,
      idCheckOutcome: c.idCheck?.outcome ?? null,
      createdAt: c.createdAt,
    };
  }

  private view(c: DetailChangeRequest): DetailChangeDto {
    return {
      id: c.id,
      status: c.status,
      requested: this.open(c),
      changedFields: c.changedFields,
      idCheck: c.idCheck,
      createdAt: c.createdAt,
      decidedAt: c.decidedAt,
      reason: c.reason,
    };
  }

  private seal(id: string, d: NormalisedDetails): string {
    return this.crypto.encrypt(JSON.stringify(d), context(id));
  }

  private open(c: DetailChangeRequest): OwnDetailsDto {
    const d = JSON.parse(
      this.crypto.decrypt(c.detailsEnc, context(c.id)),
    ) as NormalisedDetails;
    return {
      fullName: d.fullName,
      phone: d.phone,
      nid: d.nid ?? null,
      dateOfBirth: d.dateOfBirth ?? null,
      district: d.district ?? null,
      address: d.address ?? null,
    };
  }
}

/** Associated data binding the ciphertext to its request. */
const context = (id: string) => `detail_change_requests.details:${id}`;
