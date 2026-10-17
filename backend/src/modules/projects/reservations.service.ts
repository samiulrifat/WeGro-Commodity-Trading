import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { ContractTransaction } from 'ethers';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import type { ProjectLedger } from '../../blockchain/generated';
import { TransactionService } from '../../blockchain/tx/transaction.service';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { poishaToTaka } from '../../blockchain/utils/money';
import {
  hashPaymentRef,
  normalisePaymentRef,
} from '../../blockchain/utils/payment-ref';
import { Paginated } from '../../common/dto/pagination.dto';
import { IdentityCryptoService } from '../../common/crypto/identity-crypto.service';
import type { EnvironmentVariables } from '../../config/env.validation';
import type { AuthUser } from '../auth/auth-user';
import { Role } from '../users/roles';
import type { ListReservationsQueryDto } from './dto/project-request.dto';
import type {
  HoldingDto,
  InvestmentDto,
  RefundLineDto,
  ReservationDto,
} from './dto/project-response.dto';
import { Project } from './entities/project.entity';
import { Refund } from './entities/refund.entity';
import { Reservation } from './entities/reservation.entity';
import { ProjectStage, ReservationStatus } from './project.enums';
import { estimate, ProjectViews } from './project-views';
import { ProjectsService } from './projects.service';
import { ErrorCode } from '../../common/errors/error-code';

/** Who may read payment references. */
const SEES_PAYMENTS: ReadonlySet<Role> = new Set([
  Role.SuperAdmin,
  Role.Admin,
  Role.Accounts,
  Role.Auditor,
]);

/**
 * Slot reservations, payment confirmation and refunds.
 *
 * A payment reference is encrypted and saved before its transaction is sent,
 * guarded so only one confirmation of a reservation can be in flight. A
 * rejection by the contracts (decided before broadcast) removes it again, so
 * a reference the ledger accepted can never be lost, and one it refused
 * never lingers.
 */
@Injectable()
export class ReservationsService {
  private readonly paymentRefSecret: string;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly dataSource: DataSource,
    @InjectRepository(Reservation)
    private readonly reservations: Repository<Reservation>,
    @InjectRepository(Refund) private readonly refunds: Repository<Refund>,
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>,
    private readonly projects: ProjectsService,
    private readonly views: ProjectViews,
    private readonly crypto: IdentityCryptoService,
    private readonly tx: TransactionService,
    private readonly receipts: ReceiptApplier,
  ) {
    this.paymentRefSecret = config.get('PAYMENT_REF_SECRET', { infer: true });
  }

  // --- Investors ---

  async reserve(
    actor: AuthUser,
    projectId: string,
    slots: number,
  ): Promise<ReservationDto> {
    const project = await this.projects.visible(actor, projectId);
    if (project.stage !== ProjectStage.OpenForFunding) {
      throw new ConflictException({
        message: 'This project is not open for funding',
        code: ErrorCode.ProjectNotOpen,
      });
    }
    const available =
      project.totalSlots - project.issuedSlots - project.reservedSlots;
    if (slots > available) {
      throw new ConflictException({
        message: `Only ${available} slot${available === 1 ? ' is' : 's are'} available`,
        code: ErrorCode.NotEnoughSlots,
        details: { available },
      });
    }
    const result = await this.tx.send(actor.keyIndex, 'ProjectLedger', (c) =>
      c.reserveSlots.populateTransaction(uuidToBytes32(projectId), slots),
    );
    await this.receipts.apply(result);
    const event = result.events.find((e) => e.name === 'SlotsReserved');
    return this.findOne(actor, Number(event!.args.reservationId));
  }

  /** The investor's own pending reservation, or any for an admin. */
  async cancel(actor: AuthUser, id: number): Promise<ReservationDto> {
    const reservation = await this.load(id);
    if (actor.role === Role.Investor && reservation.investorId !== actor.id) {
      throw new NotFoundException({
        message: 'Reservation not found',
        code: ErrorCode.ReservationNotFound,
      });
    }
    if (reservation.status !== ReservationStatus.Pending) {
      throw new ConflictException({
        message: `This reservation is ${reservation.status ?? 'not active'}`,
        code: ErrorCode.ReservationWrongStatus,
        details: { status: reservation.status ?? null },
      });
    }
    await this.send(actor, (c) => c.cancelReservation.populateTransaction(id));
    return this.findOne(actor, id);
  }

  /** What an investor holds: issued slots per project, plus slots still awaiting payment. */
  async investments(actor: AuthUser): Promise<InvestmentDto[]> {
    const rows: Array<{ project_id: string; issued: string; pending: string }> =
      await this.dataSource.query(
        `SELECT project_id,
                SUM(slots) FILTER (WHERE status = 'confirmed') AS issued,
                SUM(slots) FILTER (WHERE status = 'pending')   AS pending
           FROM reservations
          WHERE investor_id = $1 AND status IN ('confirmed', 'pending')
          GROUP BY project_id`,
        [actor.id],
      );
    if (rows.length === 0) return [];
    const projects = await this.projectsRepo.findBy({
      id: In(rows.map((r) => r.project_id)),
    });
    const byId = new Map(
      (await this.views.many(projects)).map((p) => [p.id, p]),
    );
    const raw = new Map(projects.map((p) => [p.id, p]));
    return rows.map((r) => {
      const p = raw.get(r.project_id)!;
      const slots = Number(r.issued ?? 0);
      const invested = p.slotPrice * BigInt(slots);
      return {
        project: byId.get(r.project_id)!,
        slots,
        invested: poishaToTaka(invested),
        pendingSlots: Number(r.pending ?? 0),
        estimatedReturn: estimate(p, invested),
      };
    });
  }

  // --- Accounts ---

  /**
   * Issues the reserved slots once Accounts has the money. The reference is
   * saved encrypted first; the ledger gets its keyed hash, which it refuses
   * to accept twice.
   */
  async confirm(
    actor: AuthUser,
    id: number,
    paymentReference: string,
  ): Promise<ReservationDto> {
    const ref = normalise(paymentReference);
    const hash = hashPaymentRef(ref, this.paymentRefSecret);
    const reservation = await this.load(id);
    if (reservation.status !== ReservationStatus.Pending) {
      throw new ConflictException({
        message: `This reservation is ${reservation.status ?? 'not active'}`,
        code: ErrorCode.ReservationWrongStatus,
        details: { status: reservation.status ?? null },
      });
    }

    try {
      const saved = await this.reservations
        .createQueryBuilder()
        .update()
        .set({
          paymentRefEnc: this.crypto.encrypt(ref, reservationContext(id)),
          paymentRefHash: hash,
          confirmedById: actor.id,
        })
        .where('id = :id AND status = :pending', {
          id,
          pending: ReservationStatus.Pending,
        })
        .andWhere('(payment_ref_hash IS NULL OR payment_ref_hash = :hash)', {
          hash,
        })
        .execute();
      if (saved.affected !== 1) {
        throw new ConflictException({
          message: 'This reservation is already being confirmed',
          code: ErrorCode.ReservationConfirming,
        });
      }
    } catch (error) {
      throw duplicateRef(error);
    }

    try {
      await this.send(actor, (c) =>
        c.confirmPayment.populateTransaction(id, hash),
      );
    } catch (error) {
      if (error instanceof ContractRevertException) {
        await this.reservations.update(
          { id, paymentRefHash: hash, status: ReservationStatus.Pending },
          { paymentRefEnc: null, paymentRefHash: null, confirmedById: null },
        );
      }
      throw error;
    }
    return this.findOne(actor, id);
  }

  /** Records a refund Accounts paid to an investor of a cancelled project. */
  async recordRefund(
    actor: AuthUser,
    projectId: string,
    investorId: string,
    paymentReference: string,
  ): Promise<RefundLineDto[]> {
    const project = await this.projects.visible(actor, projectId);
    if (project.stage !== ProjectStage.Cancelled) {
      throw new ConflictException({
        message: 'Refunds are recorded only for cancelled projects',
        code: ErrorCode.RefundProjectNotCancelled,
      });
    }
    const due = (await this.holdings(projectId)).find(
      (h) => h.investorId === investorId,
    );
    if (!due)
      throw new UnprocessableEntityException({
        message: 'This investor holds no slots in the project',
        code: ErrorCode.NoSlotsHeld,
      });

    const ref = normalise(paymentReference);
    const hash = hashPaymentRef(ref, this.paymentRefSecret);
    const existing = await this.refunds.findOneBy({ projectId, investorId });
    if (existing?.confirmed)
      throw new ConflictException({
        message: 'Already refunded',
        code: ErrorCode.AlreadyRefunded,
      });
    if (existing && existing.paymentRefHash !== hash) {
      throw new ConflictException({
        message: 'A different refund for this investor is being recorded',
        code: ErrorCode.RefundInProgress,
      });
    }
    if (!existing) {
      try {
        await this.refunds.insert({
          projectId,
          investorId,
          amount: project.slotPrice * BigInt(due.slots),
          paymentRefEnc: this.crypto.encrypt(
            ref,
            refundContext(projectId, investorId),
          ),
          paymentRefHash: hash,
          confirmed: false,
          recordedById: actor.id,
          recordedAt: new Date(),
        });
      } catch (error) {
        throw duplicateRef(error);
      }
    }

    try {
      await this.send(actor, (c) =>
        c.recordRefund.populateTransaction(
          uuidToBytes32(projectId),
          uuidToBytes32(investorId),
          hash,
        ),
      );
    } catch (error) {
      if (error instanceof ContractRevertException) {
        await this.refunds.delete({ projectId, investorId, confirmed: false });
      }
      throw error;
    }
    return this.refundLines(actor, projectId);
  }

  // --- Reading ---

  async list(
    actor: AuthUser,
    q: ListReservationsQueryDto,
  ): Promise<Paginated<ReservationDto>> {
    const qb = this.reservations
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.project', 'p')
      .where('r.status IS NOT NULL');
    if (actor.role === Role.Investor)
      qb.andWhere('r.investor_id = :me', { me: actor.id });
    if (q.status) qb.andWhere('r.status = :status', { status: q.status });
    if (q.projectId) qb.andWhere('r.project_id = :pid', { pid: q.projectId });
    const [rows, total] = await qb
      .orderBy('r.id', 'DESC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.reservationViews(actor, rows), total, q);
  }

  async findOne(actor: AuthUser, id: number): Promise<ReservationDto> {
    const row = await this.reservations.findOne({
      where: { id },
      relations: { project: true },
    });
    if (
      !row ||
      row.status === null ||
      (actor.role === Role.Investor && row.investorId !== actor.id)
    ) {
      throw new NotFoundException({
        message: 'Reservation not found',
        code: ErrorCode.ReservationNotFound,
      });
    }
    return (await this.reservationViews(actor, [row]))[0];
  }

  async holders(actor: AuthUser, projectId: string): Promise<HoldingDto[]> {
    const project = await this.projects.visible(actor, projectId);
    const rows = await this.holdings(projectId);
    const names = await this.views.names(rows.map((r) => r.investorId));
    return rows.map((r) => ({
      investor: { id: r.investorId, fullName: names.get(r.investorId) ?? '' },
      slots: r.slots,
      amount: poishaToTaka(project.slotPrice * BigInt(r.slots)),
    }));
  }

  /** Every holder of a cancelled project with what is due and what was paid back. */
  async refundLines(
    actor: AuthUser,
    projectId: string,
  ): Promise<RefundLineDto[]> {
    const project = await this.projects.visible(actor, projectId);
    const [holdings, refunds] = await Promise.all([
      this.holdings(projectId),
      this.refunds.findBy({ projectId }),
    ]);
    const byInvestor = new Map(refunds.map((r) => [r.investorId, r]));
    const names = await this.views.names(holdings.map((h) => h.investorId));
    return holdings.map((h) => {
      const refund = byInvestor.get(h.investorId);
      return {
        investor: { id: h.investorId, fullName: names.get(h.investorId) ?? '' },
        slots: h.slots,
        amount: poishaToTaka(project.slotPrice * BigInt(h.slots)),
        status: !refund ? 'due' : refund.confirmed ? 'refunded' : 'submitted',
        paymentReference:
          refund?.paymentRefEnc && SEES_PAYMENTS.has(actor.role)
            ? this.crypto.decrypt(
                refund.paymentRefEnc,
                refundContext(projectId, h.investorId),
              )
            : null,
        recordedAt: refund?.recordedAt ?? null,
      };
    });
  }

  // --- Helpers ---

  /** Issued slots per investor, from confirmed reservations (one indexed scan). */
  private async holdings(
    projectId: string,
  ): Promise<Array<{ investorId: string; slots: number }>> {
    const rows: Array<{ investor_id: string; slots: string }> =
      await this.dataSource.query(
        `SELECT investor_id, SUM(slots) AS slots
         FROM reservations
        WHERE project_id = $1 AND status = 'confirmed'
        GROUP BY investor_id
        ORDER BY MIN(id)`,
        [projectId],
      );
    return rows.map((r) => ({
      investorId: r.investor_id,
      slots: Number(r.slots),
    }));
  }

  private async reservationViews(
    actor: AuthUser,
    rows: Reservation[],
  ): Promise<ReservationDto[]> {
    const names = await this.views.names(rows.map((r) => r.investorId));
    const seesPayments = SEES_PAYMENTS.has(actor.role);
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectTitle: r.project!.title,
      investor: { id: r.investorId, fullName: names.get(r.investorId) ?? '' },
      slots: r.slots,
      amount: poishaToTaka(r.project!.slotPrice * BigInt(r.slots)),
      status: r.status!,
      reservedAt: r.reservedAt,
      expiresAt: r.expiresAt,
      closedAt: r.closedAt,
      ...(seesPayments && {
        paymentReference: r.paymentRefEnc
          ? this.crypto.decrypt(r.paymentRefEnc, reservationContext(r.id))
          : null,
      }),
    }));
  }

  private async load(id: number): Promise<Reservation> {
    const row = await this.reservations.findOneBy({ id });
    if (!row || row.status === null)
      throw new NotFoundException({
        message: 'Reservation not found',
        code: ErrorCode.ReservationNotFound,
      });
    return row;
  }

  private async send(
    actor: AuthUser,
    build: (c: ProjectLedger) => Promise<ContractTransaction>,
  ): Promise<void> {
    const result = await this.tx.send(actor.keyIndex, 'ProjectLedger', build);
    await this.receipts.apply(result);
  }
}

const reservationContext = (id: number) => `reservations.payment_ref:${id}`;
const refundContext = (projectId: string, investorId: string) =>
  `refunds.payment_ref:${projectId}:${investorId}`;

function normalise(ref: string): string {
  try {
    return normalisePaymentRef(ref);
  } catch (error) {
    throw new UnprocessableEntityException({
      message: (error as Error).message,
      code: ErrorCode.PaymentRefInvalid,
    });
  }
}

function duplicateRef(error: unknown): unknown {
  if (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string }).code === '23505'
  ) {
    return new ConflictException({
      message: 'This payment reference was already used',
      code: ErrorCode.PaymentRefAlreadyUsed,
    });
  }
  return error;
}
