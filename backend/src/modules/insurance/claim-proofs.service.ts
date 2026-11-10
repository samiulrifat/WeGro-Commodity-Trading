import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { poishaToTaka, takaToPoisha } from '../../blockchain/utils/money';
import {
  hashPaymentRef,
  normalisePaymentRef,
} from '../../blockchain/utils/payment-ref';
import { ConfigService } from '@nestjs/config';
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
import type { SubmitProofDto } from '../projects/dto/payment-proof.dto';
import { Project } from '../projects/entities/project.entity';
import { PaymentMethod, ProofStatus } from '../projects/payment-proof.enums';
import { ProjectViews } from '../projects/project-views';
import { ProofFiles } from '../projects/proof-files';
import { PersonSearch } from '../users/person-search';
import { holdsRole, Role } from '../users/roles';
import { ClaimsService } from './claims.service';
import type {
  ClaimProofDto,
  ListClaimProofsQueryDto,
} from './dto/claim-proof.dto';
import { ClaimProof } from './entities/claim-proof.entity';
import { ClaimProofFile } from './entities/claim-proof-file.entity';
import { InsuranceClaim } from './entities/insurance-claim.entity';
import { ClaimStatus } from './insurance.enums';
import { InsuranceService } from './insurance.service';

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
 * Insurers' proofs of payment for approved claims, and Accounts' review: the
 * same as buyers' proofs for deals, without a clock (an approved claim does
 * not lapse) or refunds (it cannot end unpaid).
 *
 * The project's insurer sends a proof of a transfer to WeGro; Accounts
 * accepts it with the reference on the bank statement, or rejects it with a
 * reason. When accepted proofs add up to the approved amount, the claim's
 * payment is recorded on the ledger and it counts as project income.
 */
@Injectable()
export class ClaimProofsService {
  private readonly logger = new Logger(ClaimProofsService.name);
  private readonly paymentRefSecret: string;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly dataSource: DataSource,
    @InjectRepository(ClaimProof)
    private readonly proofs: Repository<ClaimProof>,
    @InjectRepository(ClaimProofFile)
    private readonly files: Repository<ClaimProofFile>,
    @InjectRepository(InsuranceClaim)
    private readonly claimRows: Repository<InsuranceClaim>,
    @InjectRepository(Project)
    private readonly projects: Repository<Project>,
    private readonly claims: ClaimsService,
    private readonly insurance: InsuranceService,
    private readonly store: ProofFiles,
    private readonly crypto: IdentityCryptoService,
    private readonly bankList: BankListService,
    private readonly views: ProjectViews,
    private readonly writer: NotificationWriter,
    private readonly search: PersonSearch,
  ) {
    this.paymentRefSecret = config.get('PAYMENT_REF_SECRET', { infer: true });
  }

  // --- Insurers ---

  async submit(
    actor: AuthUser,
    claimId: string,
    dto: SubmitProofDto,
    uploads: Buffer[],
  ): Promise<ClaimProofDto> {
    const claim = await this.claimOf(actor, claimId);
    if (claim.status !== ClaimStatus.APPROVED) {
      throw new ConflictException({
        message: `This claim is ${claim.status}`,
        code: ErrorCode.CLAIM_WRONG_STATUS,
        details: { status: claim.status },
      });
    }
    const types = this.store.check(uploads);
    const amount = takaToPoisha(dto.amount);
    const { paid, underReview } =
      (await this.claims.payments([claimId])).get(claimId) ?? NONE;
    const left = claim.approvedAmount! - paid - underReview;
    if (amount <= 0n || amount > left) {
      throw new UnprocessableEntityException({
        message: `The amount must be above zero and at most ${poishaToTaka(left)}, what is left to pay`,
        code: ErrorCode.PROOF_AMOUNT_INVALID,
        details: { remaining: poishaToTaka(left > 0n ? left : 0n) },
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
      ClaimProof,
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
        await m.insert(ClaimProof, {
          id: proofId,
          claimId,
          insurerId: actor.id,
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
          ClaimProofFile,
          sealed.map((f) => ({ ...f, proofId })),
        );
      })
      .catch(async (error: unknown) => {
        await Promise.all(sealed.map((f) => this.store.remove(f.storagePath)));
        throw error;
      });

    const project = await this.titleOf(claim.projectId);
    await this.notify(
      await this.writer.withRole(this.dataSource.manager, [Role.ACCOUNTS], []),
      {
        category: NotificationCategory.ACTION,
        kind: NotificationKind.CLAIM_PROOF_SUBMITTED,
        title: `Insurer's payment proof of ${poishaToTaka(amount)} taka for a claim on ${project} awaiting review`,
        params: { amount: poishaToTaka(amount), project },
        subject: { type: 'claim', id: claimId },
        key: `claim-proof:${proofId}:submitted`,
      },
    );
    return this.one(actor, proofId);
  }

  /** A claim's proofs, newest first: for its insurer and payment staff. */
  async forClaim(actor: AuthUser, claimId: string): Promise<ClaimProofDto[]> {
    await this.claimOf(actor, claimId);
    const rows = await this.proofs.find({
      where: { claimId },
      relations: { files: true },
      order: { createdAt: 'DESC' },
    });
    return this.dtos(actor, rows);
  }

  // --- Accounts ---

  /** Accounts' queue: proofs by status (oldest first when waiting); searchable by insurer. */
  async list(
    actor: AuthUser,
    q: ListClaimProofsQueryDto,
  ): Promise<Paginated<ClaimProofDto>> {
    const qb = this.proofs
      .createQueryBuilder('pp')
      .leftJoinAndSelect('pp.files', 'f');
    if (q.status) qb.andWhere('pp.status = :status', { status: q.status });
    this.search.apply(qb, 'pp.insurer_id', q.q);
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
   * approved amount, the claim's payment is recorded on the ledger.
   */
  async accept(
    actor: AuthUser,
    id: string,
    paymentReference: string,
  ): Promise<ClaimProofDto> {
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

    const claim = await this.claimRows.findOneByOrFail({ id: proof.claimId });
    if (claim.status === ClaimStatus.APPROVED) {
      const { paid } =
        (await this.claims.payments([claim.id])).get(claim.id) ?? NONE;
      if (paid >= claim.approvedAmount!) {
        await this.claims.payWith(
          actor,
          claim.id,
          await this.combinedReference(claim.id),
        );
      }
    }
    const project = await this.titleOf(claim.projectId);
    await this.notify([proof.insurerId], {
      category: NotificationCategory.OUTCOME,
      kind: NotificationKind.CLAIM_PROOF_ACCEPTED,
      title: `Your payment of ${poishaToTaka(proof.amount)} taka for the claim on ${project} is accepted`,
      params: { amount: poishaToTaka(proof.amount), project },
      subject: { type: 'claim', id: proof.claimId },
      key: `claim-proof:${id}:accepted`,
    });
    return this.one(actor, id);
  }

  /** Turns a proof down, with the reason; the insurer can send another. */
  async reject(
    actor: AuthUser,
    id: string,
    reason: string,
  ): Promise<ClaimProofDto> {
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
    const claim = await this.claimRows.findOneByOrFail({ id: proof.claimId });
    const project = await this.titleOf(claim.projectId);
    await this.notify([proof.insurerId], {
      category: NotificationCategory.OUTCOME,
      kind: NotificationKind.CLAIM_PROOF_REJECTED,
      title: `Your payment proof for the claim on ${project} was not accepted`,
      body: reason,
      params: { project, reason },
      subject: { type: 'claim', id: proof.claimId },
      key: `claim-proof:${id}:rejected`,
    });
    return this.one(actor, id);
  }

  /**
   * A proof's file, decrypted: for the insurer who sent it and payment staff.
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
      (!SEES_PAYMENTS.has(actor.role) && file.proof!.insurerId !== actor.id)
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
        `Claim proof file ${fileId} will not open or does not match its hash`,
      );
      const m = this.dataSource.manager;
      const claimId = file.proof!.claimId;
      const claim = await this.claimRows.findOneBy({ id: claimId });
      const project = claim ? await this.titleOf(claim.projectId) : '';
      await this.notify(
        await this.writer.withRole(m, [Role.SUPER_ADMIN, Role.ADMIN]),
        {
          category: NotificationCategory.ACTION,
          kind: NotificationKind.SYSTEM_CLAIM_PROOF_FILE_ALTERED,
          title: `A payment proof file for a claim on ${project} no longer matches the one sent`,
          params: { project },
          subject: { type: 'claim', id: claimId },
          key: `claim-proof-file:${fileId}:altered`,
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

  private async one(actor: AuthUser, id: string): Promise<ClaimProofDto> {
    const row = await this.proofs.findOneOrFail({
      where: { id },
      relations: { files: true },
    });
    return (await this.dtos(actor, [row]))[0]!;
  }

  private async dtos(
    actor: AuthUser,
    rows: ClaimProof[],
  ): Promise<ClaimProofDto[]> {
    if (rows.length === 0) return [];
    const claims = await this.claimRows.findBy({
      id: In([...new Set(rows.map((r) => r.claimId))]),
    });
    const byId = new Map(claims.map((c) => [c.id, c]));
    const projects = await this.projects.find({
      where: { id: In([...new Set(claims.map((c) => c.projectId))]) },
      select: { id: true, title: true },
    });
    const titles = new Map(projects.map((p) => [p.id, p.title]));
    const names = await this.views.names(
      rows.flatMap((r) => [r.insurerId, r.decidedById ?? r.insurerId]),
    );
    const seesPayments = SEES_PAYMENTS.has(actor.role);
    return rows.map((p) => {
      const c = byId.get(p.claimId)!;
      return {
        id: p.id,
        claimId: p.claimId,
        project: { id: c.projectId, name: titles.get(c.projectId) ?? '' },
        insurer: { id: p.insurerId, fullName: names.get(p.insurerId) ?? '' },
        amount: poishaToTaka(p.amount),
        claimTotal: poishaToTaka(c.approvedAmount ?? 0n),
        claimStatus: c.status,
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
            url: `/api/claim-proofs/files/${f.id}`,
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
        ...(seesPayments && {
          verifiedReference: p.verifiedRefEnc
            ? this.crypto.decrypt(p.verifiedRefEnc, verifiedContext(p.id))
            : null,
        }),
      };
    });
  }

  /** The claim, for its project's insurer (others' are not found) or payment staff. */
  private async claimOf(actor: AuthUser, id: string): Promise<InsuranceClaim> {
    const claim = await this.claimRows.findOneBy({ id });
    if (!claim || claim.status === ClaimStatus.SUBMITTED) {
      throw new NotFoundException({
        message: 'Claim not found',
        code: ErrorCode.CLAIM_NOT_FOUND,
      });
    }
    if (SEES_PAYMENTS.has(actor.role)) return claim;
    if (holdsRole(actor, Role.INSURER)) {
      const assignment = await this.insurance.currentAssignment(
        claim.projectId,
      );
      if (assignment?.insurerId === actor.id) return claim;
      throw new NotFoundException({
        message: 'Claim not found',
        code: ErrorCode.CLAIM_NOT_FOUND,
      });
    }
    throw new ForbiddenException({
      message: 'Not allowed',
      code: ErrorCode.FORBIDDEN,
    });
  }

  private async titleOf(projectId: string): Promise<string> {
    const p = await this.projects.findOne({
      where: { id: projectId },
      select: { id: true, title: true },
    });
    return p?.title ?? '';
  }

  private async pending(id: string): Promise<ClaimProof> {
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
   * One reference for the ledger from every accepted proof of a claim: the
   * single one as it is, several joined in order (hashed when too long for
   * the ledger's reference rules, the full list kept encrypted).
   */
  private async combinedReference(claimId: string): Promise<string> {
    const accepted = await this.proofs.find({
      where: { claimId, status: ProofStatus.ACCEPTED },
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

const referenceContext = (id: string) => `claim_proofs.reference:${id}`;
const verifiedContext = (id: string) => `claim_proofs.verified_ref:${id}`;

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
