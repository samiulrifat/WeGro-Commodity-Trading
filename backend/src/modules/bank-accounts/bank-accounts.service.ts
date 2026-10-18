import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { IdentityCryptoService } from '../../common/crypto/identity-crypto.service';
import { Paginated } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../auth/auth-user';
import { ProjectViews } from '../projects/project-views';
import { User } from '../users/entities/user.entity';
import {
  NotificationCategory,
  NotificationKind,
} from '../notifications/notification.enums';
import {
  type Note,
  NotificationWriter,
} from '../notifications/notification-writer';
import { Role } from '../users/roles';
import type {
  BankAccountDto,
  BankAccountsDto,
  BankDetailsDto,
  ListPendingQueryDto,
  PendingBankAccountDto,
} from './dto/bank-account.dto';
import { BankAccount, BankAccountStatus } from './entities/bank-account.entity';
import { ErrorCode } from '../../common/errors/error-code';

/** Only payees have bank accounts. */
const PAYEE_ROLES: ReadonlySet<Role> = new Set([Role.FARMER, Role.INVESTOR]);
/** See full account numbers; others with access see the last four digits. */
const SEES_FULL: ReadonlySet<Role> = new Set([
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.ACCOUNTS,
]);

export interface BankDetails {
  holderName: string;
  bankName: string;
  branchName: string;
  accountNumber: string;
  routingNumber: string;
}

/**
 * Payees' bank accounts. The payee or an admin enters them; they take
 * effect once a different admin verifies them, and every version is kept.
 */
@Injectable()
export class BankAccountsService {
  private readonly logger = new Logger(BankAccountsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(BankAccount)
    private readonly accounts: Repository<BankAccount>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly crypto: IdentityCryptoService,
    private readonly views: ProjectViews,
    private readonly writer: NotificationWriter,
  ) {}

  /** Enters new details for a payee; they wait for an admin, replacing any still waiting. */
  async submit(
    actor: AuthUser,
    userId: string,
    dto: BankDetailsDto,
  ): Promise<BankAccountsDto> {
    await this.requirePayee(userId);
    const details: BankDetails = {
      holderName: dto.holderName,
      bankName: dto.bankName,
      branchName: dto.branchName,
      accountNumber: dto.accountNumber,
      routingNumber: dto.routingNumber,
    };
    const current = await this.accounts.findOneBy({
      userId,
      status: BankAccountStatus.VERIFIED,
    });
    if (current && sameDetails(this.open(current), details)) {
      throw new ConflictException({
        message: 'These details are already verified',
        code: ErrorCode.BANK_DETAILS_ALREADY_VERIFIED,
      });
    }
    const id = randomUUID();
    await this.dataSource
      .transaction(async (m) => {
        await m.update(
          BankAccount,
          { userId, status: BankAccountStatus.PENDING },
          { status: BankAccountStatus.SUPERSEDED },
        );
        await m.insert(BankAccount, {
          id,
          userId,
          detailsEnc: this.crypto.encrypt(JSON.stringify(details), context(id)),
          status: BankAccountStatus.PENDING,
          enteredById: actor.id,
        });
      })
      .catch((error: unknown) => {
        // Another submission for this payee got in first.
        if (
          error instanceof QueryFailedError &&
          /uq_bank_accounts_pending/.test(error.message)
        ) {
          throw new ConflictException({
            message: 'Other details were entered meanwhile; try again',
            code: ErrorCode.CHANGED_MEANWHILE,
          });
        }
        throw error;
      });
    await this.notify(await this.admins([actor.id]), {
      category: NotificationCategory.ACTION,
      kind: NotificationKind.BANK_ACCOUNT_SUBMITTED,
      title: 'Bank details awaiting verification',
      params: {},
      subject: { type: 'participant', id: userId },
      key: `bank:${id}:submitted`,
    });
    return this.forUser(actor, userId);
  }

  /** An admin, other than whoever entered them, makes the waiting details the ones paid to. */
  async verify(actor: AuthUser, userId: string): Promise<BankAccountsDto> {
    const pending = await this.pendingOf(userId);
    if (pending.enteredById === actor.id) {
      throw new ForbiddenException({
        message:
          'Details must be verified by someone other than who entered them',
        code: ErrorCode.SAME_PERSON,
      });
    }
    await this.dataSource.transaction(async (m) => {
      await m.update(
        BankAccount,
        { userId, status: BankAccountStatus.VERIFIED },
        { status: BankAccountStatus.SUPERSEDED },
      );
      const done = await m.update(
        BankAccount,
        { id: pending.id, status: BankAccountStatus.PENDING },
        {
          status: BankAccountStatus.VERIFIED,
          decidedById: actor.id,
          decidedAt: new Date(),
        },
      );
      if (done.affected !== 1) {
        throw new ConflictException({
          message: 'The details changed meanwhile; try again',
          code: ErrorCode.CHANGED_MEANWHILE,
        });
      }
    });
    await this.notify([userId], {
      category: NotificationCategory.OUTCOME,
      kind: NotificationKind.BANK_ACCOUNT_VERIFIED,
      title: 'Your bank details are verified: payouts will go there',
      params: {},
      subject: { type: 'participant', id: userId },
      key: `bank:${pending.id}:verified`,
    });
    return this.forUser(actor, userId);
  }

  async reject(
    actor: AuthUser,
    userId: string,
    reason: string,
  ): Promise<BankAccountsDto> {
    const pending = await this.pendingOf(userId);
    const done = await this.accounts.update(
      { id: pending.id, status: BankAccountStatus.PENDING },
      {
        status: BankAccountStatus.REJECTED,
        decidedById: actor.id,
        decidedAt: new Date(),
        rejectionReason: reason,
      },
    );
    if (done.affected !== 1) {
      throw new ConflictException({
        message: 'The details changed meanwhile; try again',
        code: ErrorCode.CHANGED_MEANWHILE,
      });
    }
    await this.notify([userId], {
      category: NotificationCategory.OUTCOME,
      kind: NotificationKind.BANK_ACCOUNT_REJECTED,
      title: 'Your new bank details were not accepted',
      body: reason,
      params: { reason },
      subject: { type: 'participant', id: userId },
      key: `bank:${pending.id}:rejected`,
    });
    return this.forUser(actor, userId);
  }

  /** Current, waiting and earlier details of one payee. */
  async forUser(actor: AuthUser, userId: string): Promise<BankAccountsDto> {
    await this.requirePayee(userId);
    const rows = await this.accounts.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const views = await this.dtos(actor, rows);
    return {
      verified:
        views.find((v) => v.status === BankAccountStatus.VERIFIED) ?? null,
      pending:
        views.find((v) => v.status === BankAccountStatus.PENDING) ?? null,
      history: views.filter(
        (v) =>
          v.status !== BankAccountStatus.VERIFIED &&
          v.status !== BankAccountStatus.PENDING,
      ),
    };
  }

  /** The admins' queue: details waiting for verification, oldest first. */
  async listPending(
    actor: AuthUser,
    q: ListPendingQueryDto,
  ): Promise<Paginated<PendingBankAccountDto>> {
    const [rows, total] = await this.accounts.findAndCount({
      where: { status: BankAccountStatus.PENDING },
      order: { createdAt: 'ASC' },
      skip: q.skip,
      take: q.limit,
    });
    const userIds = rows.map((r) => r.userId);
    const [views, owners, changes, names] = await Promise.all([
      this.dtos(actor, rows),
      userIds.length
        ? this.users.find({
            where: { id: In(userIds) },
            select: { id: true, role: true },
          })
        : [],
      userIds.length
        ? this.accounts.find({
            where: { userId: In(userIds), status: BankAccountStatus.VERIFIED },
            select: { userId: true },
          })
        : [],
      this.views.names(userIds),
    ]);
    const roleOf = new Map(owners.map((u) => [u.id, u.role]));
    const hasVerified = new Set(changes.map((c) => c.userId));
    const items = rows.map((r, i) => ({
      ...views[i],
      owner: { id: r.userId, name: names.get(r.userId) ?? '' },
      ownerRole: roleOf.get(r.userId) ?? '',
      isChange: hasVerified.has(r.userId),
    }));
    return new Paginated(items, total, q);
  }

  /**
   * Verified details of many payees, and which of them have a change
   * waiting, in two queries: what a payout sheet needs.
   */
  async forPayout(userIds: string[]): Promise<{
    verified: Map<string, BankDetails & { verifiedAt: Date | null }>;
    pendingChange: Set<string>;
  }> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0)
      return { verified: new Map(), pendingChange: new Set() };
    const rows = await this.accounts.find({
      where: {
        userId: In(ids),
        status: In([BankAccountStatus.VERIFIED, BankAccountStatus.PENDING]),
      },
    });
    const verified = new Map<
      string,
      BankDetails & { verifiedAt: Date | null }
    >();
    const pendingChange = new Set<string>();
    for (const r of rows) {
      if (r.status === BankAccountStatus.PENDING) pendingChange.add(r.userId);
      else verified.set(r.userId, { ...this.open(r), verifiedAt: r.decidedAt });
    }
    return { verified, pendingChange };
  }

  // --- Internals ---

  /** Best effort: the change itself stands even if the notice fails. */
  private async notify(to: string[], note: Note): Promise<void> {
    try {
      await this.writer.send(this.dataSource.manager, to, note);
    } catch (error) {
      this.logger.error(
        `Notification ${note.kind} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private admins(except: string[]): Promise<string[]> {
    return this.writer.withRole(this.dataSource.manager, [Role.ADMIN], except);
  }

  private async requirePayee(userId: string): Promise<void> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user)
      throw new NotFoundException({
        message: 'Participant not found',
        code: ErrorCode.PARTICIPANT_NOT_FOUND,
      });
    if (!PAYEE_ROLES.has(user.role)) {
      throw new UnprocessableEntityException({
        message: 'Only farmers and investors receive payouts',
        code: ErrorCode.NOT_A_PAYEE,
      });
    }
  }

  private async pendingOf(userId: string): Promise<BankAccount> {
    await this.requirePayee(userId);
    const pending = await this.accounts.findOneBy({
      userId,
      status: BankAccountStatus.PENDING,
    });
    if (!pending)
      throw new NotFoundException({
        message: 'No details waiting',
        code: ErrorCode.NO_DETAILS_WAITING,
      });
    return pending;
  }

  private open(row: BankAccount): BankDetails {
    return JSON.parse(
      this.crypto.decrypt(row.detailsEnc, context(row.id)),
    ) as BankDetails;
  }

  private async dtos(
    actor: AuthUser,
    rows: BankAccount[],
  ): Promise<Plain<BankAccountDto>[]> {
    const names = await this.views.names(
      rows.flatMap((r) =>
        r.decidedById ? [r.enteredById, r.decidedById] : [r.enteredById],
      ),
    );
    // A payee sees their own numbers in full.
    const full = (r: BankAccount) =>
      SEES_FULL.has(actor.role) || r.userId === actor.id;
    return rows.map((r) => {
      const d = this.open(r);
      return {
        id: r.id,
        ...d,
        accountNumber: full(r) ? d.accountNumber : mask(d.accountNumber),
        status: r.status,
        enteredBy: { id: r.enteredById, name: names.get(r.enteredById) ?? '' },
        enteredAt: r.createdAt,
        decidedBy: r.decidedById
          ? { id: r.decidedById, name: names.get(r.decidedById) ?? '' }
          : null,
        decidedAt: r.decidedAt,
        rejectionReason: r.rejectionReason,
      };
    });
  }
}

/** A DTO's fields as a plain object type, so views can be spread into larger ones. */
type Plain<T> = { [K in keyof T]: T[K] };

const context = (id: string) => `bank_accounts.details:${id}`;

const mask = (accountNumber: string) =>
  `${'•'.repeat(Math.max(accountNumber.length - 4, 0))}${accountNumber.slice(-4)}`;

function sameDetails(a: BankDetails, b: BankDetails): boolean {
  return (
    a.holderName === b.holderName &&
    a.bankName === b.bankName &&
    a.branchName === b.branchName &&
    a.accountNumber === b.accountNumber &&
    a.routingNumber === b.routingNumber
  );
}
