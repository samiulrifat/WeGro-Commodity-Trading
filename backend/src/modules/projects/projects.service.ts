import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ContractTransaction } from 'ethers';
import { DataSource, Repository } from 'typeorm';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import type { ProjectLedger } from '../../blockchain/generated';
import {
  type TxResult,
  TransactionService,
} from '../../blockchain/tx/transaction.service';
import {
  bytes32ToCode,
  bytes32ToUuid,
  codeToBytes32,
  uuidToBytes32,
} from '../../blockchain/utils/ids';
import { takaToPoisha } from '../../blockchain/utils/money';
import { Paginated } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../auth/auth-user';
import {
  CHAIN_PRODUCE_CATEGORY,
  ProduceCategory,
} from '../catalog/catalog.enums';
import { CatalogService } from '../catalog/catalog.service';
import { ChainState, User } from '../users/entities/user.entity';
import { ParticipantStatus, Role } from '../users/roles';
import type {
  CreateProjectDto,
  ListProjectsQueryDto,
  UpdateProjectDto,
} from './dto/project-request.dto';
import type {
  ProjectDto,
  ProjectIntegrityDto,
  TimelineEntryDto,
} from './dto/project-response.dto';
import { Project } from './entities/project.entity';
import {
  CHAIN_DURATION_TYPE,
  ProjectChainState,
  ProjectStage,
  STAGE_BY_CHAIN,
} from './project.enums';
import {
  checkTerms,
  DEFAULT_SPLIT,
  type ProjectTerms,
  termsHash,
  totalSlots,
} from './project-terms';
import { ProjectViews } from './project-views';
import { ErrorCode } from '../../common/errors/error-code';
import { problem } from '../../common/errors/problem';

/** Staff see every project, drafts included. */
export const PROJECT_STAFF: ReadonlySet<Role> = new Set([
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPERATIONS,
  Role.ACCOUNTS,
  Role.AUDITOR,
  Role.FIELD_OFFICER,
]);

type StageAction = 'activate' | 'markReadyForSale' | 'close' | 'cancelProject';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly catalog: CatalogService,
    private readonly views: ProjectViews,
    private readonly tx: TransactionService,
    private readonly contracts: ContractsRegistry,
    private readonly receipts: ReceiptApplier,
  ) {}

  // --- Drafts ---

  async create(actor: AuthUser, dto: CreateProjectDto): Promise<ProjectDto> {
    const terms = await this.checkedTerms({
      title: dto.title,
      description: dto.description ?? null,
      produceCode: dto.produceCode,
      category: '',
      districtCode: dto.districtCode,
      location: dto.location,
      farmerId: dto.farmerId,
      durationType: dto.durationType,
      durationMonths: dto.durationMonths,
      payoutIntervalMonths: dto.payoutIntervalMonths ?? 0,
      fundingTarget: takaToPoisha(dto.fundingTarget),
      slotPrice: takaToPoisha(dto.slotPrice),
      farmerBps: dto.farmerBps ?? DEFAULT_SPLIT.farmerBps,
      investorBps: dto.investorBps ?? DEFAULT_SPLIT.investorBps,
      wegroBps: dto.wegroBps ?? DEFAULT_SPLIT.wegroBps,
      insured: dto.insured ?? false,
      estimatedReturnMinBps: dto.estimatedReturnMinBps,
      estimatedReturnMaxBps: dto.estimatedReturnMaxBps,
      plannedStartDate: dto.plannedStartDate ?? null,
    });
    const project = await this.projects.save(
      this.projects.create({
        ...terms,
        totalSlots: totalSlots(terms),
        stage: ProjectStage.DRAFT,
        chainState: ProjectChainState.LOCAL,
        createdById: actor.id,
      }),
    );
    return this.views.one(project);
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectDto> {
    const project = await this.findDraft(id);
    const merged = await this.checkedTerms({
      ...termsOf(project),
      // The DTO's own fields, money converted; omitted fields keep the draft's.
      ...definedOnly(
        Object.assign({}, dto, {
          fundingTarget:
            dto.fundingTarget === undefined
              ? undefined
              : takaToPoisha(dto.fundingTarget),
          slotPrice:
            dto.slotPrice === undefined
              ? undefined
              : takaToPoisha(dto.slotPrice),
        }),
      ),
    });
    // Only while still local: a publish racing this edit wins, the edit fails.
    const res = await this.projects.update(
      { id, chainState: ProjectChainState.LOCAL },
      { ...merged, totalSlots: totalSlots(merged) },
    );
    if (res.affected !== 1) throw publishedConflict();
    return this.views.one(await this.projects.findOneByOrFail({ id }));
  }

  async remove(id: string): Promise<void> {
    await this.findDraft(id);
    const res = await this.projects.delete({
      id,
      chainState: ProjectChainState.LOCAL,
    });
    if (res.affected !== 1) throw publishedConflict();
  }

  // --- Ledger ---

  /**
   * Fixes the terms (fingerprint), creates the project on the ledger and opens
   * it for funding. Safe to repeat after a failure: each step is skipped if
   * the ledger already shows it done.
   */
  async publish(actor: AuthUser, id: string): Promise<ProjectDto> {
    let project = await this.findOrFail(id);
    if (project.chainState === ProjectChainState.LOCAL) {
      const terms = await this.checkedTerms(termsOf(project));
      const hash = termsHash(id, terms);
      const res = await this.projects.update(
        { id, chainState: ProjectChainState.LOCAL },
        { chainState: ProjectChainState.SUBMITTED, termsHash: hash },
      );
      if (res.affected !== 1)
        throw new ConflictException({
          message: 'Already being published',
          code: ErrorCode.ALREADY_PUBLISHING,
        });
      project = await this.projects.findOneByOrFail({ id });
    }

    let chainStage = await this.ledgerStage(id);
    if (chainStage === null) {
      try {
        await this.send(actor, (c) =>
          c.createProject.populateTransaction(
            uuidToBytes32(id),
            chainTerms(project),
          ),
        );
      } catch (error) {
        if (error instanceof ContractRevertException) {
          // Refused before broadcast: back to an editable draft.
          await this.projects.update(
            { id, chainState: ProjectChainState.SUBMITTED },
            { chainState: ProjectChainState.LOCAL, termsHash: null },
          );
        }
        throw error;
      }
      chainStage = ProjectStage.DRAFT;
    }
    if (chainStage === ProjectStage.DRAFT) {
      await this.send(actor, (c) =>
        c.openForFunding.populateTransaction(uuidToBytes32(id)),
      );
    }
    return this.views.one(await this.projects.findOneByOrFail({ id }));
  }

  /** Admin stage moves; the ledger enforces the order (409 WrongStage otherwise). */
  async advance(
    actor: AuthUser,
    id: string,
    action: StageAction,
  ): Promise<ProjectDto> {
    const project = await this.findOrFail(id);
    if (project.chainState === ProjectChainState.LOCAL) {
      throw new ConflictException(
        action === 'cancelProject'
          ? {
              message: 'This draft was never published: delete it instead',
              code: ErrorCode.DRAFT_NEVER_PUBLISHED,
            }
          : {
              message: 'Publish the project first',
              code: ErrorCode.PROJECT_NOT_PUBLISHED,
            },
      );
    }
    await this.send(actor, (c) =>
      c[action].populateTransaction(uuidToBytes32(id)),
    );
    return this.views.one(await this.projects.findOneByOrFail({ id }));
  }

  // --- Reading ---

  async list(
    actor: AuthUser,
    q: ListProjectsQueryDto,
  ): Promise<Paginated<ProjectDto>> {
    const qb = this.projects.createQueryBuilder('p');
    this.scope(actor, qb);
    if (q.stage) qb.andWhere('p.stage = :stage', { stage: q.stage });
    if (q.durationType)
      qb.andWhere('p.duration_type = :dt', { dt: q.durationType });
    if (q.produceCode)
      qb.andWhere('p.produce_code = :pc', { pc: q.produceCode });
    if (q.districtCode)
      qb.andWhere('p.district_code = :dc', { dc: q.districtCode });
    if (q.farmerId && PROJECT_STAFF.has(actor.role)) {
      qb.andWhere('p.farmer_id = :fid', { fid: q.farmerId });
    }
    const [rows, total] = await qb
      .orderBy('p.created_at', 'DESC')
      .addOrderBy('p.id', 'ASC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.views.many(rows), total, q);
  }

  async findOne(actor: AuthUser, id: string): Promise<ProjectDto> {
    return this.views.one(await this.visible(actor, id));
  }

  /** The project as the actor may see it, or 404. */
  async visible(actor: AuthUser, id: string): Promise<Project> {
    const qb = this.projects
      .createQueryBuilder('p')
      .where('p.id = :id', { id });
    this.scope(actor, qb);
    const project = await qb.getOne();
    if (!project)
      throw new NotFoundException({
        message: 'Project not found',
        code: ErrorCode.PROJECT_NOT_FOUND,
      });
    return project;
  }

  /** Stage history and farm updates from the indexed ledger events, oldest first. */
  async timeline(actor: AuthUser, id: string): Promise<TimelineEntryDto[]> {
    await this.visible(actor, id);
    const rows: Array<{
      contract: string;
      event_name: string;
      args: Record<string, string>;
      block_time: Date;
      tx_hash: string;
      block_number: string;
    }> = await this.dataSource.query(
      `SELECT contract, event_name, args, block_time, tx_hash, block_number
         FROM chain_event
        WHERE args ? 'projectId'
          AND args->>'projectId' = $1
          AND (
            (contract = 'ProjectLedger'
              AND event_name IN ('ProjectCreated', 'ProjectStageChanged', 'RefundsRequired'))
            OR (contract = 'FieldRecordLog' AND event_name = 'EntryAdded')
          )
        ORDER BY block_number, log_index`,
      [uuidToBytes32(id)],
    );
    return rows.map((r) => {
      const base = {
        at: r.block_time,
        txHash: r.tx_hash.trim(),
        blockNumber: Number(r.block_number),
      };
      switch (r.event_name) {
        case 'ProjectCreated':
          return { ...base, kind: 'created' as const };
        case 'RefundsRequired':
          return { ...base, kind: 'refunds_required' as const };
        case 'EntryAdded':
          return {
            ...base,
            kind: 'field_record' as const,
            fieldRecordId: bytes32ToUuid(r.args.entryId),
            entryType: bytes32ToCode(r.args.entryType),
          };
        default:
          return {
            ...base,
            kind: 'stage_changed' as const,
            stage: STAGE_BY_CHAIN[Number(r.args.newStage)],
          };
      }
    });
  }

  /** Recomputes the terms fingerprint and compares it, and the stage, with the ledger. */
  async integrity(id: string): Promise<ProjectIntegrityDto> {
    const project = await this.findOrFail(id);
    const computedHash = termsHash(id, termsOf(project));
    const onChain = await this.contracts
      .get('ProjectLedger')
      .getProject(uuidToBytes32(id));
    const ledgerStage = STAGE_BY_CHAIN[Number(onChain.stage)] ?? null;
    const ledgerHash = ledgerStage ? onChain.terms.termsHash : null;
    const mismatches: string[] = [];
    if (project.chainState === ProjectChainState.LOCAL) {
      mismatches.push('notPublished');
    } else if (!ledgerStage) {
      mismatches.push('notOnLedger');
    } else {
      if (ledgerHash !== computedHash) mismatches.push('termsHash');
      if (project.termsHash !== computedHash) mismatches.push('storedHash');
      if (ledgerStage !== project.stage) mismatches.push('stage');
      if (Number(onChain.issuedSlots) !== project.issuedSlots)
        mismatches.push('issuedSlots');
    }
    return {
      matches: mismatches.length === 0,
      computedHash,
      ledgerHash,
      ledgerStage,
      mismatches,
    };
  }

  // --- Helpers ---

  /**
   * Drafts are staff-only; everyone else sees published projects, and a
   * farmer only their own.
   */
  private scope(
    actor: AuthUser,
    qb: ReturnType<Repository<Project>['createQueryBuilder']>,
  ): void {
    if (PROJECT_STAFF.has(actor.role)) return;
    qb.andWhere('p.chain_state <> :local', { local: ProjectChainState.LOCAL });
    if (actor.role === Role.FARMER)
      qb.andWhere('p.farmer_id = :me', { me: actor.id });
  }

  private async findOrFail(id: string): Promise<Project> {
    const project = await this.projects.findOneBy({ id });
    if (!project)
      throw new NotFoundException({
        message: 'Project not found',
        code: ErrorCode.PROJECT_NOT_FOUND,
      });
    return project;
  }

  private async findDraft(id: string): Promise<Project> {
    const project = await this.findOrFail(id);
    if (project.chainState !== ProjectChainState.LOCAL)
      throw publishedConflict();
    return project;
  }

  /** All rules plus live references: active produce (its category), a verified farmer. */
  private async checkedTerms(t: ProjectTerms): Promise<ProjectTerms> {
    const produce = this.catalog.produceTypes.requireActive(t.produceCode);
    const terms = { ...t, category: produce.category };
    const problems = checkTerms(terms);
    const farmer = await this.users.findOne({
      where: { id: t.farmerId },
      select: { id: true, role: true, status: true, chainState: true },
    });
    if (
      !farmer ||
      farmer.role !== Role.FARMER ||
      farmer.status !== ParticipantStatus.VERIFIED ||
      farmer.chainState !== ChainState.CONFIRMED
    ) {
      problems.push(
        problem(
          ErrorCode.TERMS_FARMER_NOT_VERIFIED,
          'farmerId must be a verified farmer',
        ),
      );
    }
    if (problems.length > 0) {
      throw new UnprocessableEntityException({
        message: 'The project terms are not valid',
        code: ErrorCode.INVALID_TERMS,
        details: { problems },
      });
    }
    return terms;
  }

  private async ledgerStage(id: string): Promise<ProjectStage | null> {
    const p = await this.contracts
      .get('ProjectLedger')
      .getProject(uuidToBytes32(id));
    return STAGE_BY_CHAIN[Number(p.stage)] ?? null;
  }

  /** Sends as the actor and applies the receipt's events before answering. */
  private async send(
    actor: AuthUser,
    build: (c: ProjectLedger) => Promise<ContractTransaction>,
  ): Promise<TxResult> {
    const result = await this.tx.send(actor.keyIndex, 'ProjectLedger', build);
    await this.receipts.apply(result);
    return result;
  }
}

/** The stored draft as terms. */
export function termsOf(p: Project): ProjectTerms {
  return {
    title: p.title,
    description: p.description,
    produceCode: p.produceCode,
    category: p.category,
    districtCode: p.districtCode,
    location: p.location,
    farmerId: p.farmerId,
    durationType: p.durationType,
    durationMonths: p.durationMonths,
    payoutIntervalMonths: p.payoutIntervalMonths,
    fundingTarget: p.fundingTarget,
    slotPrice: p.slotPrice,
    farmerBps: p.farmerBps,
    investorBps: p.investorBps,
    wegroBps: p.wegroBps,
    insured: p.insured,
    estimatedReturnMinBps: p.estimatedReturnMinBps,
    estimatedReturnMaxBps: p.estimatedReturnMaxBps,
    plannedStartDate: p.plannedStartDate,
  };
}

/** ProjectLedger.ProjectTerms as the contract takes it. */
function chainTerms(p: Project) {
  return {
    farmerId: uuidToBytes32(p.farmerId),
    produceCode: codeToBytes32(p.produceCode),
    category: CHAIN_PRODUCE_CATEGORY[p.category as ProduceCategory],
    regionCode: codeToBytes32(p.districtCode),
    durationType: CHAIN_DURATION_TYPE[p.durationType],
    durationMonths: p.durationMonths,
    payoutIntervalMonths: p.payoutIntervalMonths,
    fundingTarget: p.fundingTarget,
    slotPrice: p.slotPrice,
    farmerBps: p.farmerBps,
    investorBps: p.investorBps,
    wegroBps: p.wegroBps,
    insured: p.insured,
    termsHash: p.termsHash!,
  };
}

function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

function publishedConflict() {
  return new ConflictException({
    message: 'Published projects cannot be changed or deleted',
    code: ErrorCode.PROJECT_PUBLISHED_LOCKED,
  });
}
