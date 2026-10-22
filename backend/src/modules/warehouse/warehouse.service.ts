import { randomBytes, randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { ContractTransaction } from 'ethers';
import {
  Brackets,
  In,
  IsNull,
  Not,
  Repository,
  type SelectQueryBuilder,
} from 'typeorm';
import { ChainClock } from '../../blockchain/chain-clock';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import type { WarehouseReceipt as ReceiptContract } from '../../blockchain/generated';
import { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import { TransactionService } from '../../blockchain/tx/transaction.service';
import { fingerprint } from '../../blockchain/utils/fingerprint';
import {
  codeToBytes32,
  uuidToBytes32,
  ZERO_BYTES32,
} from '../../blockchain/utils/ids';
import { Paginated } from '../../common/dto/pagination.dto';
import {
  matchesWord,
  searchWords,
  wordPattern,
} from '../../common/search/words';
import {
  BD_DISTRICTS,
  isDistrictCode,
} from '../../common/reference/bd-districts';
import { bdDate, bdDayEnd, isPastDay } from '../../common/time/bd-dates';
import type { EnvironmentVariables } from '../../config/env.validation';
import type { AuthUser } from '../auth/auth-user';
import { CatalogService } from '../catalog/catalog.service';
import { ProduceCategory } from '../catalog/catalog.enums';
import { normaliseDecimal } from '../field-records/record-values';
import { Project } from '../projects/entities/project.entity';
import { ProjectStage } from '../projects/project.enums';
import { ProjectViews } from '../projects/project-views';
import { ChainState, User } from '../users/entities/user.entity';
import { PersonSearch } from '../users/person-search';
import { actsAs, ParticipantStatus, Role } from '../users/roles';
import type {
  CreateSiteDto,
  IssueReceiptDto,
  ListReceiptsQueryDto,
  ListSitesQueryDto,
  RecheckDto,
  ReceiptDetailDto,
  ReceiptDto,
  ReceiptVerificationDto,
  SiteDto,
  UpdateSiteDto,
} from './dto/warehouse.dto';
import { ReceiptRecheck } from './entities/receipt-recheck.entity';
import { WarehouseOperator } from './entities/warehouse-operator.entity';
import { WarehouseReceipt } from './entities/warehouse-receipt.entity';
import { WarehouseSite } from './entities/warehouse-site.entity';
import { RECEIPT_ID, ReceiptStatus, WEGRO_OWNER } from './warehouse.enums';
import { ErrorCode } from '../../common/errors/error-code';
import { type Problem, problem } from '../../common/errors/problem';

const STAFF: ReadonlySet<Role> = new Set([
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPERATIONS,
  Role.ACCOUNTS,
  Role.AUDITOR,
]);

/** Intake or re-check values as stored and fingerprinted. */
interface IntakeValues {
  bagCount: number | null;
  moisturePercent: string | null;
  storageBay: string | null;
  notes: string | null;
}

/**
 * Warehouse sites, their operators, and receipts (WarehouseReceipt). The
 * ledger's rules are checked here first for precise errors, then again by the
 * contract, which is the final word.
 */
@Injectable()
export class WarehouseService {
  private readonly appUrl: string;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    @InjectRepository(WarehouseSite)
    private readonly sites: Repository<WarehouseSite>,
    @InjectRepository(WarehouseOperator)
    private readonly operators: Repository<WarehouseOperator>,
    @InjectRepository(WarehouseReceipt)
    private readonly receipts: Repository<WarehouseReceipt>,
    @InjectRepository(ReceiptRecheck)
    private readonly rechecks: Repository<ReceiptRecheck>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly catalog: CatalogService,
    private readonly views: ProjectViews,
    private readonly tx: TransactionService,
    private readonly applier: ReceiptApplier,
    private readonly contracts: ContractsRegistry,
    private readonly clock: ChainClock,
    private readonly search: PersonSearch,
  ) {
    this.appUrl = config
      .get('PUBLIC_APP_URL', { infer: true })
      .replace(/\/+$/, '');
  }

  verifyUrl(receiptId: string): string {
    return `${this.appUrl}/verify/receipt/${receiptId}`;
  }

  // --- Sites ---

  async createSite(actor: AuthUser, dto: CreateSiteDto): Promise<SiteDto> {
    const site = this.sites.create({
      id: randomUUID(),
      name: dto.name,
      districtCode: dto.districtCode,
      address: dto.address,
      storageType: dto.storageType,
      capacityKg: dto.capacityKg ?? null,
      status: 'submitted',
      createdById: actor.id,
    });
    site.detailsHash = siteFingerprint(site);
    try {
      await this.sites.insert(site);
    } catch (error) {
      throw nameTaken(error) ?? error;
    }
    try {
      await this.send(actor, (c) =>
        c.registerSite.populateTransaction(
          uuidToBytes32(site.id),
          site.detailsHash,
        ),
      );
    } catch (error) {
      if (error instanceof ContractRevertException)
        await this.sites.delete({ id: site.id });
      throw error;
    }
    return this.site(actor, site.id);
  }

  /**
   * Sites by name; an operator sees only their own. Searched by words of
   * the name, the address or the district (every word must match one).
   */
  async listSites(
    actor: AuthUser,
    q: ListSitesQueryDto = {},
  ): Promise<SiteDto[]> {
    const qb = this.sites.createQueryBuilder('s');
    if (actor.role === Role.WAREHOUSE) {
      qb.where('s.id = :mine', {
        mine: (await this.siteOf(actor.id)) ?? ZERO_UUID,
      });
    }
    if (q.state)
      qb.andWhere('s.closed = :closed', { closed: q.state === 'closed' });
    searchWords(q.q).forEach((w, i) => {
      const districts = Object.entries(BD_DISTRICTS)
        .filter(([, d]) => matchesWord(d.name, w))
        .map(([code]) => code);
      qb.andWhere(
        new Brackets((b) => {
          b.where(`s.name ~* :sw${i}`, { [`sw${i}`]: wordPattern(w) }).orWhere(
            `s.address ~* :sw${i}`,
          );
          if (districts.length > 0) {
            b.orWhere(`s.district_code IN (:...sd${i})`, {
              [`sd${i}`]: districts,
            });
          }
        }),
      );
    });
    const rows = await qb.orderBy('s.name', 'ASC').getMany();
    return this.siteDtos(rows);
  }

  /**
   * New details for a site: kept here and their fingerprint sent to the
   * ledger; if the ledger refuses, the old details are put back.
   */
  async updateSite(
    actor: AuthUser,
    id: string,
    dto: UpdateSiteDto,
  ): Promise<SiteDto> {
    const site = await this.registeredSite(id);
    const next: WarehouseSite = Object.assign(this.sites.create(), site, {
      name: dto.name ?? site.name,
      districtCode: dto.districtCode ?? site.districtCode,
      address: dto.address ?? site.address,
      storageType: dto.storageType ?? site.storageType,
      capacityKg:
        dto.capacityKg === undefined ? site.capacityKg : dto.capacityKg,
    });
    next.detailsHash = siteFingerprint(next);
    if (next.detailsHash === site.detailsHash) return this.site(actor, id);
    const fields = (s: WarehouseSite) => ({
      name: s.name,
      districtCode: s.districtCode,
      address: s.address,
      storageType: s.storageType,
      capacityKg: s.capacityKg,
      detailsHash: s.detailsHash,
    });
    try {
      await this.sites.update({ id }, fields(next));
    } catch (error) {
      throw nameTaken(error) ?? error;
    }
    try {
      await this.send(actor, (c) =>
        c.updateSite.populateTransaction(uuidToBytes32(id), next.detailsHash),
      );
    } catch (error) {
      if (error instanceof ContractRevertException) {
        await this.sites.update({ id }, fields(site));
      }
      throw error;
    }
    return this.site(actor, id);
  }

  /**
   * Closes a site to new goods and operators, or opens it again. What it
   * holds stays valid and is still re-checked and released there.
   */
  async setClosed(
    actor: AuthUser,
    id: string,
    closed: boolean,
  ): Promise<SiteDto> {
    const site = await this.registeredSite(id);
    if (site.closed !== closed) {
      await this.send(actor, (c) =>
        c.setSiteClosed.populateTransaction(uuidToBytes32(id), closed),
      );
    }
    return this.site(actor, id);
  }

  async site(actor: AuthUser, id: string): Promise<SiteDto> {
    const site = await this.sites.findOneBy({ id });
    if (
      !site ||
      (actor.role === Role.WAREHOUSE && (await this.siteOf(actor.id)) !== id)
    ) {
      throw new NotFoundException({
        message: 'Site not found',
        code: ErrorCode.SITE_NOT_FOUND,
      });
    }
    return (await this.siteDtos([site]))[0];
  }

  /** Assigns a verified warehouse operator to a site (null removes them from any site). */
  async assignOperator(
    actor: AuthUser,
    operatorId: string,
    siteId: string | null,
  ): Promise<SiteDto | null> {
    const operator = await this.users.findOneBy({ id: operatorId });
    if (
      !operator ||
      operator.role !== Role.WAREHOUSE ||
      operator.status !== ParticipantStatus.VERIFIED ||
      operator.chainState !== ChainState.CONFIRMED
    ) {
      throw new UnprocessableEntityException({
        message: 'Only a verified warehouse operator can be assigned',
        code: ErrorCode.WAREHOUSE_OPERATOR_INVALID,
      });
    }
    if (siteId) {
      const site = await this.sites.findOneBy({ id: siteId });
      if (!site || site.status !== 'registered')
        throw new NotFoundException({
          message: 'Site not found',
          code: ErrorCode.SITE_NOT_FOUND,
        });
      if (site.closed) throw siteClosed();
    }
    await this.send(actor, (c) =>
      c.assignOperator.populateTransaction(
        uuidToBytes32(operatorId),
        siteId ? uuidToBytes32(siteId) : ZERO_BYTES32,
      ),
    );
    return siteId ? this.site(actor, siteId) : null;
  }

  // --- Receipts ---

  /** An operator records intake at their own site and issues the receipt to the farmer. */
  async issue(
    actor: AuthUser,
    dto: IssueReceiptDto,
  ): Promise<ReceiptDetailDto> {
    const siteId = await this.siteOf(actor.id);
    if (!siteId) {
      throw new UnprocessableEntityException({
        message: 'You are not assigned to a warehouse site',
        code: ErrorCode.NOT_SITE_OPERATOR,
      });
    }
    if ((await this.sites.findOneBy({ id: siteId }))?.closed) {
      throw siteClosed();
    }
    const project = await this.projects.findOneBy({ id: dto.projectId });
    if (!project)
      throw new NotFoundException({
        message: 'Project not found',
        code: ErrorCode.PROJECT_NOT_FOUND,
      });
    if (project.stage !== ProjectStage.ACTIVE) {
      throw new UnprocessableEntityException({
        message: 'Receipts are issued only for active projects',
        code: ErrorCode.PROJECT_NOT_ACTIVE,
      });
    }
    if (project.category === (ProduceCategory.PERISHABLE as string)) {
      throw new UnprocessableEntityException({
        message: 'Fresh produce is sold directly, not stored',
        code: ErrorCode.NOT_STORABLE,
      });
    }

    const today = bdDate(await this.clock.now());
    const problems: Problem[] = [];
    if (dto.intakeDate > today) {
      problems.push(
        problem(
          ErrorCode.INTAKE_IN_FUTURE,
          'intakeDate cannot be in the future',
        ),
      );
    }
    if (dto.expiresOn < today) {
      problems.push(
        problem(ErrorCode.EXPIRY_IN_PAST, 'expiresOn cannot be in the past'),
      );
    }
    if (dto.expiresOn < dto.intakeDate) {
      problems.push(
        problem(
          ErrorCode.EXPIRES_BEFORE_INTAKE,
          'expiresOn cannot be before intakeDate',
        ),
      );
    }
    const intake = this.intake(dto, problems);
    if (problems.length > 0) throw invalid(problems);

    const receipt = this.receipts.create({
      id: `0x${randomBytes(32).toString('hex')}`,
      projectId: project.id,
      siteId,
      ownerId: project.farmerId,
      ownerIsWegro: false,
      produceCode: project.produceCode,
      quantity: dto.quantity,
      originalQuantity: dto.quantity,
      status: ReceiptStatus.SUBMITTED,
      ...intake,
      intakeDate: dto.intakeDate,
      expiresOn: dto.expiresOn,
      issuedById: actor.id,
    });
    receipt.detailsHash = intakeFingerprint(receipt);
    await this.receipts.insert(receipt);

    try {
      await this.send(actor, (c) =>
        c.issueReceipt.populateTransaction(
          receipt.id,
          uuidToBytes32(project.id),
          codeToBytes32(project.produceCode),
          dto.quantity,
          bdDayEnd(dto.expiresOn),
          receipt.detailsHash,
        ),
      );
    } catch (error) {
      if (error instanceof ContractRevertException)
        await this.receipts.delete({ id: receipt.id });
      throw error;
    }
    return this.findOne(actor, receipt.id);
  }

  /** The issuing site extends the storage term after a quality re-check. */
  async extend(
    actor: AuthUser,
    id: string,
    dto: RecheckDto,
  ): Promise<ReceiptDetailDto> {
    const receipt = await this.siteReceipt(actor, id);
    if (
      [
        ReceiptStatus.SUBMITTED,
        ReceiptStatus.COLLECTED,
        ReceiptStatus.SOLD_OUT,
      ].includes(receipt.status)
    ) {
      throw new ConflictException({
        message: `This receipt is ${receipt.status}`,
        code: ErrorCode.RECEIPT_WRONG_STATUS,
        details: { status: receipt.status },
      });
    }
    const today = bdDate(await this.clock.now());
    const problems: Problem[] = [];
    if (dto.checkedOn > today) {
      problems.push(
        problem(ErrorCode.CHECK_IN_FUTURE, 'checkedOn cannot be in the future'),
      );
    }
    if (dto.newExpiresOn <= receipt.expiresOn) {
      problems.push(
        problem(
          ErrorCode.NEW_EXPIRY_NOT_LATER,
          'newExpiresOn must be later than the current expiry',
          { current: receipt.expiresOn },
        ),
      );
    }
    if (dto.newExpiresOn < today) {
      problems.push(
        problem(ErrorCode.EXPIRY_IN_PAST, 'newExpiresOn cannot be in the past'),
      );
    }
    const values = this.intake(dto, problems);
    if (problems.length > 0) throw invalid(problems);

    const recheck = this.rechecks.create({
      receiptId: id,
      checkedOn: dto.checkedOn,
      newExpiresOn: dto.newExpiresOn,
      ...values,
      status: 'submitted',
      checkedById: actor.id,
    });
    recheck.recheckHash = recheckFingerprint(recheck);
    await this.rechecks.insert(recheck);
    try {
      await this.send(actor, (c) =>
        c.extendExpiry.populateTransaction(
          id,
          bdDayEnd(dto.newExpiresOn),
          recheck.recheckHash,
        ),
      );
    } catch (error) {
      if (error instanceof ContractRevertException)
        await this.rechecks.delete({ id: recheck.id });
      throw error;
    }
    return this.findOne(actor, id);
  }

  /** Unsold goods left the warehouse. Final. */
  async collect(actor: AuthUser, id: string): Promise<ReceiptDetailDto> {
    const receipt = await this.siteReceipt(actor, id);
    if (receipt.status !== ReceiptStatus.ISSUED) {
      throw new ConflictException({
        message: `Only an issued receipt can be collected; this one is ${receipt.status}`,
        code: ErrorCode.RECEIPT_NOT_ISSUED,
        details: { status: receipt.status },
      });
    }
    await this.send(actor, (c) => c.markCollected.populateTransaction(id));
    return this.findOne(actor, id);
  }

  /** Buy-back: the farmer's field officer offers the farmer's receipt to WeGro. */
  async offerHandover(actor: AuthUser, id: string): Promise<ReceiptDetailDto> {
    const receipt = await this.load(id);
    if (
      receipt.ownerIsWegro ||
      !receipt.ownerId ||
      !(await this.isOfficerOf(actor, receipt.ownerId))
    ) {
      throw new ForbiddenException({
        message:
          "Only the farmer's own field officer can offer the farmer's receipt",
        code: ErrorCode.NOT_FARMERS_OFFICER,
      });
    }
    if (receipt.status !== ReceiptStatus.ISSUED) {
      throw new ConflictException({
        message: `Only an issued receipt can be handed over; this one is ${receipt.status}`,
        code: ErrorCode.RECEIPT_NOT_ISSUED,
        details: { status: receipt.status },
      });
    }
    if (isPastDay(receipt.expiresOn, await this.clock.now())) {
      throw new ConflictException({
        message:
          'This receipt has expired; the site must re-check and extend it first',
        code: ErrorCode.RECEIPT_EXPIRED,
      });
    }
    await this.send(actor, (c) =>
      c.offerHandover.populateTransaction(id, WEGRO_OWNER),
    );
    return this.findOne(actor, id);
  }

  async acceptHandover(actor: AuthUser, id: string): Promise<ReceiptDetailDto> {
    await this.pendingHandover(id);
    await this.send(actor, (c) => c.acceptHandover.populateTransaction(id));
    return this.findOne(actor, id);
  }

  /** Withdrawn by the farmer's officer, or declined by an admin. */
  async cancelHandover(actor: AuthUser, id: string): Promise<ReceiptDetailDto> {
    const receipt = await this.pendingHandover(id);
    if (
      !actsAs(actor.role, Role.ADMIN) &&
      !(receipt.ownerId && (await this.isOfficerOf(actor, receipt.ownerId)))
    ) {
      throw new ForbiddenException({
        message: 'You cannot cancel this handover',
        code: ErrorCode.HANDOVER_CANCEL_NOT_ALLOWED,
      });
    }
    await this.send(actor, (c) => c.cancelHandover.populateTransaction(id));
    return this.findOne(actor, id);
  }

  async list(
    actor: AuthUser,
    q: ListReceiptsQueryDto,
  ): Promise<Paginated<ReceiptDto>> {
    const qb = this.receipts
      .createQueryBuilder('r')
      .where("r.status <> 'submitted'");
    await this.scope(actor, qb);
    if (q.projectId) qb.andWhere('r.project_id = :pid', { pid: q.projectId });
    if (q.siteId) qb.andWhere('r.site_id = :sid', { sid: q.siteId });
    if (q.status) qb.andWhere('r.status = :st', { st: q.status });
    if (q.expiresBy) {
      qb.andWhere('r.status IN (:...held)', { held: HELD }).andWhere(
        'r.expires_on <= :by',
        { by: q.expiresBy },
      );
    }
    this.searchReceipts(qb, q.q);
    const [rows, total] = await qb
      .orderBy(
        q.expiresBy ? 'r.expires_on' : 'r.created_at',
        q.expiresBy ? 'ASC' : 'DESC',
      )
      .addOrderBy('r.id', 'ASC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.dtos(rows), total, q);
  }

  async findOne(actor: AuthUser, id: string): Promise<ReceiptDetailDto> {
    const qb = this.receipts
      .createQueryBuilder('r')
      .where('r.id = :id', { id });
    await this.scope(actor, qb);
    const receipt = await qb.getOne();
    if (!receipt)
      throw new NotFoundException({
        message: 'Receipt not found',
        code: ErrorCode.RECEIPT_NOT_FOUND,
      });
    const [[dto], rechecks, children] = await Promise.all([
      this.dtos([receipt]),
      this.rechecks.find({
        where: { receiptId: id },
        order: { createdAt: 'ASC' },
      }),
      this.receipts.find({
        where: { parentId: id },
        select: { id: true },
        order: { createdAt: 'ASC' },
      }),
    ]);
    return Object.assign(dto, {
      rechecks: rechecks.map((c) => ({
        checkedOn: c.checkedOn,
        newExpiresOn: c.newExpiresOn,
        bagCount: c.bagCount,
        moisturePercent: c.moisturePercent,
        storageBay: c.storageBay,
        notes: c.notes,
        status: c.status,
      })),
      children: children.map((c) => c.id),
    });
  }

  /**
   * Public check behind the receipt QR. Genuine = on the ledger, and the
   * intake record here still produces the fingerprint registered there
   * (a sold part carries its parent's). Never reveals the owner.
   */
  async verify(id: string): Promise<ReceiptVerificationDto> {
    const none: ReceiptVerificationDto = {
      genuine: false,
      produce: null,
      quantity: null,
      site: null,
      status: null,
      expiresOn: null,
      expired: false,
      issuedAt: null,
      partOfLargerReceipt: false,
    };
    if (!RECEIPT_ID.test(id)) return none;
    const [row, onChain, now] = await Promise.all([
      this.receipts.findOneBy({ id }),
      this.registry().getReceipt(id),
      this.clock.now(),
    ]);
    if (!row || onChain.status === 0n) return none;
    const root = row.parentId
      ? await this.receipts.findOneBy({ id: row.parentId })
      : row;
    if (!root || intakeFingerprint(root) !== onChain.detailsHash) return none;

    const site = await this.sites.findOneBy({ id: row.siteId });
    const produce = this.catalog.produceTypes.get(row.produceCode);
    const unit = produce ? this.catalog.units.get(produce.unitCode) : undefined;
    return {
      genuine: true,
      produce: {
        code: row.produceCode,
        name: produce?.name ?? row.produceCode,
        nameBn: produce?.nameBn ?? row.produceCode,
        unit: unit?.symbol ?? '',
      },
      quantity: Number(onChain.quantity),
      site: site
        ? { name: site.name, district: districtName(site.districtCode) }
        : null,
      status: row.status,
      expiresOn: row.expiresOn,
      expired: isPastDay(row.expiresOn, now),
      issuedAt: row.issuedAt,
      partOfLargerReceipt: row.parentId !== null,
    };
  }

  // --- Helpers ---

  /** Bags, moisture (one decimal place, 0-100), bay and notes in canonical form. */
  private intake(
    dto: {
      bagCount?: number | null;
      moisturePercent?: unknown;
      storageBay?: string | null;
      notes?: string | null;
    },
    problems: Problem[],
  ): IntakeValues {
    let moisture: string | null = null;
    if (
      dto.moisturePercent !== undefined &&
      dto.moisturePercent !== null &&
      dto.moisturePercent !== ''
    ) {
      const m = normaliseDecimal(dto.moisturePercent, 1, 0, 100, {
        key: 'moisturePercent',
        label: 'Moisture',
        labelBn: 'আর্দ্রতা',
      });
      if (typeof m === 'string') moisture = m;
      else problems.push(m.problem);
    }
    return {
      bagCount: dto.bagCount ?? null,
      moisturePercent: moisture,
      storageBay: dto.storageBay ?? null,
      notes: dto.notes ?? null,
    };
  }

  private async registeredSite(id: string): Promise<WarehouseSite> {
    const site = await this.sites.findOneBy({ id });
    if (!site || site.status !== 'registered') {
      throw new NotFoundException({
        message: 'Site not found',
        code: ErrorCode.SITE_NOT_FOUND,
      });
    }
    return site;
  }

  /**
   * The receipt number (its first characters are enough, as printed), or
   * words of the project title, or the farmer found as a person.
   */
  private searchReceipts(
    qb: SelectQueryBuilder<WarehouseReceipt>,
    q: string | undefined,
  ): void {
    const text = (q ?? '').trim();
    if (!text) return;
    const number = receiptNumberRange(text);
    const words = searchWords(text);
    const farmer = this.search.condition('p.farmer_id', text, 'Farmer');
    qb.andWhere(
      new Brackets((b) => {
        b.where('1 = 0');
        if (number) {
          b.orWhere('(r.id >= :idFrom AND r.id < :idTo)', number);
        }
        if (words.length > 0) {
          b.orWhere(
            `r.project_id IN (SELECT p.id FROM projects p WHERE ${words
              .map((_, i) => `p.title ~* :rw${i}`)
              .join(' AND ')})`,
            Object.fromEntries(words.map((w, i) => [`rw${i}`, wordPattern(w)])),
          );
        }
        if (farmer) {
          b.orWhere(
            `r.project_id IN (SELECT p.id FROM projects p WHERE ${farmer.sql})`,
            farmer.params,
          );
        }
      }),
    );
  }

  private async siteOf(operatorId: string): Promise<string | null> {
    const row = await this.operators.findOne({
      where: { operatorId, siteId: Not(IsNull()) },
      select: { operatorId: true, siteId: true },
    });
    return row?.siteId ?? null;
  }

  /** The receipt, if the actor operates the site that issued it. */
  private async siteReceipt(
    actor: AuthUser,
    id: string,
  ): Promise<WarehouseReceipt> {
    const receipt = await this.load(id);
    if ((await this.siteOf(actor.id)) !== receipt.siteId) {
      throw new ForbiddenException({
        message: 'Only an operator of the issuing site can do this',
        code: ErrorCode.NOT_ISSUING_SITE_OPERATOR,
      });
    }
    return receipt;
  }

  private async pendingHandover(id: string): Promise<WarehouseReceipt> {
    const receipt = await this.load(id);
    if (receipt.status !== ReceiptStatus.PENDING_HANDOVER) {
      throw new ConflictException({
        message: 'No handover is waiting on this receipt',
        code: ErrorCode.NO_HANDOVER_WAITING,
      });
    }
    return receipt;
  }

  private async load(id: string): Promise<WarehouseReceipt> {
    const receipt = RECEIPT_ID.test(id)
      ? await this.receipts.findOneBy({ id })
      : null;
    if (!receipt || receipt.status === ReceiptStatus.SUBMITTED) {
      throw new NotFoundException({
        message: 'Receipt not found',
        code: ErrorCode.RECEIPT_NOT_FOUND,
      });
    }
    return receipt;
  }

  private async isOfficerOf(
    actor: AuthUser,
    farmerId: string,
  ): Promise<boolean> {
    if (actor.role !== Role.FIELD_OFFICER) return false;
    return this.users.exists({
      where: { id: farmerId, fieldOfficerId: actor.id },
    });
  }

  /**
   * Staff see every receipt; operators their site's; farmers those of their
   * projects; field officers their farmers'; buyers the ones they own.
   */
  private async scope(
    actor: AuthUser,
    qb: SelectQueryBuilder<WarehouseReceipt>,
  ): Promise<void> {
    if (STAFF.has(actor.role)) return;
    switch (actor.role) {
      case Role.WAREHOUSE:
        qb.andWhere('r.site_id = :site', {
          site: (await this.siteOf(actor.id)) ?? ZERO_UUID,
        });
        return;
      case Role.FARMER:
        qb.andWhere(
          'EXISTS (SELECT 1 FROM projects p WHERE p.id = r.project_id AND p.farmer_id = :me)',
          {
            me: actor.id,
          },
        );
        return;
      case Role.FIELD_OFFICER:
        qb.andWhere(
          `EXISTS (SELECT 1 FROM projects p JOIN users f ON f.id = p.farmer_id
                    WHERE p.id = r.project_id AND f.field_officer_id = :me)`,
          { me: actor.id },
        );
        return;
      case Role.BUYER:
        qb.andWhere('r.owner_id = :me', { me: actor.id });
        return;
      default:
        qb.andWhere('FALSE');
    }
  }

  private registry(): ReceiptContract {
    return this.contracts.get('WarehouseReceipt');
  }

  private async send(
    actor: AuthUser,
    build: (c: ReceiptContract) => Promise<ContractTransaction>,
  ) {
    const result = await this.tx.send(
      actor.keyIndex,
      'WarehouseReceipt',
      build,
    );
    await this.applier.apply(result);
    return result;
  }

  private async siteDtos(rows: WarehouseSite[]): Promise<SiteDto[]> {
    if (rows.length === 0) return [];
    const ops = await this.operators.find({
      where: { siteId: In(rows.map((s) => s.id)) },
    });
    const names = await this.views.names(ops.map((o) => o.operatorId));
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      districtCode: s.districtCode,
      districtName: districtName(s.districtCode),
      address: s.address,
      storageType: s.storageType,
      capacityKg: s.capacityKg,
      status: s.status,
      closed: s.closed,
      closedAt: s.closedAt,
      operators: ops
        .filter((o) => o.siteId === s.id)
        .map((o) => ({
          id: o.operatorId,
          name: names.get(o.operatorId) ?? '',
        })),
    }));
  }

  /** One query each for projects, sites and names, whatever the page size. */
  private async dtos(rows: WarehouseReceipt[]): Promise<ReceiptDto[]> {
    if (rows.length === 0) return [];
    const [projects, sites, now] = await Promise.all([
      this.projects.find({
        where: { id: In([...new Set(rows.map((r) => r.projectId))]) },
        select: { id: true, title: true, farmerId: true },
      }),
      this.sites.find({
        where: { id: In([...new Set(rows.map((r) => r.siteId))]) },
        select: { id: true, name: true },
      }),
      this.clock.now(),
    ]);
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const siteName = new Map(sites.map((s) => [s.id, s.name]));
    const names = await this.views.names(
      rows.flatMap((r) => (r.ownerId ? [r.ownerId] : [])),
    );
    return rows.map((r) => {
      const project = projectById.get(r.projectId);
      const produce = this.catalog.produceTypes.get(r.produceCode);
      const unit = produce
        ? this.catalog.units.get(produce.unitCode)
        : undefined;
      return {
        id: r.id,
        project: { id: r.projectId, name: project?.title ?? '' },
        site: { id: r.siteId, name: siteName.get(r.siteId) ?? '' },
        owner: r.ownerIsWegro
          ? { kind: 'wegro' as const, id: null, name: 'WeGro' }
          : {
              kind:
                r.ownerId === project?.farmerId
                  ? ('farmer' as const)
                  : ('buyer' as const),
              id: r.ownerId,
              name: names.get(r.ownerId!) ?? '',
            },
        produce: {
          code: r.produceCode,
          name: produce?.name ?? r.produceCode,
          unit: unit?.symbol ?? '',
        },
        quantity: r.quantity,
        originalQuantity: r.originalQuantity,
        status: r.status,
        pendingHandover: r.pendingToWegro,
        parentId: r.parentId,
        intake: {
          bagCount: r.bagCount,
          moisturePercent: r.moisturePercent,
          storageBay: r.storageBay,
          intakeDate: r.intakeDate,
          notes: r.notes,
        },
        expiresOn: r.expiresOn,
        expired: isPastDay(r.expiresOn, now),
        issuedAt: r.issuedAt,
        collectedAt: r.collectedAt,
        detailsHash: r.detailsHash,
        verifyUrl: this.verifyUrl(r.id),
      };
    });
  }
}

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

function districtName(code: string): string {
  return isDistrictCode(code) ? BD_DISTRICTS[code].name : code;
}

function invalid(problems: Problem[]) {
  return new UnprocessableEntityException({
    message: 'Some details are not valid',
    code: ErrorCode.INVALID_DETAILS,
    details: { problems },
  });
}

export function siteFingerprint(
  s: Pick<
    WarehouseSite,
    'id' | 'name' | 'districtCode' | 'address' | 'storageType' | 'capacityKg'
  >,
): string {
  return fingerprint('warehouse.site', {
    v: 1,
    siteId: s.id,
    name: s.name,
    districtCode: s.districtCode,
    address: s.address,
    storageType: s.storageType,
    capacityKg: s.capacityKg,
  });
}

/** The receipt's detailsHash: the intake record, bound to receipt, project and site. */
export function intakeFingerprint(
  r: Pick<
    WarehouseReceipt,
    | 'id'
    | 'projectId'
    | 'siteId'
    | 'produceCode'
    | 'originalQuantity'
    | 'bagCount'
    | 'moisturePercent'
    | 'storageBay'
    | 'intakeDate'
    | 'notes'
  >,
): string {
  return fingerprint('warehouse.intake', {
    v: 1,
    receiptId: r.id,
    projectId: r.projectId,
    siteId: r.siteId,
    produceCode: r.produceCode,
    quantity: r.originalQuantity,
    bagCount: r.bagCount,
    moisturePercent: r.moisturePercent,
    storageBay: r.storageBay,
    intakeDate: r.intakeDate,
    notes: r.notes,
  });
}

export function recheckFingerprint(
  c: Pick<
    ReceiptRecheck,
    | 'receiptId'
    | 'checkedOn'
    | 'newExpiresOn'
    | 'bagCount'
    | 'moisturePercent'
    | 'storageBay'
    | 'notes'
  >,
): string {
  return fingerprint('warehouse.recheck', {
    v: 1,
    receiptId: c.receiptId,
    checkedOn: c.checkedOn,
    newExpiresOn: c.newExpiresOn,
    bagCount: c.bagCount,
    moisturePercent: c.moisturePercent,
    storageBay: c.storageBay,
    notes: c.notes,
  });
}

/** Receipts that still hold goods at the site (a re-check can be due). */
const HELD = [
  ReceiptStatus.ISSUED,
  ReceiptStatus.PENDING_HANDOVER,
  ReceiptStatus.LISTED,
  ReceiptStatus.SOLD,
];

/**
 * The ids a typed receipt number stands for: "WR-3F9A2C1B", "0x3f9a2c1b"
 * or the bare hex, as a range on the primary key (its first 6 to 64 hex
 * characters). Null when the text is not a number.
 */
export function receiptNumberRange(
  text: string,
): { idFrom: string; idTo: string } | null {
  const hex = text.trim().toLowerCase().replace(/^wr-?/, '').replace(/^0x/, '');
  if (!/^[0-9a-f]{6,64}$/.test(hex)) return null;
  const from = `0x${hex}`;
  // Just past every id starting with these characters ("g" follows every hex digit).
  return { idFrom: from, idTo: `${from}g` };
}

function siteClosed(): ConflictException {
  return new ConflictException({
    message: 'This site is closed: it takes no new goods or operators',
    code: ErrorCode.SITE_CLOSED,
  });
}

/** A unique-name clash, as the error the client reads; null for anything else. */
function nameTaken(error: unknown): ConflictException | null {
  return (error as { driverError?: { code?: string } }).driverError?.code ===
    '23505'
    ? new ConflictException({
        message: 'A site with this name already exists',
        code: ErrorCode.SITE_NAME_EXISTS,
      })
    : null;
}
