import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, QueryFailedError, Repository } from 'typeorm';
import { PersonSearch } from '../users/person-search';
import { ChainClock } from '../../blockchain/chain-clock';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import { TransactionService } from '../../blockchain/tx/transaction.service';
import { fingerprint } from '../../blockchain/utils/fingerprint';
import { codeToBytes32, uuidToBytes32 } from '../../blockchain/utils/ids';
import { Paginated } from '../../common/dto/pagination.dto';
import type { EnvironmentVariables } from '../../config/env.validation';
import type { AuthUser } from '../auth/auth-user';
import { CatalogService } from '../catalog/catalog.service';
import { ProjectViews } from '../projects/project-views';
import { Role } from '../users/roles';
import {
  bdDate,
  expiresAtSeconds,
  isExpired,
  producedAtSeconds,
} from './batch-dates';
import type {
  ListBatchesQueryDto,
  RegisterBatchDto,
} from './dto/voucher-request.dto';
import type {
  BatchDto,
  BatchVerificationDto,
  InputRefDto,
} from './dto/voucher-response.dto';
import { InputBatch } from './entities/input-batch.entity';
import { BatchStatus } from './voucher.enums';
import { ErrorCode } from '../../common/errors/error-code';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Supplier input batches and the public "is this genuine?" check behind their QR codes. */
@Injectable()
export class BatchesService {
  private readonly appUrl: string;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    @InjectRepository(InputBatch)
    private readonly batches: Repository<InputBatch>,
    private readonly catalog: CatalogService,
    private readonly views: ProjectViews,
    private readonly tx: TransactionService,
    private readonly receipts: ReceiptApplier,
    private readonly contracts: ContractsRegistry,
    private readonly clock: ChainClock,
    private readonly search: PersonSearch,
  ) {
    this.appUrl = config
      .get('PUBLIC_APP_URL', { infer: true })
      .replace(/\/+$/, '');
  }

  verifyUrl(batchId: string): string {
    return `${this.appUrl}/verify/batch/${batchId}`;
  }

  async register(actor: AuthUser, dto: RegisterBatchDto): Promise<BatchDto> {
    this.catalog.inputTypes.requireActive(dto.inputTypeCode);
    const today = bdDate(await this.clock.now());
    if (dto.producedOn > today) {
      throw new UnprocessableEntityException({
        message: 'producedOn cannot be in the future',
        code: ErrorCode.PRODUCED_IN_FUTURE,
      });
    }
    if (dto.expiresOn && dto.expiresOn < dto.producedOn) {
      throw new UnprocessableEntityException({
        message: 'expiresOn cannot be before producedOn',
        code: ErrorCode.EXPIRES_BEFORE_PRODUCED,
      });
    }

    const batch = this.batches.create({
      id: randomUUID(),
      supplierId: actor.id,
      inputTypeCode: dto.inputTypeCode,
      lotNumber: dto.lotNumber,
      quantity: dto.quantity ?? null,
      manufacturer: dto.manufacturer ?? null,
      producedOn: dto.producedOn,
      expiresOn: dto.expiresOn ?? null,
      notes: dto.notes ?? null,
      status: BatchStatus.SUBMITTED,
      registeredAt: null,
    });
    batch.detailsHash = batchFingerprint(batch);
    try {
      await this.batches.insert(batch);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException({
          message: 'You already registered this lot number for this input',
          code: ErrorCode.LOT_ALREADY_REGISTERED,
        });
      }
      throw error;
    }

    try {
      const result = await this.tx.send(
        actor.keyIndex,
        'VoucherRegistry',
        (c) =>
          c.registerBatch.populateTransaction(
            uuidToBytes32(batch.id),
            codeToBytes32(batch.inputTypeCode),
            producedAtSeconds(batch.producedOn),
            expiresAtSeconds(batch.expiresOn),
            batch.detailsHash,
          ),
      );
      await this.receipts.apply(result);
    } catch (error) {
      if (error instanceof ContractRevertException)
        await this.batches.delete({ id: batch.id });
      throw error;
    }
    return this.findOne(actor, batch.id);
  }

  async list(
    actor: AuthUser,
    q: ListBatchesQueryDto,
  ): Promise<Paginated<BatchDto>> {
    const qb = this.batches.createQueryBuilder('b');
    if (actor.role === Role.SUPPLIER)
      qb.where('b.supplier_id = :me', { me: actor.id });
    if (q.inputTypeCode)
      qb.andWhere('b.input_type_code = :c', { c: q.inputTypeCode });
    const text = (q.q ?? '').trim();
    if (text) {
      // Staff and officers may also find a supplier's batches by the supplier.
      const supplier =
        actor.role === Role.SUPPLIER
          ? null
          : this.search.condition('b.supplier_id', text, 'Supplier');
      qb.andWhere(
        new Brackets((w) => {
          w.where('b.lot_number ILIKE :like', {
            like: `%${escapeLike(text)}%`,
          }).orWhere('b.manufacturer ILIKE :like');
          if (supplier) w.orWhere(supplier.sql, supplier.params);
        }),
      );
    }
    const [rows, total] = await qb
      .orderBy('b.created_at', 'DESC')
      .addOrderBy('b.id', 'ASC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.dtos(rows), total, q);
  }

  async findOne(actor: AuthUser, id: string): Promise<BatchDto> {
    const batch = await this.batches.findOneBy({ id });
    if (
      !batch ||
      (actor.role === Role.SUPPLIER && batch.supplierId !== actor.id)
    ) {
      throw new NotFoundException({
        message: 'Batch not found',
        code: ErrorCode.BATCH_NOT_FOUND,
      });
    }
    return (await this.dtos([batch]))[0];
  }

  /**
   * Public check behind the QR code. Genuine means the batch is on the ledger
   * AND the details shown here still produce the fingerprint registered there,
   * so neither a fake id nor an edited record passes.
   */
  async verify(id: string): Promise<BatchVerificationDto> {
    const notGenuine: BatchVerificationDto = {
      genuine: false,
      product: null,
      lotNumber: null,
      manufacturer: null,
      producedOn: null,
      expiresOn: null,
      expired: false,
      supplierName: null,
      registeredAt: null,
    };
    if (!UUID.test(id)) return notGenuine;

    const [batch, onChain, now] = await Promise.all([
      this.batches.findOneBy({ id }),
      this.contracts.get('VoucherRegistry').getBatch(uuidToBytes32(id)),
      this.clock.now(),
    ]);
    if (onChain.registeredAt === 0n || !batch) return notGenuine;
    const matches =
      onChain.supplierId === uuidToBytes32(batch.supplierId) &&
      onChain.productCode === codeToBytes32(batch.inputTypeCode) &&
      onChain.detailsHash === batchFingerprint(batch);
    if (!matches) return notGenuine;

    const names = await this.views.names([batch.supplierId]);
    return {
      genuine: true,
      product: this.inputRef(batch.inputTypeCode),
      lotNumber: batch.lotNumber,
      manufacturer: batch.manufacturer,
      producedOn: batch.producedOn,
      expiresOn: batch.expiresOn,
      expired: isExpired(batch.expiresOn, now),
      supplierName: names.get(batch.supplierId) ?? null,
      registeredAt: new Date(Number(onChain.registeredAt) * 1000),
    };
  }

  inputRef(code: string): InputRefDto {
    const input = this.catalog.inputTypes.get(code);
    const unit = input ? this.catalog.units.get(input.unitCode) : undefined;
    return {
      code,
      name: input?.name ?? code,
      nameBn: input?.nameBn ?? code,
      unit: unit?.symbol ?? '',
      unitBn: unit?.symbolBn ?? '',
    };
  }

  private async dtos(rows: InputBatch[]): Promise<BatchDto[]> {
    const names = await this.views.names(rows.map((b) => b.supplierId));
    return rows.map((b) => ({
      id: b.id,
      supplier: { id: b.supplierId, name: names.get(b.supplierId) ?? '' },
      input: this.inputRef(b.inputTypeCode),
      lotNumber: b.lotNumber,
      quantity: b.quantity,
      manufacturer: b.manufacturer,
      producedOn: b.producedOn,
      expiresOn: b.expiresOn,
      notes: b.notes,
      status: b.status,
      registeredAt: b.registeredAt,
      verifyUrl: this.verifyUrl(b.id),
    }));
  }
}

/** The fingerprint registered on the ledger: every detail, bound to the batch and supplier. */
export function batchFingerprint(
  b: Pick<
    InputBatch,
    | 'id'
    | 'supplierId'
    | 'inputTypeCode'
    | 'lotNumber'
    | 'quantity'
    | 'manufacturer'
    | 'producedOn'
    | 'expiresOn'
    | 'notes'
  >,
): string {
  return fingerprint('input.batch', {
    v: 1,
    batchId: b.id,
    supplierId: b.supplierId,
    inputTypeCode: b.inputTypeCode,
    lotNumber: b.lotNumber,
    quantity: b.quantity,
    manufacturer: b.manufacturer,
    producedOn: b.producedOn,
    expiresOn: b.expiresOn,
    notes: b.notes,
  });
}

/** Typed text matched literally inside LIKE. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&');
