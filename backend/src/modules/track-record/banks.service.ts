import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ContractTransaction } from 'ethers';
import { In, Repository } from 'typeorm';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import type { ConsentRegistry } from '../../blockchain/generated';
import { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import { TransactionService } from '../../blockchain/tx/transaction.service';
import { uuidToBytes32, ZERO_BYTES32 } from '../../blockchain/utils/ids';
import {
  BD_DISTRICTS,
  isDistrictCode,
} from '../../common/reference/bd-districts';
import type { AuthUser } from '../auth/auth-user';
import { ProjectViews } from '../projects/project-views';
import { ChainState, User } from '../users/entities/user.entity';
import { ParticipantStatus, Role } from '../users/roles';
import type {
  BankDto,
  ListBanksQueryDto,
  RegisterBankDto,
} from './dto/track-record.dto';
import { Bank } from './entities/bank.entity';
import { BankOfficer } from './entities/bank-officer.entity';
import { bankFingerprint } from './track-record-fingerprints';
import { ErrorCode } from '../../common/errors/error-code';

/** See which officers work for each bank. */
const SEES_OFFICERS: ReadonlySet<Role> = new Set([
  Role.SuperAdmin,
  Role.Admin,
  Role.Auditor,
]);

/** Banks (ConsentRegistry): registered by an admin, with their officers. */
@Injectable()
export class BanksService {
  constructor(
    @InjectRepository(Bank) private readonly banks: Repository<Bank>,
    @InjectRepository(BankOfficer)
    private readonly officers: Repository<BankOfficer>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly views: ProjectViews,
    private readonly tx: TransactionService,
    private readonly applier: ReceiptApplier,
  ) {}

  async register(actor: AuthUser, dto: RegisterBankDto): Promise<BankDto> {
    const bank = this.banks.create({
      id: randomUUID(),
      name: dto.name,
      branchName: dto.branchName,
      districtCode: dto.districtCode,
      address: dto.address,
      status: 'submitted',
      createdById: actor.id,
    });
    bank.detailsHash = bankFingerprint(bank);
    try {
      await this.banks.insert(bank);
    } catch (error) {
      if (
        (error as { driverError?: { code?: string } }).driverError?.code ===
        '23505'
      ) {
        throw new ConflictException({
          message: 'This bank branch is already registered',
          code: ErrorCode.BankExists,
        });
      }
      throw error;
    }
    try {
      await this.send(actor, (c) =>
        c.registerBank.populateTransaction(
          uuidToBytes32(bank.id),
          bank.detailsHash,
        ),
      );
    } catch (error) {
      if (error instanceof ContractRevertException)
        await this.banks.delete({ id: bank.id, status: 'submitted' });
      throw error;
    }
    return this.one(actor, bank.id);
  }

  async list(actor: AuthUser, q: ListBanksQueryDto): Promise<BankDto[]> {
    const rows = await this.banks.find({
      where: {
        status: 'registered',
        ...(q.districtCode && { districtCode: q.districtCode }),
      },
      order: { name: 'ASC', branchName: 'ASC' },
    });
    return this.dtos(actor, rows);
  }

  async one(actor: AuthUser, id: string): Promise<BankDto> {
    const bank = await this.banks.findOneBy({ id });
    if (!bank)
      throw new NotFoundException({
        message: 'Bank not found',
        code: ErrorCode.BankNotFound,
      });
    return (await this.dtos(actor, [bank]))[0];
  }

  /** Puts a verified bank officer at a bank, or (null) removes them from theirs. */
  async assignOfficer(
    actor: AuthUser,
    officerId: string,
    bankId: string | null,
  ): Promise<BankDto | null> {
    const officer = await this.users.findOneBy({ id: officerId });
    if (
      !officer ||
      officer.role !== Role.Bank ||
      officer.status !== ParticipantStatus.Verified ||
      officer.chainState !== ChainState.Confirmed
    ) {
      throw new UnprocessableEntityException({
        message: 'Only a verified bank officer can be assigned',
        code: ErrorCode.BankOfficerInvalid,
      });
    }
    if (bankId) {
      const bank = await this.banks.findOneBy({ id: bankId });
      if (!bank || bank.status !== 'registered')
        throw new NotFoundException({
          message: 'Bank not found',
          code: ErrorCode.BankNotFound,
        });
    }
    await this.send(actor, (c) =>
      c.assignBankOfficer.populateTransaction(
        uuidToBytes32(officerId),
        bankId ? uuidToBytes32(bankId) : ZERO_BYTES32,
      ),
    );
    return bankId ? this.one(actor, bankId) : null;
  }

  /** The bank an officer works for, or null. */
  async bankOf(officerId: string): Promise<string | null> {
    const row = await this.officers.findOneBy({ officerId });
    return row?.bankId ?? null;
  }

  async names(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.banks.find({
      where: { id: In([...new Set(ids)]) },
      select: { id: true, name: true, branchName: true },
    });
    return new Map(rows.map((b) => [b.id, `${b.name}, ${b.branchName}`]));
  }

  async send(
    actor: AuthUser,
    build: (c: ConsentRegistry) => Promise<ContractTransaction>,
  ) {
    const result = await this.tx.send(actor.keyIndex, 'ConsentRegistry', build);
    await this.applier.apply(result);
    return result;
  }

  /** One query for every listed bank's officers and one for their names. */
  private async dtos(actor: AuthUser, rows: Bank[]): Promise<BankDto[]> {
    const withOfficers = SEES_OFFICERS.has(actor.role) && rows.length > 0;
    const officers = withOfficers
      ? await this.officers.find({
          where: { bankId: In(rows.map((b) => b.id)) },
        })
      : [];
    const names = await this.views.names(officers.map((o) => o.officerId));
    return rows.map((b) => ({
      id: b.id,
      name: b.name,
      branchName: b.branchName,
      district: {
        code: b.districtCode,
        name: isDistrictCode(b.districtCode)
          ? BD_DISTRICTS[b.districtCode].name
          : b.districtCode,
      },
      address: b.address,
      status: b.status,
      detailsHash: b.detailsHash,
      ...(withOfficers && {
        officers: officers
          .filter((o) => o.bankId === b.id)
          .map((o) => ({
            id: o.officerId,
            name: names.get(o.officerId) ?? '',
          })),
      }),
    }));
  }
}
