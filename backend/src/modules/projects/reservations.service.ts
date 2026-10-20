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
import { PersonSearch } from '../users/person-search';
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
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.ACCOUNTS,
  Role.AUDITOR,
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
    private readonly search: PersonSearch,
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
    if (project.stage !== ProjectStage.OPEN_FOR_FUNDING) {
      throw new ConflictException({
        message: 'This project is not open for funding',
        code: ErrorCode.PROJECT_NOT_OPEN,
      });
    }
    const available =
      project.totalSlots - project.issuedSlots - project.reservedSlots;
    if (slots > available) {
      throw new ConflictException({
        message: `Only ${available} slot${available === 1 ? ' is' : 's are'} available`,
        code: ErrorCode.NOT_ENOUGH_SLOTS,
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

  /**
   * The investor's own pending reservation while they have sent nothing
   * (no proof waiting or accepted), or any for an admin: money already
   * received is then refunded by Accounts.
   */
  async cancel(actor: AuthUser, id: number): Promise<ReservationDto> {
    const reservation = await this.load(id);
    if (actor.role === Role.INVESTOR && reservation.investorId !== actor.id) {
      throw new NotFoundException({
        message: 'Reservation not found',
        code: ErrorCode.RESERVATION_NOT_FOUND,
      });
    }
    if (actor.role === Role.INVESTOR) {
      const { paid, underReview } = (await this.payments([id])).get(id) ?? NONE;
      if (paid > 0n || underReview > 0n) {
        throw new ConflictException({
          message:
            'Money was sent for this booking: ask WeGro to cancel it, and it is refunded',
          code: ErrorCode.BOOKING_HAS_PAYMENTS,
        });
      }
    }
    if (reservation.status !== ReservationStatus.PENDING) {
      throw new ConflictException({
        message: `This reservation is ${reservation.status ?? 'not active'}`,
        code: ErrorCode.RESERVATION_WRONG_STATUS,
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
   * Issues the reserved slots once Accounts has the money, for a booking
   * paid without proofs in the app (proofs are accepted one by one instead,
   * which confirms the booking when they add up).
   */
  async confirm(
    actor: AuthUser,
    id: number,
    paymentReference: string,
  ): Promise<ReservationDto> {
    const { paid, underReview } = (await this.payments([id])).get(id) ?? NONE;
    if (paid > 0n || underReview > 0n) {
      throw new ConflictException({
        message: 'This booking has payment proofs: review them instead',
        code: ErrorCode.PROOFS_TO_REVIEW,
      });
    }
    return this.confirmWith(actor, id, normalise(paymentReference));
  }

  /**
   * The reference is saved encrypted first; the ledger gets its keyed hash,
   * which it refuses to accept twice. `ref` is already normalised (several
   * proofs' references are combined by the caller).
   */
  async confirmWith(
    actor: AuthUser,
    id: number,
    ref: string,
  ): Promise<ReservationDto> {
    const hash = hashPaymentRef(ref, this.paymentRefSecret);
    const reservation = await this.load(id);
    if (reservation.status !== ReservationStatus.PENDING) {
      throw new ConflictException({
        message: `This reservation is ${reservation.status ?? 'not active'}`,
        code: ErrorCode.RESERVATION_WRONG_STATUS,
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
          pending: ReservationStatus.PENDING,
        })
        .andWhere('(payment_ref_hash IS NULL OR payment_ref_hash = :hash)', {
          hash,
        })
        .execute();
      if (saved.affected !== 1) {
        throw new ConflictException({
          message: 'This reservation is already being confirmed',
          code: ErrorCode.RESERVATION_CONFIRMING,
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
          { id, paymentRefHash: hash, status: ReservationStatus.PENDING },
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
    if (project.stage !== ProjectStage.CANCELLED) {
      throw new ConflictException({
        message: 'Refunds are recorded only for cancelled projects',
        code: ErrorCode.REFUND_PROJECT_NOT_CANCELLED,
      });
    }
    const due = (await this.holdings(projectId)).find(
      (h) => h.investorId === investorId,
    );
    if (!due)
      throw new UnprocessableEntityException({
        message: 'This investor holds no slots in the project',
        code: ErrorCode.NO_SLOTS_HELD,
      });

    const ref = normalise(paymentReference);
    const hash = hashPaymentRef(ref, this.paymentRefSecret);
    const existing = await this.refunds.findOneBy({ projectId, investorId });
    if (existing?.confirmed)
      throw new ConflictException({
        message: 'Already refunded',
        code: ErrorCode.ALREADY_REFUNDED,
      });
    if (existing && existing.paymentRefHash !== hash) {
      throw new ConflictException({
        message: 'A different refund for this investor is being recorded',
        code: ErrorCode.REFUND_IN_PROGRESS,
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
    if (actor.role === Role.INVESTOR)
      qb.andWhere('r.investor_id = :me', { me: actor.id });
    if (q.status) qb.andWhere('r.status = :status', { status: q.status });
    if (q.projectId) qb.andWhere('r.project_id = :pid', { pid: q.projectId });
    if (actor.role !== Role.INVESTOR)
      this.search.apply(qb, 'r.investor_id', q.q);
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
      (actor.role === Role.INVESTOR && row.investorId !== actor.id)
    ) {
      throw new NotFoundException({
        message: 'Reservation not found',
        code: ErrorCode.RESERVATION_NOT_FOUND,
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

  /**
   * Accepted and still-reviewed proof amounts per reservation, in one
   * grouped query.
   */
  async payments(
    ids: number[],
  ): Promise<Map<number, { paid: bigint; underReview: bigint }>> {
    if (ids.length === 0) return new Map();
    const rows: Array<{
      reservation_id: string;
      paid: string;
      review: string;
    }> = await this.dataSource.query(
      `SELECT reservation_id,
                COALESCE(SUM(amount) FILTER (WHERE status = 'accepted'), 0) AS paid,
                COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS review
           FROM payment_proofs
          WHERE reservation_id = ANY($1::bigint[])
          GROUP BY reservation_id`,
      [ids],
    );
    return new Map(
      rows.map((r) => [
        Number(r.reservation_id),
        { paid: BigInt(r.paid), underReview: BigInt(r.review) },
      ]),
    );
  }

  /** Stops the clock with the investor's own key, as their proof arrives. */
  async pauseOnLedger(actor: AuthUser, id: number): Promise<void> {
    await this.send(actor, (c) => c.pauseReservation.populateTransaction(id));
  }

  /** Accounts restarts the clock once no proof is under review. */
  async resumeOnLedger(actor: AuthUser, id: number): Promise<void> {
    await this.send(actor, (c) => c.resumeReservation.populateTransaction(id));
  }

  private async reservationViews(
    actor: AuthUser,
    rows: Reservation[],
  ): Promise<ReservationDto[]> {
    const [names, payments] = await Promise.all([
      this.views.names(rows.map((r) => r.investorId)),
      this.payments(rows.map((r) => r.id)),
    ]);
    const seesPayments = SEES_PAYMENTS.has(actor.role);
    return rows.map((r) => {
      const amount = r.project!.slotPrice * BigInt(r.slots);
      const { paid, underReview } = payments.get(r.id) ?? NONE;
      const left = amount - paid - underReview;
      return {
        id: r.id,
        projectId: r.projectId,
        projectTitle: r.project!.title,
        investor: { id: r.investorId, fullName: names.get(r.investorId) ?? '' },
        slots: r.slots,
        amount: poishaToTaka(r.project!.slotPrice * BigInt(r.slots)),
        status: r.status!,
        reservedAt: r.reservedAt,
        expiresAt: r.expiresAt,
        onHold: r.pausedRemaining !== null,
        pausedRemainingSeconds: r.pausedRemaining,
        paid: poishaToTaka(paid),
        underReview: poishaToTaka(underReview),
        remaining: poishaToTaka(left > 0n ? left : 0n),
        closedAt: r.closedAt,
        ...(seesPayments && {
          paymentReference: r.paymentRefEnc
            ? this.crypto.decrypt(r.paymentRefEnc, reservationContext(r.id))
            : null,
        }),
      };
    });
  }

  private async load(id: number): Promise<Reservation> {
    const row = await this.reservations.findOneBy({ id });
    if (!row || row.status === null)
      throw new NotFoundException({
        message: 'Reservation not found',
        code: ErrorCode.RESERVATION_NOT_FOUND,
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

const NONE = { paid: 0n, underReview: 0n };

const reservationContext = (id: number) => `reservations.payment_ref:${id}`;
const refundContext = (projectId: string, investorId: string) =>
  `refunds.payment_ref:${projectId}:${investorId}`;

function normalise(ref: string): string {
  try {
    return normalisePaymentRef(ref);
  } catch (error) {
    throw new UnprocessableEntityException({
      message: (error as Error).message,
      code: ErrorCode.PAYMENT_REF_INVALID,
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
      code: ErrorCode.PAYMENT_REF_ALREADY_USED,
    });
  }
  return error;
}
