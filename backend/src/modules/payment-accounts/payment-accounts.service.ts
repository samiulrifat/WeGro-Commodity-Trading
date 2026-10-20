import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ErrorCode } from '../../common/errors/error-code';
import type { AuthUser } from '../auth/auth-user';
import { BankListService } from '../bank-list/bank-list.service';
import type {
  CreatePaymentAccountDto,
  PaymentAccountDto,
  UpdatePaymentAccountDto,
} from './dto/payment-account.dto';
import { PaymentAccount } from './entities/payment-account.entity';

/**
 * WeGro's bank accounts that investors pay into: kept by the super admin
 * and Accounts, shown to investors with their booking.
 */
@Injectable()
export class PaymentAccountsService {
  constructor(
    @InjectRepository(PaymentAccount)
    private readonly accounts: Repository<PaymentAccount>,
    private readonly bankList: BankListService,
  ) {}

  /** In use, in the order investors see them; or every one, retired too. */
  async list(includeRetired = false): Promise<PaymentAccountDto[]> {
    const rows = await this.accounts.find({
      where: includeRetired ? {} : { active: true },
      order: { active: 'DESC', sortOrder: 'ASC', bankName: 'ASC' },
    });
    return rows.map(view);
  }

  async create(
    actor: AuthUser,
    dto: CreatePaymentAccountDto,
  ): Promise<PaymentAccountDto> {
    const branch = await this.branch(dto.routingNumber);
    const row = await this.saveOnce(
      this.accounts.create({
        ...branch,
        accountName: dto.accountName,
        accountNumber: dto.accountNumber,
        sortOrder: dto.sortOrder ?? 0,
        active: true,
        createdById: actor.id,
        updatedById: actor.id,
      }),
    );
    return view(row);
  }

  async update(
    actor: AuthUser,
    id: string,
    dto: UpdatePaymentAccountDto,
  ): Promise<PaymentAccountDto> {
    const row = await this.accounts.findOneBy({ id });
    if (!row) {
      throw new NotFoundException({
        message: 'Payment account not found',
        code: ErrorCode.PAYMENT_ACCOUNT_NOT_FOUND,
      });
    }
    if (dto.routingNumber && dto.routingNumber !== row.routingNumber) {
      Object.assign(row, await this.branch(dto.routingNumber));
    }
    if (dto.accountName !== undefined) row.accountName = dto.accountName;
    if (dto.accountNumber !== undefined) row.accountNumber = dto.accountNumber;
    if (dto.sortOrder !== undefined) row.sortOrder = dto.sortOrder;
    if (dto.active !== undefined) row.active = dto.active;
    row.updatedById = actor.id;
    return view(await this.saveOnce(row));
  }

  /** One account per branch and number: a second one is refused, not added. */
  private async saveOnce(row: PaymentAccount): Promise<PaymentAccount> {
    try {
      return await this.accounts.save(row);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException({
          message: 'This account is already listed',
          code: ErrorCode.PAYMENT_ACCOUNT_EXISTS,
        });
      }
      throw error;
    }
  }

  private async branch(routingNumber: string) {
    const b = await this.bankList.find(routingNumber);
    if (!b) {
      throw new UnprocessableEntityException({
        message: `No branch has routing number ${routingNumber}`,
        code: ErrorCode.BANK_BRANCH_NOT_FOUND,
        details: { routingNumber },
      });
    }
    return {
      bankName: b.bank.name,
      branchName: b.name,
      districtName: b.district.name,
      routingNumber: b.routingNumber,
    };
  }
}

const view = (r: PaymentAccount): PaymentAccountDto => ({
  id: r.id,
  bankName: r.bankName,
  branchName: r.branchName,
  districtName: r.districtName,
  routingNumber: r.routingNumber,
  accountName: r.accountName,
  accountNumber: r.accountNumber,
  active: r.active,
  sortOrder: r.sortOrder,
  updatedAt: r.updatedAt,
});
