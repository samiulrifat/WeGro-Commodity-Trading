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
import { ChainClock } from '../../blockchain/chain-clock';
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
import type {
  ListProofsQueryDto,
  SubmitProofDto,
} from '../projects/dto/payment-proof.dto';
import { PaymentMethod, ProofStatus } from '../projects/payment-proof.enums';
import { ProjectViews } from '../projects/project-views';
import { ProofFiles } from '../projects/proof-files';
import { PersonSearch } from '../users/person-search';
import { holdsRole, Role } from '../users/roles';
import type { DealProofDto } from './dto/deal-proof.dto';
import { DealProof } from './entities/deal-proof.entity';
import { DealProofFile } from './entities/deal-proof-file.entity';
import { Offer } from './entities/offer.entity';
import { OfferStatus } from './trade.enums';
import { TradeService } from './trade.service';

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
 * Buyers' proofs of payment for their deals, and Accounts' review.
 *
 * A proof sent before the deadline stops the deal's clock on the ledger
 * (signed by the buyer), so a slow review never costs them the goods.
 * Accounts accepts each proof with the reference on the bank statement, or
 * rejects it with a reason; when no proof is left under review the clock
 * runs on, and when accepted proofs add up to what the buyer pays the deal
 * is confirmed on the ledger. Money accepted for a deal that ended unpaid
 * is refunded, recorded here with its reference.
 */
@Injectable()
export class DealProofsService {
  private readonly logger = new Logger(DealProofsService.name);
  private readonly paymentRefSecret: string;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly dataSource: DataSource,
    @InjectRepository(DealProof)
    private readonly proofs: Repository<DealProof>,
    @InjectRepository(DealProofFile)
    private readonly files: Repository<DealProofFile>,
    @InjectRepository(Offer)
    private readonly offers: Repository<Offer>,
    private readonly trade: TradeService,
    private readonly store: ProofFiles,
    private readonly crypto: IdentityCryptoService,
    private readonly bankList: BankListService,
    private readonly views: ProjectViews,
    private readonly writer: NotificationWriter,
    private readonly search: PersonSearch,
    private readonly clock: ChainClock,
  ) {
    this.paymentRefSecret = config.get('PAYMENT_REF_SECRET', { infer: true });
  }

  // --- Buyers ---

  async submit(
    actor: AuthUser,
    offerId: number,
    dto: SubmitProofDto,
    uploads: Buffer[],
  ): Promise<DealProofDto> {
    const offer = await this.offerOf(actor, offerId);
    if (offer.status !== OfferStatus.APPROVED) {
      throw new ConflictException({
        message: `This offer is ${offer.status}`,
        code: ErrorCode.OFFER_WRONG_STATUS,
        details: { status: offer.status },
      });
    }
    if (
      offer.pausedRemaining === null &&
      offer.paymentDueAt! <= (await this.clock.now())
    ) {
      throw new ConflictException({
        message: 'The payment deadline for this deal has passed',
        code: ErrorCode.PAYMENT_OVERDUE,
      });
    }
    const types = this.store.check(uploads);
    const amount = takaToPoisha(dto.amount);
    const { paid, underReview } =
      (await this.trade.payments([offerId])).get(offerId) ?? NONE;
    const left = total(offer) - paid - underReview;
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
      DealProof,
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
    await this.dataSource
      .transaction(async (m) => {
        await m.insert(DealProof, {
          id: proofId,
          offerId,
          buyerId: actor.id,
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
          DealProofFile,
          sealed.map((f) => ({ ...f, proofId })),
        );
      })
      .catch(async (error: unknown) => {
        await Promise.all(sealed.map((f) => this.store.remove(f.storagePath)));
        throw error;
      });

    // Stop the clock, unless an earlier proof already did.
    if (offer.pausedRemaining === null) {
      try {
        await this.trade.pauseOnLedger(actor, offerId);
      } catch (error) {
        if (error instanceof ContractRevertException) {
          // Too late (the deadline passed) or no longer approved: undo the proof.
          await this.proofs.delete({ id: proofId });
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
        kind: NotificationKind.DEAL_PROOF_SUBMITTED,
        title: `Payment proof for deal #${offerId} awaiting review`,
        params: { offerId: String(offerId), amount: poishaToTaka(amount) },
        subject: { type: 'offer', id: offerId },
        key: `deal-proof:${proofId}:submitted`,
      },
    );
    return this.one(actor, proofId);
  }

  /** A deal's proofs, newest first: the buyer's own, or any for payment staff. */
  async forOffer(actor: AuthUser, offerId: number): Promise<DealProofDto[]> {
    await this.offerOf(actor, offerId);
    const rows = await this.proofs.find({
      where: { offerId },
      relations: { files: true },
      order: { createdAt: 'DESC' },
    });
    return this.dtos(actor, rows);
  }

  // --- Accounts ---

  /** Accounts' queue: proofs by status (oldest first), or refunds due; searchable by buyer. */
  async list(
    actor: AuthUser,
    q: ListProofsQueryDto,
  ): Promise<Paginated<DealProofDto>> {
    const qb = this.proofs
      .createQueryBuilder('pp')
      .leftJoinAndSelect('pp.files', 'f')
      .innerJoin(Offer, 'o', 'o.id = pp.offer_id');
    if (q.status) qb.andWhere('pp.status = :status', { status: q.status });
    if (q.refund) {
      qb.andWhere('pp.status = :accepted', { accepted: ProofStatus.ACCEPTED })
        .andWhere('o.status IN (:...ended)', { ended: ENDED })
        .andWhere(
          q.refund === 'due'
            ? 'pp.refunded_at IS NULL'
            : 'pp.refunded_at IS NOT NULL',
        );
    }
    this.search.apply(qb, 'pp.buyer_id', q.q);
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
   * Accepts a proof against the statement. When accepted proofs cover what
   * the buyer pays the deal is confirmed on the ledger; otherwise, with
   * nothing else under review, its clock runs on for the rest.
   */
  async accept(
    actor: AuthUser,
    id: string,
    paymentReference: string,
  ): Promise<DealProofDto> {
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

    const offer = await this.offers.findOneByOrFail({ id: proof.offerId });
    if (offer.status === OfferStatus.APPROVED) {
      const { paid, underReview } =
        (await this.trade.payments([offer.id])).get(offer.id) ?? NONE;
      if (paid >= total(offer)) {
        await this.trade.confirmWith(
          actor,
          offer.id,
          await this.combinedReference(offer.id),
        );
      } else if (underReview === 0n && offer.pausedRemaining !== null) {
        await this.trade.resumeOnLedger(actor, offer.id);
      }
    }
    await this.notify([proof.buyerId], {
      category: NotificationCategory.OUTCOME,
      kind: NotificationKind.DEAL_PROOF_ACCEPTED,
      title: `Your payment of ${poishaToTaka(proof.amount)} for deal #${proof.offerId} is accepted`,
      params: {
        offerId: String(proof.offerId),
        amount: poishaToTaka(proof.amount),
      },
      subject: { type: 'offer', id: proof.offerId },
      key: `deal-proof:${id}:accepted`,
    });
    return this.one(actor, id);
  }

  /** Turns a proof down; with nothing else under review, the deal's clock runs on. */
  async reject(
    actor: AuthUser,
    id: string,
    reason: string,
  ): Promise<DealProofDto> {
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
    const offer = await this.offers.findOneByOrFail({ id: proof.offerId });
    if (
      offer.status === OfferStatus.APPROVED &&
      offer.pausedRemaining !== null
    ) {
      const { underReview } =
        (await this.trade.payments([offer.id])).get(offer.id) ?? NONE;
      if (underReview === 0n) {
        await this.trade.resumeOnLedger(actor, offer.id);
      }
    }
    await this.notify([proof.buyerId], {
      category: NotificationCategory.OUTCOME,
      kind: NotificationKind.DEAL_PROOF_REJECTED,
      title: `Your payment proof for deal #${proof.offerId} was not accepted`,
      body: reason,
      params: { offerId: String(proof.offerId), reason },
      subject: { type: 'offer', id: proof.offerId },
      key: `deal-proof:${id}:rejected`,
    });
    return this.one(actor, id);
  }

  /** Money accepted for a deal that ended unpaid, paid back: its reference, used once. */
  async recordRefund(
    actor: AuthUser,
    id: string,
    paymentReference: string,
  ): Promise<DealProofDto> {
    const ref = normaliseRef(paymentReference);
    const proof = await this.proofs.findOneBy({ id });
    if (!proof) throw notFound();
    const offer = await this.offers.findOneByOrFail({ id: proof.offerId });
    if (
      proof.status !== ProofStatus.ACCEPTED ||
      !ENDED.includes(offer.status!)
    ) {
      throw new ConflictException({
        message: 'Only money accepted for a deal that ended unpaid is refunded',
        code: ErrorCode.DEAL_PROOF_NOT_REFUNDABLE,
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
          message: 'This payment is already refunded',
          code: ErrorCode.DEAL_PROOF_ALREADY_REFUNDED,
        });
      }
    } catch (error) {
      throw duplicateRef(error);
    }
    await this.notify([proof.buyerId], {
      category: NotificationCategory.OUTCOME,
      kind: NotificationKind.DEAL_PROOF_REFUNDED,
      title: `${poishaToTaka(proof.amount)} sent for deal #${proof.offerId} was refunded`,
      params: {
        offerId: String(proof.offerId),
        amount: poishaToTaka(proof.amount),
      },
      subject: { type: 'offer', id: proof.offerId },
      key: `deal-proof:${id}:refunded`,
    });
    return this.one(actor, id);
  }

  /**
   * A proof's file, decrypted: for the buyer who sent it and payment staff.
   * A file that will not open or no longer matches the hash taken when it
   * was sent is refused, and the super admin and admins are told once.
   */
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
      (!SEES_PAYMENTS.has(actor.role) && file.proof!.buyerId !== actor.id)
    ) {
      throw new NotFoundException({
        message: 'File not found',
        code: ErrorCode.PROOF_FILE_MISSING,
      });
    }
    const data = await this.store.read(file);
    if (
      !data ||
      createHash('sha256').update(data).digest('hex') !== file.sha256
    ) {
      this.logger.error(
        `Deal proof file ${fileId} will not open or does not match its hash`,
      );
      const m = this.dataSource.manager;
      const offerId = file.proof!.offerId;
      await this.notify(
        await this.writer.withRole(m, [Role.SUPER_ADMIN, Role.ADMIN]),
        {
          category: NotificationCategory.ACTION,
          kind: NotificationKind.SYSTEM_DEAL_PROOF_FILE_ALTERED,
          title: `A payment proof file for deal #${offerId} no longer matches the one sent`,
          params: { offerId: String(offerId) },
          subject: { type: 'offer', id: offerId },
          key: `deal-proof-file:${fileId}:altered`,
        },
      );
      throw new ConflictException({
        message:
          'The file no longer matches the one that was sent, so it is not shown',
        code: ErrorCode.PROOF_FILE_ALTERED,
      });
    }
    return { data, mimeType: file.mimeType };
  }

  // --- Internals ---

  private async one(actor: AuthUser, id: string): Promise<DealProofDto> {
    const row = await this.proofs.findOneOrFail({
      where: { id },
      relations: { files: true },
    });
    return (await this.dtos(actor, [row]))[0]!;
  }

  private async dtos(
    actor: AuthUser,
    rows: DealProof[],
  ): Promise<DealProofDto[]> {
    if (rows.length === 0) return [];
    const offers = await this.offers.find({
      where: { id: In([...new Set(rows.map((r) => r.offerId))]) },
      relations: { listing: true },
    });
    const byId = new Map(offers.map((o) => [o.id, o]));
    const names = await this.views.names(
      rows.flatMap((r) => [r.buyerId, r.decidedById ?? r.buyerId]),
    );
    const seesPayments = SEES_PAYMENTS.has(actor.role);
    return rows.map((p) => {
      const o = byId.get(p.offerId)!;
      return {
        id: p.id,
        offerId: p.offerId,
        produce: this.trade.produceRef(o.listing!.produceCode),
        quantity: o.quantity,
        buyer: { id: p.buyerId, fullName: names.get(p.buyerId) ?? '' },
        amount: poishaToTaka(p.amount),
        dealTotal: poishaToTaka(total(o)),
        dealStatus: o.status!,
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
            url: `/api/deal-proofs/files/${f.id}`,
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
          p.status === ProofStatus.ACCEPTED && ENDED.includes(o.status!)
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

  /** The buyer's own deal (others' are not found), or any for payment staff. */
  private async offerOf(actor: AuthUser, id: number): Promise<Offer> {
    const row = await this.offers.findOneBy({ id });
    if (
      !row ||
      row.status === null ||
      (holdsRole(actor, Role.BUYER) && row.buyerId !== actor.id)
    ) {
      throw new NotFoundException({
        message: 'Offer not found',
        code: ErrorCode.OFFER_NOT_FOUND,
      });
    }
    if (!holdsRole(actor, Role.BUYER) && !SEES_PAYMENTS.has(actor.role)) {
      throw new ForbiddenException({
        message: 'Not allowed',
        code: ErrorCode.FORBIDDEN,
      });
    }
    return row;
  }

  private async pending(id: string): Promise<DealProof> {
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
   * One reference for the ledger from every accepted proof of a deal: the
   * single one as it is, several joined in order (hashed when too long for
   * the ledger's reference rules, the full list kept encrypted).
   */
  private async combinedReference(offerId: number): Promise<string> {
    const accepted = await this.proofs.find({
      where: { offerId, status: ProofStatus.ACCEPTED },
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
const ENDED: readonly OfferStatus[] = [
  OfferStatus.CANCELLED,
  OfferStatus.EXPIRED,
];

/** What the buyer pays in all: the deal amount and the fee fixed on approval. */
const total = (o: Offer): bigint =>
  o.unitPrice * BigInt(o.quantity) + (o.buyerFee ?? 0n);

const referenceContext = (id: string) => `deal_proofs.reference:${id}`;
const verifiedContext = (id: string) => `deal_proofs.verified_ref:${id}`;
const refundContext = (id: string) => `deal_proofs.refund_ref:${id}`;

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
