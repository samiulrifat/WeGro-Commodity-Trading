import { randomUUID } from 'node:crypto';
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
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { ChainClock } from '../../blockchain/chain-clock';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import type { SettlementLedger } from '../../blockchain/generated';
import { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import { TransactionService } from '../../blockchain/tx/transaction.service';
import { codeToBytes32, uuidToBytes32 } from '../../blockchain/utils/ids';
import { poishaToTaka, takaToPoisha } from '../../blockchain/utils/money';
import {
  hashPaymentRef,
  normalisePaymentRef,
} from '../../blockchain/utils/payment-ref';
import { IdentityCryptoService } from '../../common/crypto/identity-crypto.service';
import { Paginated } from '../../common/dto/pagination.dto';
import { bdDate } from '../../common/time/bd-dates';
import type { EnvironmentVariables } from '../../config/env.validation';
import type { AuthUser } from '../auth/auth-user';
import { Photo } from '../field-records/entities/photo.entity';
import { photoHash, PhotosService } from '../field-records/photos.service';
import { Project } from '../projects/entities/project.entity';
import { STAGE_BY_CHAIN, ProjectStage } from '../projects/project.enums';
import { ProjectViews } from '../projects/project-views';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/roles';
import type {
  AddCostDto,
  CostDto,
  ListCostsQueryDto,
  ListRoundsQueryDto,
  PayoutLineDto,
  PreviewDto,
  RecordPayoutDto,
  RoundDto,
  RoundEligibilityDto,
  RoundBlock,
  RoundListItemDto,
  SettlementSummaryDto,
} from './dto/settlement.dto';
import { PayoutLine } from './entities/payout-line.entity';
import { ProjectCost } from './entities/project-cost.entity';
import { SettlementRound } from './entities/settlement-round.entity';
import { loadHoldings } from './settlement-ledger.sync';
import {
  costFingerprint,
  MONTH_SECONDS,
  rejectFingerprint,
  roundTotals,
  signedTaka,
  splitRound,
} from './settlement-math';
import {
  CATEGORY_CODE,
  CostStatus,
  DECIDED_ROUND,
  RoundStatus,
} from './settlement.enums';
import { ErrorCode } from '../../common/errors/error-code';

export const SETTLEMENT_STAFF: ReadonlySet<Role> = new Set([
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPERATIONS,
  Role.ACCOUNTS,
  Role.AUDITOR,
]);
/** See payment references. */
const SEES_PAYMENTS: ReadonlySet<Role> = new Set([
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.ACCOUNTS,
  Role.AUDITOR,
]);
/** Stages in which costs can still be entered (until the final round). */
const COSTS_OPEN: readonly ProjectStage[] = [
  ProjectStage.FUNDED,
  ProjectStage.ACTIVE,
  ProjectStage.READY_FOR_SALE,
];

/** Everything the next round depends on, read from the ledgers at once. */
interface LedgerState {
  stage: ProjectStage;
  createdAt: number;
  payoutIntervalMonths: number;
  sales: bigint;
  insurance: bigint;
  inputs: bigint;
  other: bigint;
  distributed: bigint;
  openRound: number;
  lastRoundAt: number;
  settled: boolean;
  outstanding: string[];
  now: number;
  terms: {
    farmerBps: number;
    investorBps: number;
    wegroBps: number;
    issuedSlots: number;
    slotPrice: bigint;
  };
}

/**
 * Settlement (SettlementLedger): the project costs Accounts enters, payout
 * rounds that one Accounts person prepares and another approves, and the
 * payment of each line. The ledger works out every figure; this service
 * previews them, checks them and says precisely why a round cannot start.
 */
@Injectable()
export class SettlementService {
  private readonly paymentRefSecret: string;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly dataSource: DataSource,
    @InjectRepository(ProjectCost)
    private readonly costs: Repository<ProjectCost>,
    @InjectRepository(SettlementRound)
    private readonly rounds: Repository<SettlementRound>,
    @InjectRepository(PayoutLine)
    private readonly lines: Repository<PayoutLine>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Photo)
    private readonly photoRows: Repository<Photo>,
    private readonly photos: PhotosService,
    private readonly views: ProjectViews,
    private readonly crypto: IdentityCryptoService,
    private readonly contracts: ContractsRegistry,
    private readonly tx: TransactionService,
    private readonly applier: ReceiptApplier,
    private readonly clock: ChainClock,
  ) {
    this.paymentRefSecret = config.get('PAYMENT_REF_SECRET', { infer: true });
  }

  // --- Costs ---

  /** Accounts enters a cost with its bill; costs freeze once a final round is prepared. */
  async addCost(
    actor: AuthUser,
    projectId: string,
    dto: AddCostDto,
  ): Promise<CostDto> {
    const project = await this.projects.findOneBy({ id: projectId });
    if (!project)
      throw new NotFoundException({
        message: 'Project not found',
        code: ErrorCode.PROJECT_NOT_FOUND,
      });
    if (!COSTS_OPEN.includes(project.stage)) {
      throw new ConflictException({
        message: `Costs are entered while a project is funded, active or ready for sale; this one is ${project.stage}`,
        code: ErrorCode.COST_PROJECT_STAGE,
        details: { stage: project.stage },
      });
    }
    await this.requireCostsOpen(projectId);
    if (dto.incurredOn > bdDate(await this.clock.now())) {
      throw new UnprocessableEntityException({
        message: 'incurredOn cannot be in the future',
        code: ErrorCode.INCURRED_IN_FUTURE,
      });
    }
    const amount = takaToPoisha(dto.amount);
    if (amount <= 0n)
      throw new UnprocessableEntityException({
        message: 'amount must be above zero',
        code: ErrorCode.AMOUNT_NOT_POSITIVE,
      });
    const photo = dto.photoId ? await this.ownPhoto(actor, dto.photoId) : null;

    const cost = this.costs.create({
      id: randomUUID(),
      costId: null,
      projectId,
      category: dto.category,
      amount,
      incurredOn: dto.incurredOn,
      note: dto.note,
      photoId: photo?.id ?? null,
      enteredById: actor.id,
      status: CostStatus.SUBMITTED,
      recordedAt: null,
    });
    cost.detailsHash = costFingerprint({
      id: cost.id,
      projectId,
      category: cost.category,
      amount,
      incurredOn: cost.incurredOn,
      note: cost.note,
      photoHash: photo ? photoHash(photo.sha256) : null,
    });
    await this.costs.insert(cost);
    try {
      await this.send(actor, (c) =>
        c.addCost.populateTransaction(
          uuidToBytes32(projectId),
          codeToBytes32(CATEGORY_CODE(cost.category)),
          amount,
          cost.detailsHash,
        ),
      );
    } catch (error) {
      if (error instanceof ContractRevertException)
        await this.costs.delete({ id: cost.id, status: CostStatus.SUBMITTED });
      throw error;
    }
    return this.costOne(actor, cost.id);
  }

  /** Voids a wrongly entered cost; the correction is a new entry. */
  async voidCost(actor: AuthUser, id: string): Promise<CostDto> {
    const cost = await this.costs.findOneBy({ id });
    if (!cost || cost.status === CostStatus.SUBMITTED) {
      throw new NotFoundException({
        message: 'Cost not found',
        code: ErrorCode.COST_NOT_FOUND,
      });
    }
    if (cost.status !== CostStatus.RECORDED) {
      throw new ConflictException({
        message: 'This cost is already voided',
        code: ErrorCode.COST_ALREADY_VOIDED,
      });
    }
    await this.requireCostsOpen(cost.projectId);
    const saved = await this.costs.update(
      { id, status: CostStatus.RECORDED },
      { voidedById: actor.id },
    );
    if (saved.affected !== 1)
      throw new ConflictException({
        message: 'The cost changed meanwhile; try again',
        code: ErrorCode.CHANGED_MEANWHILE,
      });
    try {
      await this.send(actor, (c) =>
        c.voidCost.populateTransaction(cost.costId!),
      );
    } catch (error) {
      if (error instanceof ContractRevertException) {
        await this.costs.update(
          { id, status: CostStatus.RECORDED },
          { voidedById: null },
        );
      }
      throw error;
    }
    return this.costOne(actor, id);
  }

  async listCosts(
    actor: AuthUser,
    projectId: string,
    q: ListCostsQueryDto,
  ): Promise<CostDto[]> {
    await this.visibleProject(actor, projectId);
    const rows = await this.costs.find({
      where: {
        projectId,
        status: In(
          q.includeVoided
            ? [CostStatus.RECORDED, CostStatus.VOIDED]
            : [CostStatus.RECORDED],
        ),
      },
      order: { incurredOn: 'DESC', createdAt: 'DESC' },
    });
    return this.costDtos(rows);
  }

  async costOne(actor: AuthUser, id: string): Promise<CostDto> {
    const cost = await this.costs.findOneBy({ id });
    if (!cost || cost.status === CostStatus.SUBMITTED) {
      throw new NotFoundException({
        message: 'Cost not found',
        code: ErrorCode.COST_NOT_FOUND,
      });
    }
    await this.visibleProject(actor, cost.projectId);
    return (await this.costDtos([cost]))[0];
  }

  async costPhoto(actor: AuthUser, id: string): Promise<Photo> {
    const cost = await this.costs.findOneBy({ id });
    if (!cost || cost.status === CostStatus.SUBMITTED || !cost.photoId) {
      throw new NotFoundException({
        message: 'No bill photo for this cost',
        code: ErrorCode.COST_HAS_NO_PHOTO,
      });
    }
    await this.visibleProject(actor, cost.projectId);
    return this.photos.find(cost.photoId);
  }

  // --- Summary ---

  /**
   * Where the project stands: income and costs so far, what has been split,
   * whether a staged or the final round can be prepared now (and if not,
   * why), and what each would pay if prepared now.
   */
  async summary(
    actor: AuthUser,
    projectId: string,
  ): Promise<SettlementSummaryDto> {
    const project = await this.visibleProject(actor, projectId);
    const [state, holdings, rounds] = await Promise.all([
      this.ledgerState(projectId),
      loadHoldings(this.dataSource, projectId),
      this.rounds.find({
        where: {
          projectId,
          status: SETTLEMENT_STAFF.has(actor.role)
            ? In(Object.values(RoundStatus))
            : In([...DECIDED_ROUND]),
        },
        order: { id: 'ASC' },
      }),
    ]);
    const income = state.sales + state.insurance;
    const costs = state.inputs + state.other;
    const preview = (isFinal: boolean): PreviewDto => {
      const { figures, lines } = splitRound(
        roundTotals({
          income,
          costs,
          alreadySplit: state.distributed,
          isFinal,
          terms: state.terms,
        }),
        state.terms,
        project.farmerId,
        holdings,
      );
      return {
        profit: poishaToTaka(figures.profit),
        farmerShare: poishaToTaka(figures.farmerShare),
        investorShare: poishaToTaka(figures.investorShare),
        wegroShare: poishaToTaka(figures.wegroShare),
        capitalReturn: poishaToTaka(figures.capitalReturn),
        leftover: poishaToTaka(figures.leftover),
        payees: lines.length,
      };
    };
    return {
      project: { id: project.id, name: project.title },
      stage: state.stage,
      income: {
        sales: poishaToTaka(state.sales),
        insurance: poishaToTaka(state.insurance),
        total: poishaToTaka(income),
      },
      costs: {
        inputs: poishaToTaka(state.inputs),
        other: poishaToTaka(state.other),
        total: poishaToTaka(costs),
      },
      net: signedTaka(income - costs),
      distributedProfit: poishaToTaka(state.distributed),
      openRoundId: state.openRound || null,
      settled: state.settled,
      staged: { ...this.stagedCheck(state), preview: preview(false) },
      final: { ...this.finalCheck(state), preview: preview(true) },
      rounds: rounds.map((r) => ({
        id: r.id,
        isFinal: r.isFinal,
        status: r.status!,
        profit: poishaToTaka(r.profit),
        capitalReturn: poishaToTaka(r.capitalReturn),
        preparedAt: r.preparedAt,
        approvedAt: r.approvedAt,
        paidAt: r.paidAt,
      })),
    };
  }

  // --- Rounds ---

  /** Accounts prepares a round; the ledger works out and fingerprints every figure. */
  async prepareRound(
    actor: AuthUser,
    projectId: string,
    isFinal: boolean,
  ): Promise<RoundDto> {
    const project = await this.projects.findOneBy({ id: projectId });
    if (!project)
      throw new NotFoundException({
        message: 'Project not found',
        code: ErrorCode.PROJECT_NOT_FOUND,
      });
    const state = await this.ledgerState(projectId);
    const check = isFinal ? this.finalCheck(state) : this.stagedCheck(state);
    if (!check.allowed) {
      throw new ConflictException({
        message: REASONS[check.reason!],
        code: check.reason!,
        details: {
          nextAllowedAt: check.nextAllowedAt,
          outstanding: check.outstanding,
        },
      });
    }
    const result = await this.send(actor, (c) =>
      c.prepareRound.populateTransaction(uuidToBytes32(projectId), isFinal),
    );
    const roundId = Number(
      result.events.find((e) => e.name === 'RoundPrepared')!.args.roundId,
    );
    return this.round(actor, roundId);
  }

  /** A second Accounts person approves; nothing can be marked paid before. */
  async approveRound(actor: AuthUser, id: number): Promise<RoundDto> {
    const round = await this.roundIn(id, RoundStatus.PREPARED);
    if (round.preparedById === actor.id) {
      throw new ForbiddenException({
        message: 'A round is approved by someone other than who prepared it',
        code: ErrorCode.SAME_ACCOUNTANT,
      });
    }
    if (!round.verified) {
      throw new ConflictException({
        message:
          'The figures worked out here do not match the ledger; reject this round',
        code: ErrorCode.ROUND_NOT_VERIFIED,
      });
    }
    await this.send(actor, (c) => c.approveRound.populateTransaction(id));
    return this.round(actor, id);
  }

  /** Sends a prepared round back with a reason; it is prepared again once corrected. */
  async rejectRound(
    actor: AuthUser,
    id: number,
    reason: string,
  ): Promise<RoundDto> {
    await this.roundIn(id, RoundStatus.PREPARED);
    const hash = rejectFingerprint(id, reason);
    const saved = await this.rounds.update(
      { id, status: RoundStatus.PREPARED },
      { rejectReason: reason, rejectReasonHash: hash, rejectedById: actor.id },
    );
    if (saved.affected !== 1)
      throw new ConflictException({
        message: 'The round changed meanwhile; try again',
        code: ErrorCode.CHANGED_MEANWHILE,
      });
    try {
      await this.send(actor, (c) =>
        c.rejectRound.populateTransaction(id, hash),
      );
    } catch (error) {
      if (error instanceof ContractRevertException) {
        await this.rounds.update(
          { id, status: RoundStatus.PREPARED, rejectReasonHash: hash },
          { rejectReason: null, rejectReasonHash: null, rejectedById: null },
        );
      }
      throw error;
    }
    return this.round(actor, id);
  }

  /**
   * Records that Accounts paid one line outside the platform. The reference
   * is saved encrypted first; the ledger gets its keyed hash and refuses it
   * twice. When every line is paid the round is paid, and a final round
   * marks the project paid out.
   */
  async recordPayment(
    actor: AuthUser,
    id: number,
    dto: RecordPayoutDto,
  ): Promise<RoundDto> {
    await this.roundIn(id, RoundStatus.APPROVED);
    const line = await this.lines.findOneBy({
      roundId: id,
      payeeId: dto.payeeId,
    });
    if (!line)
      throw new NotFoundException({
        message: 'This person is not paid in this round',
        code: ErrorCode.NOT_IN_ROUND,
      });
    if (line.paidAt) {
      throw new ConflictException({
        message: 'This line is already paid',
        code: ErrorCode.ALREADY_PAID,
      });
    }
    if (!line.verified || line.amount === null) {
      throw new ConflictException({
        message: 'The amount for this line does not match the ledger',
        code: ErrorCode.LINE_NOT_VERIFIED,
      });
    }
    let ref: string;
    try {
      ref = normalisePaymentRef(dto.paymentReference);
    } catch (error) {
      throw new UnprocessableEntityException({
        message: (error as Error).message,
        code: ErrorCode.PAYMENT_REF_INVALID,
      });
    }
    const hash = hashPaymentRef(ref, this.paymentRefSecret);
    try {
      const saved = await this.lines
        .createQueryBuilder()
        .update()
        .set({
          paymentRefEnc: this.crypto.encrypt(ref, lineContext(id, dto.payeeId)),
          paymentRefHash: hash,
          recordedById: actor.id,
        })
        .where('round_id = :id AND payee_id = :payee AND paid_at IS NULL', {
          id,
          payee: dto.payeeId,
        })
        .andWhere('(payment_ref_hash IS NULL OR payment_ref_hash = :hash)', {
          hash,
        })
        .execute();
      if (saved.affected !== 1) {
        throw new ConflictException({
          message: 'A different payment for this line is being recorded',
          code: ErrorCode.PAYMENT_IN_PROGRESS,
        });
      }
    } catch (error) {
      throw duplicateRef(error);
    }
    try {
      await this.send(actor, (c) =>
        c.recordPayment.populateTransaction(
          id,
          uuidToBytes32(dto.payeeId),
          hash,
        ),
      );
    } catch (error) {
      if (error instanceof ContractRevertException) {
        await this.lines
          .createQueryBuilder()
          .update()
          .set({
            paymentRefEnc: null,
            paymentRefHash: null,
            recordedById: null,
          })
          .where(
            'round_id = :id AND payee_id = :payee AND paid_at IS NULL AND payment_ref_hash = :hash',
            { id, payee: dto.payeeId, hash },
          )
          .execute();
      }
      throw error;
    }
    return this.round(actor, id);
  }

  async listRounds(
    q: ListRoundsQueryDto,
  ): Promise<Paginated<RoundListItemDto>> {
    const qb = this.rounds
      .createQueryBuilder('r')
      .where('r.status IS NOT NULL');
    if (q.projectId) qb.andWhere('r.project_id = :pid', { pid: q.projectId });
    if (q.status) qb.andWhere('r.status = :st', { st: q.status });
    const [rows, total] = await qb
      .orderBy('r.id', 'DESC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.roundDtos(rows), total, q);
  }

  /** A round with every line (staff). */
  async round(actor: AuthUser, id: number): Promise<RoundDto> {
    const round = await this.rounds.findOneBy({ id });
    if (!round || round.status === null)
      throw new NotFoundException({
        message: 'Round not found',
        code: ErrorCode.ROUND_NOT_FOUND,
      });
    const [[view], lines] = await Promise.all([
      this.roundDtos([round]),
      this.lines.find({
        where: { roundId: id },
        order: { payeeRole: 'ASC', payeeId: 'ASC' },
      }),
    ]);
    const names = await this.views.names(lines.map((l) => l.payeeId));
    const seesPayments = SEES_PAYMENTS.has(actor.role);
    return {
      ...view,
      lines: lines.map((l): PayoutLineDto => ({
        payee: { id: l.payeeId, name: names.get(l.payeeId) ?? '' },
        role: l.payeeRole,
        slots: l.slots,
        amount: l.amount === null ? null : poishaToTaka(l.amount),
        lineHash: l.lineHash,
        verified: l.verified,
        paid: l.paidAt !== null,
        paidAt: l.paidAt,
        ...(seesPayments && {
          paymentReference:
            l.paidAt && l.paymentRefEnc
              ? this.crypto.decrypt(l.paymentRefEnc, lineContext(id, l.payeeId))
              : null,
        }),
      })),
    };
  }

  // --- Rules ---

  /** Staff see every project; a farmer their own; an officer their farmers'; an investor those they hold. */
  async visibleProject(actor: AuthUser, projectId: string): Promise<Project> {
    const project = await this.projects.findOneBy({ id: projectId });
    const allowed =
      !!project &&
      (SETTLEMENT_STAFF.has(actor.role) ||
        (actor.role === Role.FARMER && project.farmerId === actor.id) ||
        (actor.role === Role.FIELD_OFFICER &&
          (await this.users.exists({
            where: { id: project.farmerId, fieldOfficerId: actor.id },
          }))) ||
        (actor.role === Role.INVESTOR &&
          (await this.holds(actor.id, projectId))));
    if (!allowed)
      throw new NotFoundException({
        message: 'Project not found',
        code: ErrorCode.PROJECT_NOT_FOUND,
      });
    return project;
  }

  private async holds(investorId: string, projectId: string) {
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM reservations
        WHERE project_id = $1 AND investor_id = $2 AND status = 'confirmed' LIMIT 1`,
      [projectId, investorId],
    );
    return rows.length > 0;
  }

  /** As SettlementLedger._requireOpenProject, from the database. */
  private async requireCostsOpen(projectId: string): Promise<void> {
    const blocking = await this.rounds.findOne({
      where: {
        projectId,
        isFinal: true,
        status: In([
          RoundStatus.PREPARED,
          RoundStatus.APPROVED,
          RoundStatus.PAID,
        ]),
      },
      select: { id: true, status: true },
    });
    if (blocking) {
      throw new ConflictException({
        message:
          blocking.status === RoundStatus.PREPARED
            ? 'A final round is open; reject it to change costs'
            : 'This project is settled; costs are final',
        code:
          blocking.status === RoundStatus.PREPARED
            ? ErrorCode.FINAL_ROUND_OPEN
            : ErrorCode.ALREADY_SETTLED,
      });
    }
  }

  private async roundIn(
    id: number,
    expected: RoundStatus,
  ): Promise<SettlementRound> {
    const round = await this.rounds.findOneBy({ id });
    if (!round || round.status === null)
      throw new NotFoundException({
        message: 'Round not found',
        code: ErrorCode.ROUND_NOT_FOUND,
      });
    if (round.status !== expected) {
      throw new ConflictException({
        message: `This round is ${round.status}`,
        code: ErrorCode.ROUND_WRONG_STATUS,
        details: { status: round.status },
      });
    }
    return round;
  }

  private async ownPhoto(actor: AuthUser, id: string): Promise<Photo> {
    const photo = await this.photoRows.findOneBy({
      id,
      uploadedById: actor.id,
    });
    if (!photo) {
      throw new UnprocessableEntityException({
        message: 'photoId must be a photo you uploaded',
        code: ErrorCode.PHOTO_NOT_YOURS,
      });
    }
    return photo;
  }

  /** One round of reads from every ledger that feeds settlement. */
  private async ledgerState(projectId: string): Promise<LedgerState> {
    const key = uuidToBytes32(projectId);
    const c = this.contracts;
    const settlement = c.get('SettlementLedger');
    const [
      project,
      sales,
      insurance,
      inputs,
      other,
      distributed,
      openRound,
      lastRoundAt,
      settled,
      openReceipts,
      openTrades,
      pendingInputs,
      openClaims,
      unpaidClaims,
      now,
    ] = await Promise.all([
      c.get('ProjectLedger').getProject(key),
      c.get('TradeLedger').saleIncome(key),
      // Claims count once the insurer has paid them.
      c.get('InsuranceRegistry').paidTotal(key),
      c.get('VoucherRegistry').spentValue(key),
      settlement.otherCosts(key),
      settlement.distributedProfit(key),
      settlement.openRound(key),
      settlement.lastRoundAt(key),
      settlement.finalApproved(key),
      c.get('WarehouseReceipt').openReceipts(key),
      c.get('TradeLedger').openTrades(key),
      c.get('VoucherRegistry').pendingSaleValue(key),
      c.get('InsuranceRegistry').openClaims(key),
      c.get('InsuranceRegistry').unpaidClaims(key),
      this.clock.now(),
    ]);
    // The order SettlementLedger checks them in.
    const outstanding = [
      openReceipts > 0n && 'STORED_CROP',
      openTrades > 0n && 'TRADES',
      pendingInputs > 0n && 'VOUCHER_SALES',
      (openClaims > 0n || unpaidClaims > 0n) && 'CLAIMS',
    ].filter((x): x is string => !!x);
    return {
      stage: STAGE_BY_CHAIN[Number(project.stage)],
      createdAt: Number(project.createdAt),
      payoutIntervalMonths: Number(project.terms.payoutIntervalMonths),
      sales,
      insurance,
      inputs,
      other,
      distributed,
      openRound: Number(openRound),
      lastRoundAt: Number(lastRoundAt),
      settled,
      outstanding,
      now: Math.floor(now.getTime() / 1000),
      terms: {
        farmerBps: Number(project.terms.farmerBps),
        investorBps: Number(project.terms.investorBps),
        wegroBps: Number(project.terms.wegroBps),
        issuedSlots: Number(project.issuedSlots),
        slotPrice: project.terms.slotPrice,
      },
    };
  }

  /** As SettlementLedger.prepareRound for a staged round, in the same order. */
  private stagedCheck(s: LedgerState): Omit<RoundEligibilityDto, 'preview'> {
    const no = (reason: RoundBlock, nextAllowedAt: Date | null = null) => ({
      allowed: false,
      reason,
      nextAllowedAt,
      outstanding: [],
    });
    if (s.openRound) return no(ErrorCode.ROUND_OPEN);
    if (s.settled) return no(ErrorCode.ALREADY_SETTLED);
    if (s.stage !== ProjectStage.ACTIVE) return no(ErrorCode.ROUND_WRONG_STAGE);
    if (s.payoutIntervalMonths === 0) return no(ErrorCode.NOT_STAGED);
    const since = s.lastRoundAt || s.createdAt;
    const next = since + s.payoutIntervalMonths * MONTH_SECONDS;
    const nextAt = new Date(next * 1000);
    // The next block is at least a second later than the latest one.
    if (s.now + 1 < next) return no(ErrorCode.TOO_EARLY, nextAt);
    const income = s.sales + s.insurance;
    if (income <= s.inputs + s.other + s.distributed)
      return no(ErrorCode.NOTHING_TO_DISTRIBUTE, nextAt);
    return {
      allowed: true,
      reason: null,
      nextAllowedAt: nextAt,
      outstanding: [],
    };
  }

  /** As SettlementLedger.prepareRound for the final round, in the same order. */
  private finalCheck(s: LedgerState): Omit<RoundEligibilityDto, 'preview'> {
    const no = (reason: RoundBlock) => ({
      allowed: false,
      reason,
      nextAllowedAt: null,
      outstanding: s.outstanding,
    });
    if (s.openRound) return no(ErrorCode.ROUND_OPEN);
    if (s.settled) return no(ErrorCode.ALREADY_SETTLED);
    if (s.stage !== ProjectStage.READY_FOR_SALE) {
      return no(ErrorCode.ROUND_WRONG_STAGE);
    }
    if (s.outstanding.length > 0) return no(ErrorCode.STILL_OUTSTANDING);
    return {
      allowed: true,
      reason: null,
      nextAllowedAt: null,
      outstanding: [],
    };
  }

  private async send(
    actor: AuthUser,
    build: (c: SettlementLedger) => Promise<ContractTransaction>,
  ) {
    const result = await this.tx.send(
      actor.keyIndex,
      'SettlementLedger',
      build,
    );
    await this.applier.apply(result);
    return result;
  }

  // --- Views ---

  private async costDtos(rows: ProjectCost[]): Promise<CostDto[]> {
    const names = await this.views.names(
      rows.flatMap((c) =>
        c.voidedById ? [c.enteredById, c.voidedById] : [c.enteredById],
      ),
    );
    return rows.map((c) => ({
      id: c.id,
      costId: c.costId,
      projectId: c.projectId,
      category: c.category,
      amount: poishaToTaka(c.amount),
      incurredOn: c.incurredOn,
      note: c.note,
      photoUrl: c.photoId ? `/api/settlement/costs/${c.id}/photo` : null,
      status: c.status,
      enteredBy: { id: c.enteredById, name: names.get(c.enteredById) ?? '' },
      recordedAt: c.recordedAt,
      // Shown once the ledger has it: until then it may be an attempt in flight.
      voidedBy:
        c.status === CostStatus.VOIDED && c.voidedById
          ? { id: c.voidedById, name: names.get(c.voidedById) ?? '' }
          : null,
      voidedAt: c.voidedAt,
      detailsHash: c.detailsHash,
    }));
  }

  /** One query each for project titles and names, whatever the page size. */
  private async roundDtos(
    rows: SettlementRound[],
  ): Promise<Plain<RoundListItemDto>[]> {
    if (rows.length === 0) return [];
    const projects = await this.projects.find({
      where: { id: In([...new Set(rows.map((r) => r.projectId))]) },
      select: { id: true, title: true },
    });
    const titles = new Map(projects.map((p) => [p.id, p.title]));
    const names = await this.views.names(
      rows.flatMap((r) =>
        [r.preparedById, r.approvedById, r.rejectedById].filter(
          (x): x is string => !!x,
        ),
      ),
    );
    const party = (id: string | null) =>
      id ? { id, name: names.get(id) ?? '' } : null;
    return rows.map((r) => {
      const rejected = r.status === RoundStatus.REJECTED;
      return {
        id: r.id,
        project: { id: r.projectId, name: titles.get(r.projectId) ?? '' },
        isFinal: r.isFinal,
        status: r.status!,
        income: poishaToTaka(r.income),
        costs: poishaToTaka(r.costs),
        profit: poishaToTaka(r.profit),
        farmerShare: poishaToTaka(r.farmerShare),
        investorShare: poishaToTaka(r.investorShare),
        wegroShare: poishaToTaka(r.wegroShare),
        capitalReturn: poishaToTaka(r.capitalReturn),
        leftover: poishaToTaka(r.leftover),
        fingerprint: r.fingerprint,
        verified: r.verified,
        preparedBy: party(r.preparedById)!,
        preparedAt: r.preparedAt,
        approvedBy: party(r.approvedById),
        approvedAt: r.approvedAt,
        // Shown once the ledger has it: until then it may be an attempt in flight.
        rejectReason: rejected ? r.rejectReason : null,
        rejectedBy: rejected ? party(r.rejectedById) : null,
        rejectedAt: r.rejectedAt,
        payeeCount: r.payeeCount,
        paidCount: r.paidCount,
        paidAt: r.paidAt,
      };
    });
  }
}

/** A DTO's fields as a plain object type, so views can be spread into larger ones. */
type Plain<T> = { [K in keyof T]: T[K] };

export const lineContext = (roundId: number, payeeId: string) =>
  `payout_lines.payment_ref:${roundId}:${payeeId}`;

/** Why a round cannot be prepared now, as the ledger would refuse it. */
const REASONS: Record<RoundBlock, string> = {
  [ErrorCode.ROUND_OPEN]: 'Another round for this project is still open',
  [ErrorCode.ALREADY_SETTLED]: 'This project is already settled',
  [ErrorCode.ROUND_WRONG_STAGE]:
    'Staged rounds are for active projects, the final round for projects ready for sale',
  [ErrorCode.NOT_STAGED]: 'This project pays out only once, at the end',
  [ErrorCode.TOO_EARLY]: 'The next staged round is not due yet',
  [ErrorCode.NOTHING_TO_DISTRIBUTE]: 'There is no new profit to split',
  [ErrorCode.STILL_OUTSTANDING]:
    'Everything feeding the final figures must be finished first',
};

function duplicateRef(error: unknown): unknown {
  if (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string }).code === '23505'
  ) {
    return new ConflictException({
      message: 'This payment reference was already used',
      code: ErrorCode.PAYMENT_REF_ALREADY_USED,
    });
  }
  return error;
}
