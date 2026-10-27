import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import { poishaToTaka, takaToPoisha } from '../../blockchain/utils/money';
import {
  hashPaymentRef,
  normalisePaymentRef,
} from '../../blockchain/utils/payment-ref';
import { IdentityCryptoService } from '../../common/crypto/identity-crypto.service';
import { Paginated } from '../../common/dto/pagination.dto';
import { ErrorCode } from '../../common/errors/error-code';
import { bdDate } from '../../common/time/bd-dates';
import type { EnvironmentVariables } from '../../config/env.validation';
import type { AuthUser } from '../auth/auth-user';
import { BankListService } from '../bank-list/bank-list.service';
import {
  NotificationCategory,
  NotificationKind,
} from '../notifications/notification.enums';
import {
  type Note,
  NotificationWriter,
} from '../notifications/notification-writer';
import { PersonSearch } from '../users/person-search';
import { Role } from '../users/roles';
import type {
  ListProofsQueryDto,
  PaymentProofDto,
  SubmitProofDto,
} from './dto/payment-proof.dto';
import { PaymentProof } from './entities/payment-proof.entity';
import { PaymentProofFile } from './entities/payment-proof-file.entity';
import { Reservation } from './entities/reservation.entity';
import { PaymentMethod, ProofStatus } from './payment-proof.enums';
import { ReservationStatus } from './project.enums';
import { ProjectViews } from './project-views';
import { ProofFiles } from './proof-files';
import { ReservationsService } from './reservations.service';

/** Who reads every proof and its references. */
const SEES_PAYMENTS: ReadonlySet<Role> = new Set([
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.ACCOUNTS,
  Role.AUDITOR,
]);

/** Methods that go through a bank, which is then named. */
const BANKED: ReadonlySet<PaymentMethod> = new Set([
  PaymentMethod.BANK_DEPOSIT,
  PaymentMethod.CHEQUE,
]);

/**
 * Investors' proofs of payment for their bookings, and Accounts' review.
 *
 * A proof sent before the deadline stops the booking's clock on the ledger
 * (signed by the investor), so a slow review never costs them their units.
 * Accounts accepts each proof with the reference on the bank statement, or
 * rejects it with a reason; when no proof is left under review the clock
 * runs on, and when accepted proofs add up to the amount the booking is
 * confirmed on the ledger. Money accepted for a booking that ended without
 * being confirmed is refunded, recorded here with its reference.
 */
@Injectable()
export class PaymentProofsService {
  private readonly logger = new Logger(PaymentProofsService.name);
  private readonly paymentRefSecret: string;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly dataSource: DataSource,
    @InjectRepository(PaymentProof)
    private readonly proofs: Repository<PaymentProof>,
    @InjectRepository(PaymentProofFile)
    private readonly files: Repository<PaymentProofFile>,
    @InjectRepository(Reservation)
    private readonly reservations: Repository<Reservation>,
    private readonly bookings: ReservationsService,
    private readonly store: ProofFiles,
    private readonly crypto: IdentityCryptoService,
    private readonly bankList: BankListService,
    private readonly views: ProjectViews,
    private readonly writer: NotificationWriter,
    private readonly search: PersonSearch,
  ) {
    this.paymentRefSecret = config.get('PAYMENT_REF_SECRET', { infer: true });
  }

  // --- Investors ---

  async submit(
    actor: AuthUser,
    reservationId: number,
    dto: SubmitProofDto,
    uploads: Buffer[],
  ): Promise<PaymentProofDto> {
    const reservation = await this.reservationOf(actor, reservationId);
    if (reservation.status !== ReservationStatus.PENDING) {
      throw new ConflictException({
        message: `This booking is ${reservation.status ?? 'not active'}`,
        code: ErrorCode.RESERVATION_WRONG_STATUS,
        details: { status: reservation.status ?? null },
      });
    }
    const types = this.store.check(uploads);
    const amount = takaToPoisha(dto.amount);
    const total = reservation.project!.slotPrice * BigInt(reservation.slots);
    const { paid, underReview } =
      (await this.bookings.payments([reservationId])).get(reservationId) ??
      NONE;
    const left = total - paid - underReview;
    if (amount <= 0n || amount > left) {
      throw new UnprocessableEntityException({
        message: `The amount must be above zero and at most ${poishaToTaka(left)}, what is left to pay`,
        code: ErrorCode.PROOF_AMOUNT_INVALID,
        details: { remaining: poishaToTaka(left) },
      });
    }
    if (dto.transferredOn > bdDate(new Date())) {
      throw new UnprocessableEntityException({
        message: 'The transfer date cannot be in the future',
        code: ErrorCode.PROOF_DATE_FUTURE,
      });
    }
    // Deposits and cheques name the branch paid from; the list gives its
    // bank, district and routing number, kept as they were at the time.
    let paidFrom: Pick<
      PaymentProof,
      'bankName' | 'branchName' | 'districtName' | 'routingNumber'
    > = {
      bankName: null,
      branchName: null,
      districtName: null,
      routingNumber: null,
    };
    if (BANKED.has(dto.method)) {
      const branch = dto.routingNumber
        ? await this.bankList.find(dto.routingNumber)
        : null;
      if (!branch) {
        throw new UnprocessableEntityException({
          message:
            'Choose the bank, district and branch the money was paid from',
          code: ErrorCode.PROOF_BANK_REQUIRED,
        });
      }
      paidFrom = {
        bankName: branch.bank.name,
        branchName: branch.name,
        districtName: branch.district.name,
        routingNumber: branch.routingNumber,
      };
    }

    // Files first (encrypted); a row only points at files that exist.
    const sealed = await Promise.all(
      uploads.map((data, i) => this.store.store(data, types[i]!)),
    );
    const proofId = randomUUID();
    const proof = await this.dataSource
      .transaction(async (m) => {
        await m.insert(PaymentProof, {
          id: proofId,
          reservationId,
          investorId: actor.id,
          amount,
          transferredOn: dto.transferredOn,
          method: dto.method,
          ...paidFrom,
          // Bound to the row: the reference opens only for this proof.
          referenceEnc: dto.reference
            ? this.crypto.encrypt(dto.reference, referenceContext(proofId))
            : null,
          note: dto.note ?? null,
          status: ProofStatus.PENDING,
        });
        await m.insert(
          PaymentProofFile,
          sealed.map((f) => ({ ...f, proofId })),
        );
        return { id: proofId };
      })
      .catch(async (error: unknown) => {
        await Promise.all(sealed.map((f) => this.store.remove(f.storagePath)));
        throw error;
      });

    // Stop the clock, unless an earlier proof already did.
    if (reservation.pausedRemaining === null) {
      try {
        await this.bookings.pauseOnLedger(actor, reservationId);
      } catch (error) {
        if (error instanceof ContractRevertException) {
          // Too late (the deadline passed) or no longer pending: undo the proof.
          await this.proofs.delete({ id: proof.id });
          await Promise.all(
            sealed.map((f) => this.store.remove(f.storagePath)),
          );
        }
        throw error;
      }
    }
    await this.notify(
      await this.writer.withRole(this.dataSource.manager, [Role.ACCOUNTS], []),
      {
        category: NotificationCategory.ACTION,
        kind: NotificationKind.PAYMENT_PROOF_SUBMITTED,
        title: `Payment proof for booking #${reservationId} awaiting review`,
        params: {
          reservationId: String(reservationId),
          amount: poishaToTaka(amount),
        },
        subject: { type: 'reservation', id: reservationId },
        key: `proof:${proof.id}:submitted`,
      },
    );
    return this.one(actor, proof.id);
  }

  /** A booking's proofs, newest first: the investor's own, or any for staff. */
  async forReservation(
    actor: AuthUser,
    reservationId: number,
  ): Promise<PaymentProofDto[]> {
    await this.reservationOf(actor, reservationId);
    const rows = await this.proofs.find({
      where: { reservationId },
      relations: { files: true },
      order: { createdAt: 'DESC' },
    });
    return this.dtos(actor, rows);
  }

  // --- Accounts ---

  /** Accounts' queue: proofs by status (oldest first), or refunds due; searchable by investor. */
  async list(
    actor: AuthUser,
    q: ListProofsQueryDto,
  ): Promise<Paginated<PaymentProofDto>> {
    const qb = this.proofs
      .createQueryBuilder('pp')
      .leftJoinAndSelect('pp.files', 'f')
      .innerJoin(Reservation, 'r', 'r.id = pp.reservation_id');
    if (q.status) qb.andWhere('pp.status = :status', { status: q.status });
    if (q.refund) {
      qb.andWhere('pp.status = :accepted', { accepted: ProofStatus.ACCEPTED })
        .andWhere('r.status IN (:...ended)', {
          ended: [ReservationStatus.CANCELLED, ReservationStatus.EXPIRED],
        })
        .andWhere(
          q.refund === 'due'
            ? 'pp.refunded_at IS NULL'
            : 'pp.refunded_at IS NOT NULL',
        );
    }
    this.search.apply(qb, 'pp.investor_id', q.q);
    const [rows, total] = await qb
      .orderBy(
        'pp.created_at',
        q.status === ProofStatus.PENDING ? 'ASC' : 'DESC',
      )
      .addOrderBy('pp.id', 'ASC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.dtos(actor, rows), total, q);
  }

  /**
   * Accepts a proof against the statement. When accepted proofs cover the
   * amount the booking is confirmed on the ledger; otherwise, with nothing
   * else under review, its clock runs on for the rest.
   */
  async accept(
    actor: AuthUser,
    id: string,
    paymentReference: string,
  ): Promise<PaymentProofDto> {
    const ref = normaliseRef(paymentReference);
    const proof = await this.pending(id);
    try {
      const done = await this.proofs.update(
        { id, status: ProofStatus.PENDING },
        {
          status: ProofStatus.ACCEPTED,
          verifiedRefEnc: this.crypto.encrypt(ref, verifiedContext(id)),
          verifiedRefHash: hashPaymentRef(ref, this.paymentRefSecret),
          decidedById: actor.id,
          decidedAt: new Date(),
        },
      );
      if (done.affected !== 1) throw changedMeanwhile();
    } catch (error) {
      throw duplicateRef(error);
    }

    const reservation = await this.reservations.findOneOrFail({
      where: { id: proof.reservationId },
      relations: { project: true },
    });
    if (reservation.status === ReservationStatus.PENDING) {
      const total = reservation.project!.slotPrice * BigInt(reservation.slots);
      const { paid, underReview } =
        (await this.bookings.payments([reservation.id])).get(reservation.id) ??
        NONE;
      if (paid >= total) {
        await this.bookings.confirmWith(
          actor,
          reservation.id,
          await this.combinedReference(reservation.id),
        );
      } else if (underReview === 0n && reservation.pausedRemaining !== null) {
        await this.bookings.resumeOnLedger(actor, reservation.id);
      }
    }
    await this.notify([proof.investorId], {
      category: NotificationCategory.OUTCOME,
      kind: NotificationKind.PAYMENT_PROOF_ACCEPTED,
      title: `Your payment of ${poishaToTaka(proof.amount)} for booking #${proof.reservationId} is accepted`,
      params: {
        reservationId: String(proof.reservationId),
        amount: poishaToTaka(proof.amount),
      },
      subject: { type: 'reservation', id: proof.reservationId },
      key: `proof:${id}:accepted`,
    });
    return this.one(actor, id);
  }

  /** Turns a proof down; with nothing else under review, the booking's clock runs on. */
  async reject(
    actor: AuthUser,
    id: string,
    reason: string,
  ): Promise<PaymentProofDto> {
    const proof = await this.pending(id);
    const done = await this.proofs.update(
      { id, status: ProofStatus.PENDING },
      {
        status: ProofStatus.REJECTED,
        rejectionReason: reason,
        decidedById: actor.id,
        decidedAt: new Date(),
      },
    );
    if (done.affected !== 1) throw changedMeanwhile();
    const reservation = await this.reservations.findOneByOrFail({
      id: proof.reservationId,
    });
    if (
      reservation.status === ReservationStatus.PENDING &&
      reservation.pausedRemaining !== null
    ) {
      const { underReview } =
        (await this.bookings.payments([reservation.id])).get(reservation.id) ??
        NONE;
      if (underReview === 0n) {
        await this.bookings.resumeOnLedger(actor, reservation.id);
      }
    }
    await this.notify([proof.investorId], {
      category: NotificationCategory.OUTCOME,
      kind: NotificationKind.PAYMENT_PROOF_REJECTED,
      title: `Your payment proof for booking #${proof.reservationId} was not accepted`,
      body: reason,
      params: { reservationId: String(proof.reservationId), reason },
      subject: { type: 'reservation', id: proof.reservationId },
      key: `proof:${id}:rejected`,
    });
    return this.one(actor, id);
  }

  /** Money accepted for a booking that ended unconfirmed, paid back: its reference, used once. */
  async recordRefund(
    actor: AuthUser,
    id: string,
    paymentReference: string,
  ): Promise<PaymentProofDto> {
    const ref = normaliseRef(paymentReference);
    const proof = await this.proofs.findOneBy({ id });
    if (!proof) throw notFound();
    const reservation = await this.reservations.findOneByOrFail({
      id: proof.reservationId,
    });
    const ended =
      reservation.status === ReservationStatus.CANCELLED ||
      reservation.status === ReservationStatus.EXPIRED;
    if (proof.status !== ProofStatus.ACCEPTED || !ended) {
      throw new ConflictException({
        message:
          'Only money accepted for a booking that ended unconfirmed is refunded',
        code: ErrorCode.PROOF_NOT_REFUNDABLE,
      });
    }
    try {
      const done = await this.proofs
        .createQueryBuilder()
        .update()
        .set({
          refundRefEnc: this.crypto.encrypt(ref, refundContext(id)),
          refundRefHash: hashPaymentRef(ref, this.paymentRefSecret),
          refundedById: actor.id,
          refundedAt: new Date(),
        })
        .where('id = :id AND refunded_at IS NULL', { id })
        .execute();
      if (done.affected !== 1) {
        throw new ConflictException({
          message: 'Already refunded',
          code: ErrorCode.ALREADY_REFUNDED,
        });
      }
    } catch (error) {
      throw duplicateRef(error);
    }
    await this.notify([proof.investorId], {
      category: NotificationCategory.OUTCOME,
      kind: NotificationKind.PAYMENT_REFUNDED,
      title: `${poishaToTaka(proof.amount)} sent for booking #${proof.reservationId} was refunded`,
      params: {
        reservationId: String(proof.reservationId),
        amount: poishaToTaka(proof.amount),
      },
      subject: { type: 'reservation', id: proof.reservationId },
      key: `proof:${id}:refunded`,
    });
    return this.one(actor, id);
  }

  /** A proof's file, decrypted: for the investor who sent it and payment staff. */
  async file(
    actor: AuthUser,
    fileId: string,
  ): Promise<{ data: Buffer; mimeType: string }> {
    const file = await this.files.findOne({
      where: { id: fileId },
      relations: { proof: true },
    });
    if (
      !file ||
      (!SEES_PAYMENTS.has(actor.role) && file.proof!.investorId !== actor.id)
    ) {
      throw new NotFoundException({
        message: 'File not found',
        code: ErrorCode.PROOF_FILE_MISSING,
      });
    }
    const data = await this.store.read(file);
    if (createHash('sha256').update(data).digest('hex') !== file.sha256) {
      this.logger.error(`Proof file ${fileId} does not match its hash`);
    }
    return { data, mimeType: file.mimeType };
  }

  // --- Internals ---

  private async one(actor: AuthUser, id: string): Promise<PaymentProofDto> {
    const row = await this.proofs.findOneOrFail({
      where: { id },
      relations: { files: true },
    });
    return (await this.dtos(actor, [row]))[0]!;
  }

  private async dtos(
    actor: AuthUser,
    rows: PaymentProof[],
  ): Promise<PaymentProofDto[]> {
    if (rows.length === 0) return [];
    const reservations = await this.reservations.find({
      where: { id: In([...new Set(rows.map((r) => r.reservationId))]) },
      relations: { project: true },
    });
    const byId = new Map(reservations.map((r) => [r.id, r]));
    const names = await this.views.names(
      rows.flatMap((r) => [r.investorId, r.decidedById ?? r.investorId]),
    );
    const seesPayments = SEES_PAYMENTS.has(actor.role);
    return rows.map((p) => {
      const r = byId.get(p.reservationId)!;
      const ended =
        r.status === ReservationStatus.CANCELLED ||
        r.status === ReservationStatus.EXPIRED;
      return {
        id: p.id,
        reservationId: p.reservationId,
        projectId: r.projectId,
        projectTitle: r.project!.title,
        investor: { id: p.investorId, fullName: names.get(p.investorId) ?? '' },
        amount: poishaToTaka(p.amount),
        reservationAmount: poishaToTaka(r.project!.slotPrice * BigInt(r.slots)),
        reservationStatus: r.status ?? 'pending',
        transferredOn: p.transferredOn,
        method: p.method,
        bankName: p.bankName,
        branchName: p.branchName,
        districtName: p.districtName,
        routingNumber: p.routingNumber,
        reference: p.referenceEnc
          ? this.crypto.decrypt(p.referenceEnc, referenceContext(p.id))
          : null,
        note: p.note,
        files: (p.files ?? [])
          .sort((a, b) => +a.createdAt - +b.createdAt)
          .map((f) => ({
            id: f.id,
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
            url: `/api/payment-proofs/files/${f.id}`,
          })),
        status: p.status,
        submittedAt: p.createdAt,
        decided: {
          by: p.decidedById
            ? { id: p.decidedById, fullName: names.get(p.decidedById) ?? '' }
            : null,
          at: p.decidedAt,
        },
        rejectionReason: p.rejectionReason,
        refund:
          p.status === ProofStatus.ACCEPTED && ended
            ? p.refundedAt
              ? 'refunded'
              : 'due'
            : 'none',
        refundedAt: p.refundedAt,
        ...(seesPayments && {
          verifiedReference: p.verifiedRefEnc
            ? this.crypto.decrypt(p.verifiedRefEnc, verifiedContext(p.id))
            : null,
          refundReference: p.refundRefEnc
            ? this.crypto.decrypt(p.refundRefEnc, refundContext(p.id))
            : null,
        }),
      };
    });
  }

  /** The investor's own booking (others' are not found), or any for staff. */
  private async reservationOf(
    actor: AuthUser,
    id: number,
  ): Promise<Reservation> {
    const row = await this.reservations.findOne({
      where: { id },
      relations: { project: true },
    });
    if (!row || row.status === null) {
      throw new NotFoundException({
        message: 'Reservation not found',
        code: ErrorCode.RESERVATION_NOT_FOUND,
      });
    }
    if (actor.role === Role.INVESTOR) {
      if (row.investorId !== actor.id) {
        throw new NotFoundException({
          message: 'Reservation not found',
          code: ErrorCode.RESERVATION_NOT_FOUND,
        });
      }
    } else if (!SEES_PAYMENTS.has(actor.role)) {
      throw new ForbiddenException({
        message: 'Not allowed',
        code: ErrorCode.FORBIDDEN,
      });
    }
    return row;
  }

  private async pending(id: string): Promise<PaymentProof> {
    const proof = await this.proofs.findOneBy({ id });
    if (!proof) throw notFound();
    if (proof.status !== ProofStatus.PENDING) {
      throw new ConflictException({
        message: `This proof is already ${proof.status}`,
        code: ErrorCode.PROOF_ALREADY_DECIDED,
        details: { status: proof.status },
      });
    }
    return proof;
  }

  /**
   * One reference for the ledger from every accepted proof of a booking:
   * the single one as it is, several joined in order (hashed when too long
   * for the ledger's reference rules, the full list kept encrypted).
   */
  private async combinedReference(reservationId: number): Promise<string> {
    const accepted = await this.proofs.find({
      where: { reservationId, status: ProofStatus.ACCEPTED },
      order: { decidedAt: 'ASC', id: 'ASC' },
    });
    const refs = accepted.map((p) =>
      this.crypto.decrypt(p.verifiedRefEnc!, verifiedContext(p.id)),
    );
    const joined = refs.join(' + ');
    return joined.length <= 128
      ? joined
      : `PROOFS ${createHash('sha256').update(joined).digest('hex').toUpperCase()}`;
  }

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
}

const NONE = { paid: 0n, underReview: 0n };

const referenceContext = (id: string) => `payment_proofs.reference:${id}`;
const verifiedContext = (id: string) => `payment_proofs.verified_ref:${id}`;
const refundContext = (id: string) => `payment_proofs.refund_ref:${id}`;

function normaliseRef(ref: string): string {
  try {
    return normalisePaymentRef(ref);
  } catch (error) {
    throw new UnprocessableEntityException({
      message: (error as Error).message,
      code: ErrorCode.PAYMENT_REF_INVALID,
    });
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({
    message: 'Payment proof not found',
    code: ErrorCode.PROOF_NOT_FOUND,
  });
}

function changedMeanwhile(): ConflictException {
  return new ConflictException({
    message: 'The proof changed meanwhile; try again',
    code: ErrorCode.CHANGED_MEANWHILE,
  });
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
