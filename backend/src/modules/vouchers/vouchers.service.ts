import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ContractTransaction } from 'ethers';
import {
  DataSource,
  In,
  type Repository,
  type SelectQueryBuilder,
} from 'typeorm';
import { ChainClock } from '../../blockchain/chain-clock';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import type { VoucherRegistry } from '../../blockchain/generated';
import { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import { TransactionService } from '../../blockchain/tx/transaction.service';
import { codeToBytes32, uuidToBytes32 } from '../../blockchain/utils/ids';
import { poishaToTaka, takaToPoisha } from '../../blockchain/utils/money';
import { Paginated } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../auth/auth-user';
import { CatalogService } from '../catalog/catalog.service';
import { Project } from '../projects/entities/project.entity';
import { ProjectStage } from '../projects/project.enums';
import { ProjectViews } from '../projects/project-views';
import { ChainState, User } from '../users/entities/user.entity';
import { ParticipantStatus, Role } from '../users/roles';
import { isExpired } from './batch-dates';
import { BatchesService } from './batches.service';
import type {
  ListSalesQueryDto,
  ListVouchersQueryDto,
  ProposeVoucherDto,
  RecordSaleDto,
} from './dto/voucher-request.dto';
import type {
  VoucherDetailDto,
  VoucherDto,
  VoucherSaleDto,
  VoucherSummaryDto,
} from './dto/voucher-response.dto';
import { InputBatch } from './entities/input-batch.entity';
import { VoucherSaleBatch } from './entities/voucher-sale-batch.entity';
import { VoucherSale } from './entities/voucher-sale.entity';
import { VoucherSupplier } from './entities/voucher-supplier.entity';
import { Voucher } from './entities/voucher.entity';
import {
  BatchStatus,
  OPEN_VOUCHER,
  SaleStatus,
  VoucherStatus,
} from './voucher.enums';
import { ErrorCode } from '../../common/errors/error-code';
import { type Problem, problem } from '../../common/errors/problem';

/** Staff see every voucher; others see only their own part. */
const VOUCHER_STAFF: ReadonlySet<Role> = new Set([
  Role.SuperAdmin,
  Role.Admin,
  Role.Operations,
  Role.Accounts,
  Role.Auditor,
]);

const DAY_MS = 86_400_000;

/**
 * Input vouchers and the sales made against them. Every rule the ledger
 * applies is checked here first, so callers get precise errors; the ledger
 * then checks again and is the final word.
 */
@Injectable()
export class VouchersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Voucher) private readonly vouchers: Repository<Voucher>,
    @InjectRepository(VoucherSale)
    private readonly sales: Repository<VoucherSale>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly catalog: CatalogService,
    private readonly views: ProjectViews,
    private readonly batches: BatchesService,
    private readonly tx: TransactionService,
    private readonly receipts: ReceiptApplier,
    private readonly contracts: ContractsRegistry,
    private readonly clock: ChainClock,
  ) {}

  // --- Vouchers ---

  /** Operations proposes a voucher; it is usable once Accounts approves it. */
  async propose(
    actor: AuthUser,
    projectId: string,
    dto: ProposeVoucherDto,
  ): Promise<VoucherDto> {
    const project = await this.projects.findOneBy({ id: projectId });
    if (!project)
      throw new NotFoundException({
        message: 'Project not found',
        code: ErrorCode.ProjectNotFound,
      });
    if (
      project.stage !== ProjectStage.Funded &&
      project.stage !== ProjectStage.Active
    ) {
      throw new ConflictException({
        message: 'Vouchers are issued only for funded or active projects',
        code: ErrorCode.VoucherProjectStage,
      });
    }
    this.catalog.inputTypes.requireActive(dto.inputTypeCode);
    await this.requireSuppliers(dto.supplierIds);

    const unitPrice = takaToPoisha(dto.unitPrice);
    const value = unitPrice * BigInt(dto.quantity);
    const committed = await this.registry().committedValue(
      uuidToBytes32(projectId),
    );
    const room = project.fundingTarget - committed;
    if (value > room) {
      throw new UnprocessableEntityException({
        message: 'The voucher is worth more than the funding left for inputs',
        code: ErrorCode.ExceedsFundingTarget,
        details: { value: poishaToTaka(value), room: poishaToTaka(room) },
      });
    }

    const id = randomUUID();
    await this.dataSource.transaction(async (m) => {
      await m.insert(Voucher, {
        id,
        projectId,
        farmerId: project.farmerId,
        inputTypeCode: dto.inputTypeCode,
        quantity: dto.quantity,
        unitPrice,
        value,
        status: VoucherStatus.Submitted,
        proposedById: actor.id,
      });
      await m.insert(
        VoucherSupplier,
        dto.supplierIds.map((supplierId, position) => ({
          voucherId: id,
          supplierId,
          position,
        })),
      );
    });

    try {
      await this.send(actor, (c) =>
        c.proposeVoucher.populateTransaction(
          uuidToBytes32(id),
          uuidToBytes32(projectId),
          codeToBytes32(dto.inputTypeCode),
          dto.quantity,
          unitPrice,
          dto.supplierIds.map(uuidToBytes32),
        ),
      );
    } catch (error) {
      if (error instanceof ContractRevertException) await this.removeLocal(id);
      throw error;
    }
    return this.findOne(actor, id);
  }

  async approve(actor: AuthUser, id: string): Promise<VoucherDto> {
    await this.requireStatus(id, [VoucherStatus.Proposed]);
    await this.send(actor, (c) =>
      c.approveVoucher.populateTransaction(uuidToBytes32(id)),
    );
    return this.findOne(actor, id);
  }

  async reject(actor: AuthUser, id: string): Promise<VoucherDto> {
    await this.requireStatus(id, [VoucherStatus.Proposed]);
    await this.send(actor, (c) =>
      c.rejectVoucher.populateTransaction(uuidToBytes32(id)),
    );
    return this.findOne(actor, id);
  }

  /** Voids the unused balance; pending sales can still be confirmed or expire. */
  async cancel(actor: AuthUser, id: string): Promise<VoucherDto> {
    await this.requireStatus(id, OPEN_VOUCHER);
    await this.send(actor, (c) =>
      c.cancelVoucher.populateTransaction(uuidToBytes32(id)),
    );
    return this.findOne(actor, id);
  }

  /** Super admin: days without activity before the voucher is flagged, or null for none. */
  async setInactivityLimit(
    actor: AuthUser,
    id: string,
    days: number | null,
  ): Promise<VoucherDto> {
    const res = await this.vouchers.update(
      { id, status: In([...OPEN_VOUCHER]) },
      { inactivityLimitDays: days },
    );
    if (res.affected !== 1) {
      await this.load(id);
      throw new ConflictException({
        message: 'Limits apply only to proposed or active vouchers',
        code: ErrorCode.VoucherLimitsNotApplicable,
      });
    }
    return this.findOne(actor, id);
  }

  /** Removes a proposal that never reached the ledger (e.g. the node was down). */
  async discard(id: string): Promise<void> {
    const voucher = await this.load(id);
    if (voucher.status !== VoucherStatus.Submitted) {
      throw new ConflictException({
        message: 'Only unconfirmed proposals can be discarded',
        code: ErrorCode.VoucherNotDiscardable,
      });
    }
    const onChain = await this.registry().getVoucher(uuidToBytes32(id));
    if (onChain.status !== 0n) {
      throw new ConflictException({
        message: 'The ledger has this voucher; it will appear shortly',
        code: ErrorCode.VoucherOnLedger,
      });
    }
    await this.removeLocal(id);
  }

  async summary(projectId: string): Promise<VoucherSummaryDto> {
    const project = await this.projects.findOneBy({ id: projectId });
    if (!project)
      throw new NotFoundException({
        message: 'Project not found',
        code: ErrorCode.ProjectNotFound,
      });
    const key = uuidToBytes32(projectId);
    const r = this.registry();
    // Sent together: one batched JSON-RPC request.
    const [committed, spent, pending] = await Promise.all([
      r.committedValue(key),
      r.spentValue(key),
      r.pendingSaleValue(key),
    ]);
    return {
      fundingTarget: poishaToTaka(project.fundingTarget),
      committed: poishaToTaka(committed),
      room: poishaToTaka(project.fundingTarget - committed),
      spent: poishaToTaka(spent),
      pendingSales: poishaToTaka(pending),
    };
  }

  async list(
    actor: AuthUser,
    q: ListVouchersQueryDto,
  ): Promise<Paginated<VoucherDto>> {
    const qb = this.vouchers.createQueryBuilder('v');
    this.scope(actor, qb);
    if (q.projectId) qb.andWhere('v.project_id = :pid', { pid: q.projectId });
    if (q.status) qb.andWhere('v.status = :st', { st: q.status });
    if (q.inputTypeCode)
      qb.andWhere('v.input_type_code = :it', { it: q.inputTypeCode });
    const now = await this.clock.now();
    if (q.inactive) {
      qb.andWhere(
        `v.status = 'active' AND v.inactivity_limit_days IS NOT NULL
         AND v.last_activity_at + make_interval(days => v.inactivity_limit_days) <= :now`,
        { now },
      );
    }
    const [rows, total] = await qb
      .orderBy('v.created_at', 'DESC')
      .addOrderBy('v.id', 'ASC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.dtos(rows, now), total, q);
  }

  async findOne(actor: AuthUser, id: string): Promise<VoucherDetailDto> {
    const voucher = await this.visible(actor, id);
    const [dto] = await this.dtos([voucher], await this.clock.now());
    const sales = await this.sales.find({
      where: { voucherId: id },
      order: { id: 'ASC' },
    });
    return Object.assign(dto, { sales: await this.saleDtos(sales) });
  }

  /** The voucher if the actor may see it; 404 otherwise. */
  async visible(actor: AuthUser, id: string): Promise<Voucher> {
    const qb = this.vouchers
      .createQueryBuilder('v')
      .where('v.id = :id', { id });
    this.scope(actor, qb);
    const voucher = await qb.getOne();
    if (!voucher)
      throw new NotFoundException({
        message: 'Voucher not found',
        code: ErrorCode.VoucherNotFound,
      });
    return voucher;
  }

  // --- Sales ---

  /** An approved supplier records goods handed over against the voucher. */
  async recordSale(
    actor: AuthUser,
    voucherId: string,
    dto: RecordSaleDto,
  ): Promise<VoucherSaleDto> {
    const voucher = await this.visible(actor, voucherId);
    if (voucher.status !== VoucherStatus.Active) {
      throw new ConflictException({
        message: 'This voucher is not active',
        code: ErrorCode.VoucherNotActive,
      });
    }
    const project = await this.projects.findOneByOrFail({
      id: voucher.projectId,
    });
    if (project.stage !== ProjectStage.Active) {
      throw new ConflictException({
        message: 'Sales are recorded only while the project is active',
        code: ErrorCode.ProjectNotActive,
      });
    }
    const available =
      voucher.quantity - voucher.spentQuantity - voucher.heldQuantity;
    if (dto.quantity > available) {
      throw new ConflictException({
        message: `Only ${available} left on this voucher`,
        code: ErrorCode.ExceedsVoucherQuantity,
        details: { available },
      });
    }
    const batchIds = dto.batchIds ?? [];
    await this.requireBatches(actor, voucher, batchIds);

    const result = await this.send(actor, (c) =>
      c.recordSale.populateTransaction(
        uuidToBytes32(voucherId),
        dto.quantity,
        batchIds.map(uuidToBytes32),
      ),
    );
    const saleId = Number(
      result.events.find((e) => e.name === 'SaleRecorded')!.args.saleId,
    );
    return this.saleOne(saleId);
  }

  /** The farmer's own field officer confirms the goods arrived. */
  async confirmSale(actor: AuthUser, saleId: number): Promise<VoucherSaleDto> {
    const sale = await this.pendingSale(saleId);
    const voucher = await this.vouchers.findOneByOrFail({ id: sale.voucherId });
    if (!(await this.isFarmersOfficer(actor, voucher.farmerId))) {
      throw new ForbiddenException({
        message: "Only the farmer's own field officer can confirm",
        code: ErrorCode.NotFarmersOfficer,
      });
    }
    await this.send(actor, (c) => c.confirmSale.populateTransaction(saleId));
    return this.saleOne(saleId);
  }

  /** By the supplier who recorded it, the farmer, their field officer, or an admin. */
  async cancelSale(actor: AuthUser, saleId: number): Promise<VoucherSaleDto> {
    const sale = await this.pendingSale(saleId);
    const voucher = await this.vouchers.findOneByOrFail({ id: sale.voucherId });
    const allowed =
      actor.role === Role.Admin ||
      (actor.role === Role.Supplier && sale.supplierId === actor.id) ||
      (actor.role === Role.Farmer && voucher.farmerId === actor.id) ||
      (actor.role === Role.FieldOfficer &&
        (await this.isFarmersOfficer(actor, voucher.farmerId)));
    if (!allowed)
      throw new ForbiddenException({
        message: 'You cannot cancel this sale',
        code: ErrorCode.SaleCancelNotAllowed,
      });
    await this.send(actor, (c) => c.cancelSale.populateTransaction(saleId));
    return this.saleOne(saleId);
  }

  async listSales(
    actor: AuthUser,
    q: ListSalesQueryDto,
  ): Promise<Paginated<VoucherSaleDto>> {
    const qb = this.sales
      .createQueryBuilder('s')
      .innerJoin(Voucher, 'v', 'v.id = s.voucher_id')
      .where('s.status IS NOT NULL');
    switch (actor.role) {
      case Role.Supplier:
        qb.andWhere('s.supplier_id = :me', { me: actor.id });
        break;
      case Role.Farmer:
        qb.andWhere('v.farmer_id = :me', { me: actor.id });
        break;
      case Role.FieldOfficer:
        qb.innerJoin(User, 'f', 'f.id = v.farmer_id').andWhere(
          'f.field_officer_id = :me',
          {
            me: actor.id,
          },
        );
        break;
    }
    if (q.status) qb.andWhere('s.status = :st', { st: q.status });
    if (q.voucherId) qb.andWhere('s.voucher_id = :vid', { vid: q.voucherId });
    const [rows, total] = await qb
      .orderBy('s.id', 'DESC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.saleDtos(rows), total, q);
  }

  // --- Rules ---

  private async requireSuppliers(ids: string[]): Promise<void> {
    const found = await this.users.find({
      where: { id: In(ids) },
      select: { id: true, role: true, status: true, chainState: true },
    });
    const ok = new Set(
      found
        .filter(
          (u) =>
            u.role === Role.Supplier &&
            u.status === ParticipantStatus.Verified &&
            u.chainState === ChainState.Confirmed,
        )
        .map((u) => u.id),
    );
    const bad = ids.filter((id) => !ok.has(id));
    if (bad.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Every supplier must be a verified supplier',
        code: ErrorCode.SupplierNotVerified,
        details: { supplierIds: bad },
      });
    }
  }

  /** Batches must be the supplier's own, registered, of this input, and not expired. */
  private async requireBatches(
    actor: AuthUser,
    voucher: Voucher,
    ids: string[],
  ): Promise<void> {
    if (ids.length === 0) return;
    const [rows, now] = await Promise.all([
      this.dataSource.getRepository(InputBatch).findBy({ id: In(ids) }),
      this.clock.now(),
    ]);
    const byId = new Map(rows.map((b) => [b.id, b]));
    const problems: Problem[] = [];
    for (const id of ids) {
      const b = byId.get(id);
      const batch = { batch: id };
      if (!b || b.supplierId !== actor.id) {
        problems.push(
          problem(
            ErrorCode.BatchNotYours,
            `${id}: not one of your batches`,
            batch,
          ),
        );
      } else if (b.status !== BatchStatus.Registered) {
        problems.push(
          problem(
            ErrorCode.BatchNotRegistered,
            `${id}: not registered yet`,
            batch,
          ),
        );
      } else if (b.inputTypeCode !== voucher.inputTypeCode) {
        problems.push(
          problem(
            ErrorCode.BatchWrongInput,
            `${id}: a batch of ${b.inputTypeCode}, not ${voucher.inputTypeCode}`,
            {
              ...batch,
              input: b.inputTypeCode,
              expected: voucher.inputTypeCode,
            },
          ),
        );
      } else if (isExpired(b.expiresOn, now)) {
        problems.push(problem(ErrorCode.BatchExpired, `${id}: expired`, batch));
      }
    }
    if (problems.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Some batches cannot be used for this sale',
        code: ErrorCode.InvalidBatches,
        details: { problems },
      });
    }
  }

  /**
   * Who sees which vouchers: staff all; suppliers those they are approved
   * for; farmers their own; field officers their farmers'.
   */
  private scope(actor: AuthUser, qb: SelectQueryBuilder<Voucher>): void {
    if (VOUCHER_STAFF.has(actor.role)) return;
    switch (actor.role) {
      case Role.Supplier:
        qb.andWhere(
          'EXISTS (SELECT 1 FROM voucher_suppliers vs WHERE vs.voucher_id = v.id AND vs.supplier_id = :me)',
          { me: actor.id },
        );
        // A supplier sees nothing until Accounts approved the proposal.
        qb.andWhere("v.status <> 'submitted'");
        return;
      case Role.Farmer:
        qb.andWhere('v.farmer_id = :me', { me: actor.id });
        return;
      case Role.FieldOfficer:
        qb.andWhere(
          'EXISTS (SELECT 1 FROM users f WHERE f.id = v.farmer_id AND f.field_officer_id = :me)',
          { me: actor.id },
        );
        return;
      default:
        qb.andWhere('FALSE');
    }
  }

  private async isFarmersOfficer(
    actor: AuthUser,
    farmerId: string,
  ): Promise<boolean> {
    if (actor.role !== Role.FieldOfficer) return false;
    return this.users.exists({
      where: { id: farmerId, fieldOfficerId: actor.id },
    });
  }

  private async requireStatus(
    id: string,
    allowed: readonly VoucherStatus[],
  ): Promise<Voucher> {
    const voucher = await this.load(id);
    if (!allowed.includes(voucher.status)) {
      throw new ConflictException({
        message: `This voucher is ${voucher.status}`,
        code: ErrorCode.VoucherWrongStatus,
        details: { status: voucher.status },
      });
    }
    return voucher;
  }

  private async load(id: string): Promise<Voucher> {
    const voucher = await this.vouchers.findOneBy({ id });
    if (!voucher)
      throw new NotFoundException({
        message: 'Voucher not found',
        code: ErrorCode.VoucherNotFound,
      });
    return voucher;
  }

  private async pendingSale(id: number): Promise<VoucherSale> {
    const sale = await this.sales.findOneBy({ id });
    if (!sale || sale.status === null)
      throw new NotFoundException({
        message: 'Sale not found',
        code: ErrorCode.SaleNotFound,
      });
    if (sale.status !== SaleStatus.Pending) {
      throw new ConflictException({
        message: `This sale is ${sale.status}`,
        code: ErrorCode.SaleWrongStatus,
        details: { status: sale.status },
      });
    }
    return sale;
  }

  private async removeLocal(id: string): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      await m.delete(VoucherSupplier, { voucherId: id });
      await m.delete(Voucher, { id });
    });
  }

  private registry(): VoucherRegistry {
    return this.contracts.get('VoucherRegistry');
  }

  private async send(
    actor: AuthUser,
    build: (c: VoucherRegistry) => Promise<ContractTransaction>,
  ) {
    const result = await this.tx.send(actor.keyIndex, 'VoucherRegistry', build);
    await this.receipts.apply(result);
    return result;
  }

  // --- Views ---

  /** One query each for titles, suppliers and names, whatever the page size. */
  private async dtos(rows: Voucher[], now: Date): Promise<VoucherDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((v) => v.id);
    const [projects, links] = await Promise.all([
      this.projects.find({
        where: { id: In([...new Set(rows.map((v) => v.projectId))]) },
        select: { id: true, title: true },
      }),
      this.dataSource
        .getRepository(VoucherSupplier)
        .find({ where: { voucherId: In(ids) }, order: { position: 'ASC' } }),
    ]);
    const titles = new Map(projects.map((p) => [p.id, p.title]));
    const names = await this.views.names([
      ...rows.map((v) => v.farmerId),
      ...links.map((l) => l.supplierId),
    ]);
    const suppliers = new Map<string, { id: string; name: string }[]>();
    for (const l of links) {
      const list = suppliers.get(l.voucherId) ?? [];
      list.push({ id: l.supplierId, name: names.get(l.supplierId) ?? '' });
      suppliers.set(l.voucherId, list);
    }
    return rows.map((v) => {
      const available =
        v.status === VoucherStatus.Active
          ? v.quantity - v.spentQuantity - v.heldQuantity
          : 0;
      return {
        id: v.id,
        project: { id: v.projectId, name: titles.get(v.projectId) ?? '' },
        farmer: { id: v.farmerId, name: names.get(v.farmerId) ?? '' },
        input: this.batches.inputRef(v.inputTypeCode),
        quantity: v.quantity,
        unitPrice: poishaToTaka(v.unitPrice),
        value: poishaToTaka(v.value),
        spentQuantity: v.spentQuantity,
        heldQuantity: v.heldQuantity,
        availableQuantity: available,
        availableBalance: poishaToTaka(v.unitPrice * BigInt(available)),
        status: v.status,
        suppliers: suppliers.get(v.id) ?? [],
        proposedAt: v.proposedAt,
        lastActivityAt: v.lastActivityAt,
        inactivityLimitDays: v.inactivityLimitDays,
        inactiveSince: inactiveSince(v, now),
        voidedAmount:
          v.voidedAmount === null ? null : poishaToTaka(v.voidedAmount),
      };
    });
  }

  private async saleOne(id: number): Promise<VoucherSaleDto> {
    return (await this.saleDtos([await this.sales.findOneByOrFail({ id })]))[0];
  }

  private async saleDtos(rows: VoucherSale[]): Promise<VoucherSaleDto[]> {
    if (rows.length === 0) return [];
    const links: Array<{
      sale_id: string;
      batch_id: string;
      lot_number: string;
    }> = await this.dataSource
      .getRepository(VoucherSaleBatch)
      .createQueryBuilder('sb')
      .innerJoin(InputBatch, 'b', 'b.id = sb.batch_id')
      .select([
        'sb.sale_id AS sale_id',
        'sb.batch_id AS batch_id',
        'b.lot_number AS lot_number',
      ])
      .where('sb.sale_id IN (:...ids)', { ids: rows.map((s) => s.id) })
      .orderBy('sb.position', 'ASC')
      .getRawMany();
    const batches = new Map<number, { id: string; lotNumber: string }[]>();
    for (const l of links) {
      const key = Number(l.sale_id);
      const list = batches.get(key) ?? [];
      list.push({ id: l.batch_id, lotNumber: l.lot_number });
      batches.set(key, list);
    }
    const names = await this.views.names(rows.map((s) => s.supplierId));
    return rows.map((s) => ({
      id: s.id,
      voucherId: s.voucherId,
      supplier: { id: s.supplierId, name: names.get(s.supplierId) ?? '' },
      quantity: s.quantity,
      amount: poishaToTaka(s.amount),
      status: s.status!,
      recordedAt: s.recordedAt,
      expiresAt: s.expiresAt,
      closedAt: s.closedAt,
      batches: batches.get(s.id) ?? [],
    }));
  }
}

/** When an active voucher passed its inactivity limit, by the chain's clock; null if not. */
export function inactiveSince(
  v: Pick<Voucher, 'status' | 'inactivityLimitDays' | 'lastActivityAt'>,
  now: Date,
): Date | null {
  if (
    v.status !== VoucherStatus.Active ||
    !v.inactivityLimitDays ||
    !v.lastActivityAt
  ) {
    return null;
  }
  const deadline = new Date(
    v.lastActivityAt.getTime() + v.inactivityLimitDays * DAY_MS,
  );
  return deadline <= now ? deadline : null;
}
