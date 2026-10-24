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
import {
  Brackets,
  In,
  QueryFailedError,
  Repository,
  type SelectQueryBuilder,
} from 'typeorm';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { poishaToTaka, takaToPoisha } from '../../blockchain/utils/money';
import {
  hashPaymentRef,
  normalisePaymentRef,
} from '../../blockchain/utils/payment-ref';
import { IdentityCryptoService } from '../../common/crypto/identity-crypto.service';
import { Paginated } from '../../common/dto/pagination.dto';
import { searchWords, wordPattern } from '../../common/search/words';
import type { EnvironmentVariables } from '../../config/env.validation';
import type { AuthUser } from '../auth/auth-user';
import { Photo } from '../field-records/entities/photo.entity';
import { photoHash, PhotosService } from '../field-records/photos.service';
import { Project } from '../projects/entities/project.entity';
import { ProjectViews } from '../projects/project-views';
import { PersonSearch } from '../users/person-search';
import { actsAs, Role } from '../users/roles';
import type {
  ApproveClaimDto,
  AssessmentDto,
  ClaimDto,
  ListClaimsQueryDto,
  OpenClaimDto,
} from './dto/insurance.dto';
import { InsuranceClaim } from './entities/insurance-claim.entity';
import { WeatherEvent } from './entities/weather-event.entity';
import {
  assessmentFingerprint,
  claimFingerprint,
  normalisePercent,
} from './insurance-fingerprints';
import { ClaimStatus } from './insurance.enums';
import { assignedTo, InsuranceService, STAFF } from './insurance.service';
import { ErrorCode } from '../../common/errors/error-code';

const MAX_PHOTOS = 5;
/** Who sees payment references. */
const SEES_PAYMENTS: ReadonlySet<Role> = new Set([
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.ACCOUNTS,
  Role.AUDITOR,
]);
const paymentContext = (id: string) => `insurance_claims.payment_ref:${id}`;

/**
 * Insurance claims: the farmer's field officer (or an admin) opens one for
 * damage from a recorded weather event; the project's insurer reviews it and
 * approves an amount within the remaining cover, or rejects it. The officer's
 * evidence and the insurer's assessment are each fingerprinted on the ledger.
 * An approved claim counts as project income once Accounts records the
 * insurer's payment.
 */
@Injectable()
export class ClaimsService {
  private readonly paymentRefSecret: string;

  constructor(
    @InjectRepository(InsuranceClaim)
    private readonly claims: Repository<InsuranceClaim>,
    @InjectRepository(WeatherEvent)
    private readonly events: Repository<WeatherEvent>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Photo) private readonly photoRows: Repository<Photo>,
    private readonly insurance: InsuranceService,
    private readonly photos: PhotosService,
    private readonly views: ProjectViews,
    private readonly crypto: IdentityCryptoService,
    private readonly search: PersonSearch,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.paymentRefSecret = config.get('PAYMENT_REF_SECRET', { infer: true });
  }

  /**
   * Opens a claim. The event must be recorded, in the project's district and
   * of a type the cover includes; a project claims once per event.
   */
  async open(
    actor: AuthUser,
    projectId: string,
    dto: OpenClaimDto,
  ): Promise<ClaimDto> {
    const project = await this.insurance.requireInsurable(projectId);
    if (
      !actsAs(actor.role, Role.ADMIN) &&
      !(await this.insurance.isOfficerOf(actor, project.farmerId))
    ) {
      throw new ForbiddenException({
        message: "Only the farmer's field officer or an admin can claim",
        code: ErrorCode.CLAIM_NOT_ALLOWED,
      });
    }
    const [cover, event, existing] = await Promise.all([
      this.insurance.currentCover(project.id),
      this.events.findOneBy({ id: dto.eventId }),
      this.claims.findOne({
        where: { projectId: project.id, eventId: dto.eventId },
        select: { id: true, status: true },
      }),
    ]);
    if (!cover) {
      throw new ConflictException({
        message: 'No insurer covers this project yet',
        code: ErrorCode.NO_COVERAGE,
      });
    }
    if (!event || event.status !== 'recorded') {
      throw new UnprocessableEntityException({
        message: 'eventId must be a recorded weather event',
        code: ErrorCode.WEATHER_EVENT_INVALID,
      });
    }
    if (event.districtCode !== project.districtCode) {
      throw new UnprocessableEntityException({
        message: `The event was in ${event.districtCode}; the project is in ${project.districtCode}`,
        code: ErrorCode.REGION_MISMATCH,
        details: {
          eventDistrict: event.districtCode,
          projectDistrict: project.districtCode,
        },
      });
    }
    if (!cover.coveredEventTypes.includes(event.eventTypeCode)) {
      throw new UnprocessableEntityException({
        message: `The cover does not include ${event.eventTypeCode}`,
        code: ErrorCode.EVENT_NOT_COVERED,
        details: { coveredEventTypes: cover.coveredEventTypes },
      });
    }
    if (existing && existing.status !== ClaimStatus.SUBMITTED) {
      throw new ConflictException({
        message: 'This project has already claimed for this event',
        code: ErrorCode.ALREADY_CLAIMED,
        details: { claimId: existing.id },
      });
    }
    const damagePercent = normalisePercent(dto.damagePercent);
    if (damagePercent === '0.0') {
      throw new UnprocessableEntityException({
        message: 'damagePercent must be above 0',
        code: ErrorCode.DAMAGE_NOT_POSITIVE,
      });
    }
    const photos = await this.ownPhotos(actor, dto.photoIds ?? []);

    const claim = this.claims.create({
      id: randomUUID(),
      projectId: project.id,
      eventId: event.id,
      damagePercent,
      notes: dto.notes,
      photoIds: photos.map((p) => p.id),
      openedById: actor.id,
      status: ClaimStatus.SUBMITTED,
      openedAt: null,
    });
    claim.claimHash = claimFingerprint({
      claimId: claim.id,
      projectId: claim.projectId,
      eventId: claim.eventId,
      damagePercent,
      notes: claim.notes,
      photoHashes: photos.map((p) => photoHash(p.sha256)),
    });
    // A previous attempt that never reached the ledger is replaced.
    if (existing) {
      await this.claims.delete({
        id: existing.id,
        status: ClaimStatus.SUBMITTED,
      });
    }
    await this.claims.insert(claim);
    try {
      await this.insurance.send(actor, (c) =>
        c.openClaim.populateTransaction(
          uuidToBytes32(claim.id),
          uuidToBytes32(claim.projectId),
          uuidToBytes32(claim.eventId),
          claim.claimHash,
        ),
      );
    } catch (error) {
      if (error instanceof ContractRevertException) {
        await this.claims.delete({
          id: claim.id,
          status: ClaimStatus.SUBMITTED,
        });
      }
      throw error;
    }
    return this.findOne(actor, claim.id);
  }

  /** The project's insurer takes the claim up. */
  async startReview(actor: AuthUser, id: string): Promise<ClaimDto> {
    const claim = await this.forInsurer(actor, id, [ClaimStatus.TRIGGERED]);
    await this.insurance.send(actor, (c) =>
      c.startReview.populateTransaction(uuidToBytes32(claim.id)),
    );
    return this.findOne(actor, id);
  }

  /** Approves an amount within the cover still remaining, with the insurer's assessment. */
  async approve(
    actor: AuthUser,
    id: string,
    dto: ApproveClaimDto,
  ): Promise<ClaimDto> {
    const claim = await this.forInsurer(actor, id, [ClaimStatus.UNDER_REVIEW]);
    const amount = takaToPoisha(dto.amount);
    if (amount <= 0n)
      throw new UnprocessableEntityException({
        message: 'amount must be above zero',
        code: ErrorCode.AMOUNT_NOT_POSITIVE,
      });
    const key = uuidToBytes32(claim.projectId);
    const registry = this.insurance.registry();
    const [cover, approved] = await Promise.all([
      registry.getCoverage(key),
      registry.approvedTotal(key),
    ]);
    const remaining = cover.maxAmount - approved;
    if (amount > remaining) {
      throw new ConflictException({
        message: `Only ${poishaToTaka(remaining)} taka of the cover remains`,
        code: ErrorCode.EXCEEDS_COVERAGE,
        details: { remaining: poishaToTaka(remaining) },
      });
    }
    await this.decide(actor, claim, 'approved', amount, dto);
    return this.findOne(actor, id);
  }

  /** Rejects an open claim, with the insurer's assessment. */
  async reject(
    actor: AuthUser,
    id: string,
    dto: AssessmentDto,
  ): Promise<ClaimDto> {
    const claim = await this.forInsurer(actor, id, [
      ClaimStatus.TRIGGERED,
      ClaimStatus.UNDER_REVIEW,
    ]);
    await this.decide(actor, claim, 'rejected', null, dto);
    return this.findOne(actor, id);
  }

  /**
   * Accounts records that the insurer paid an approved claim to WeGro. The
   * reference is kept encrypted, and the ledger keeps its keyed hash. Each
   * reference is used once.
   */
  async recordPayment(
    actor: AuthUser,
    id: string,
    paymentReference: string,
  ): Promise<ClaimDto> {
    let ref: string;
    try {
      ref = normalisePaymentRef(paymentReference);
    } catch (error) {
      throw new UnprocessableEntityException({
        message: (error as Error).message,
        code: ErrorCode.PAYMENT_REF_INVALID,
      });
    }
    const hash = hashPaymentRef(ref, this.paymentRefSecret);
    const claim = await this.claims.findOneBy({ id });
    if (!claim || claim.status === ClaimStatus.SUBMITTED) {
      throw new NotFoundException({
        message: 'Claim not found',
        code: ErrorCode.CLAIM_NOT_FOUND,
      });
    }
    if (claim.status !== ClaimStatus.APPROVED) {
      throw new ConflictException({
        message: `This claim is ${claim.status}`,
        code: ErrorCode.CLAIM_WRONG_STATUS,
        details: { status: claim.status },
      });
    }
    try {
      const saved = await this.claims
        .createQueryBuilder()
        .update()
        .set({
          paymentRefEnc: this.crypto.encrypt(ref, paymentContext(id)),
          paymentRefHash: hash,
          paidById: actor.id,
        })
        .where("id = :id AND status = 'approved'", { id })
        .andWhere('(payment_ref_hash IS NULL OR payment_ref_hash = :hash)', {
          hash,
        })
        .execute();
      if (saved.affected !== 1)
        throw new ConflictException({
          message: "This claim's payment is already being recorded",
          code: ErrorCode.CLAIM_PAYMENT_RECORDING,
        });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new ConflictException({
          message: 'This payment reference was already used',
          code: ErrorCode.PAYMENT_REF_ALREADY_USED,
        });
      }
      throw error;
    }
    try {
      await this.insurance.send(actor, (c) =>
        c.recordClaimPayment.populateTransaction(uuidToBytes32(id), hash),
      );
    } catch (error) {
      if (error instanceof ContractRevertException) {
        await this.claims.update(
          { id, paymentRefHash: hash, status: ClaimStatus.APPROVED },
          { paymentRefEnc: null, paymentRefHash: null, paidById: null },
        );
      }
      throw error;
    }
    return this.findOne(actor, id);
  }

  async list(
    actor: AuthUser,
    q: ListClaimsQueryDto,
  ): Promise<Paginated<ClaimDto>> {
    const qb = this.claims
      .createQueryBuilder('c')
      .innerJoin(Project, 'p', 'p.id = c.project_id')
      .where('c.status <> :sub', { sub: ClaimStatus.SUBMITTED });
    this.scope(actor, qb);
    if (q.projectId) qb.andWhere('c.project_id = :pid', { pid: q.projectId });
    if (q.status) qb.andWhere('c.status = :st', { st: q.status });
    if (q.paymentDue)
      qb.andWhere('c.status = :due', { due: ClaimStatus.APPROVED });
    this.searchClaims(qb, q.q);
    const [rows, total] = await qb
      .orderBy('c.created_at', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.claimDtos(actor, rows), total, q);
  }

  async findOne(actor: AuthUser, id: string): Promise<ClaimDto> {
    return (await this.claimDtos(actor, [await this.visible(actor, id)]))[0];
  }

  /** The n-th photo (0-based) the officer attached to the claim. */
  async claimPhoto(actor: AuthUser, id: string, n: number): Promise<Photo> {
    const claim = await this.visible(actor, id);
    const photoId = claim.photoIds[n];
    if (!photoId)
      throw new NotFoundException({
        message: 'No such photo on this claim',
        code: ErrorCode.CLAIM_PHOTO_NOT_FOUND,
      });
    return this.photos.find(photoId);
  }

  async assessmentPhoto(actor: AuthUser, id: string): Promise<Photo> {
    const claim = await this.visible(actor, id);
    if (!claim.assessmentPhotoId || !claim.decidedAt) {
      throw new NotFoundException({
        message: 'No assessment photo for this claim',
        code: ErrorCode.CLAIM_HAS_NO_PHOTO,
      });
    }
    return this.photos.find(claim.assessmentPhotoId);
  }

  // --- Rules ---

  /** Words of the project title or the event type, or the farmer as a person. */
  private searchClaims(qb: SelectQueryBuilder<InsuranceClaim>, q?: string) {
    const text = (q ?? '').trim();
    if (!text) return;
    const words = searchWords(text);
    const types =
      words.length > 0 ? this.insurance.eventTypesMatching(words) : [];
    const farmer = this.search.condition('p.farmer_id', text, 'Farmer');
    qb.andWhere(
      new Brackets((b) => {
        b.where('1 = 0');
        if (words.length > 0) {
          b.orWhere(
            words.map((_, i) => `p.title ~* :cw${i}`).join(' AND '),
            Object.fromEntries(words.map((w, i) => [`cw${i}`, wordPattern(w)])),
          );
        }
        if (types.length > 0) {
          b.orWhere(
            'c.event_id IN (SELECT e.id FROM weather_events e WHERE e.event_type_code IN (:...ctypes))',
            { ctypes: types },
          );
        }
        if (farmer) b.orWhere(farmer.sql, farmer.params);
      }),
    );
  }

  /**
   * Saves the assessment, fingerprints it and sends the decision. A pending
   * assessment from an attempt that never reached the ledger is replaced;
   * a reverted one is cleared.
   */
  private async decide(
    actor: AuthUser,
    claim: InsuranceClaim,
    decision: 'approved' | 'rejected',
    amount: bigint | null,
    dto: AssessmentDto,
  ): Promise<void> {
    const [photo] = await this.ownPhotos(
      actor,
      dto.photoId ? [dto.photoId] : [],
    );
    const damagePercent =
      dto.damagePercent === undefined || dto.damagePercent === null
        ? null
        : normalisePercent(dto.damagePercent);
    const assessmentHash = assessmentFingerprint({
      claimId: claim.id,
      decision,
      approvedAmount: amount,
      damagePercent,
      notes: dto.notes,
      photoHash: photo ? photoHash(photo.sha256) : null,
    });
    const pending = {
      assessedDamagePercent: damagePercent,
      assessmentNotes: dto.notes,
      assessmentPhotoId: photo?.id ?? null,
      assessmentHash,
      reviewedById: actor.id,
    };
    const saved = await this.claims.update(
      { id: claim.id, status: claim.status },
      pending,
    );
    if (saved.affected === 0) {
      throw new ConflictException({
        message: 'The claim changed meanwhile; try again',
        code: ErrorCode.CHANGED_MEANWHILE,
      });
    }
    try {
      const key = uuidToBytes32(claim.id);
      await this.insurance.send(actor, (c) =>
        decision === 'approved'
          ? c.approveClaim.populateTransaction(key, amount!, assessmentHash)
          : c.rejectClaim.populateTransaction(key, assessmentHash),
      );
    } catch (error) {
      if (error instanceof ContractRevertException) {
        await this.claims.update(
          { id: claim.id, status: claim.status, assessmentHash },
          {
            assessedDamagePercent: null,
            assessmentNotes: null,
            assessmentPhotoId: null,
            assessmentHash: null,
            reviewedById: null,
          },
        );
      }
      throw error;
    }
  }

  /** A claim in one of `allowed`, on a project the actor (an insurer) covers. */
  private async forInsurer(
    actor: AuthUser,
    id: string,
    allowed: ClaimStatus[],
  ): Promise<InsuranceClaim> {
    const claim = await this.claims.findOneBy({ id });
    if (!claim || claim.status === ClaimStatus.SUBMITTED) {
      throw new NotFoundException({
        message: 'Claim not found',
        code: ErrorCode.CLAIM_NOT_FOUND,
      });
    }
    const assignment = await this.insurance.currentAssignment(claim.projectId);
    if (assignment?.insurerId !== actor.id) {
      throw new ForbiddenException({
        message: "Only the project's insurer can review this claim",
        code: ErrorCode.NOT_PROJECT_INSURER,
      });
    }
    if (!allowed.includes(claim.status)) {
      throw new ConflictException({
        message: `This claim is ${claim.status}`,
        code:
          claim.status === ClaimStatus.TRIGGERED
            ? ErrorCode.REVIEW_NOT_STARTED
            : ErrorCode.CLAIM_WRONG_STATUS,
        details: { status: claim.status },
      });
    }
    return claim;
  }

  private async visible(actor: AuthUser, id: string): Promise<InsuranceClaim> {
    const qb = this.claims
      .createQueryBuilder('c')
      .innerJoin(Project, 'p', 'p.id = c.project_id')
      .where('c.id = :id AND c.status <> :sub', {
        id,
        sub: ClaimStatus.SUBMITTED,
      });
    this.scope(actor, qb);
    const claim = await qb.getOne();
    if (!claim)
      throw new NotFoundException({
        message: 'Claim not found',
        code: ErrorCode.CLAIM_NOT_FOUND,
      });
    return claim;
  }

  /**
   * Staff see every claim; an insurer the claims on projects assigned to it; a
   * field officer their farmers'; a farmer their own.
   */
  private scope(actor: AuthUser, qb: SelectQueryBuilder<InsuranceClaim>): void {
    if (STAFF.has(actor.role)) return;
    switch (actor.role) {
      case Role.INSURER:
        qb.andWhere(assignedTo('c.project_id', ':me'), { me: actor.id });
        return;
      case Role.FIELD_OFFICER:
        qb.andWhere(
          'EXISTS (SELECT 1 FROM users f WHERE f.id = p.farmer_id AND f.field_officer_id = :me)',
          { me: actor.id },
        );
        return;
      case Role.FARMER:
        qb.andWhere('p.farmer_id = :me', { me: actor.id });
        return;
      default:
        qb.andWhere('FALSE');
    }
  }

  /** Photos the actor uploaded, in the order given; one query for all of them. */
  private async ownPhotos(actor: AuthUser, ids: string[]): Promise<Photo[]> {
    if (ids.length === 0) return [];
    if (ids.length > MAX_PHOTOS) {
      throw new UnprocessableEntityException({
        message: `At most ${MAX_PHOTOS} photos`,
        code: ErrorCode.TOO_MANY_PHOTOS,
        details: { max: MAX_PHOTOS },
      });
    }
    const rows = await this.photoRows.findBy({
      id: In(ids),
      uploadedById: actor.id,
    });
    const byId = new Map(rows.map((p) => [p.id, p]));
    return ids.map((id) => {
      const photo = byId.get(id);
      if (!photo) {
        throw new UnprocessableEntityException({
          message: `Photo ${id} must be one you uploaded`,
          code: ErrorCode.PHOTO_NOT_YOURS,
          details: { photo: id },
        });
      }
      return photo;
    });
  }

  // --- Views ---

  /** One query each for projects, events, insurers and names, whatever the page size. */
  private async claimDtos(
    actor: AuthUser,
    rows: InsuranceClaim[],
  ): Promise<ClaimDto[]> {
    if (rows.length === 0) return [];
    const projectIds = [...new Set(rows.map((c) => c.projectId))];
    const [projects, events, insurers] = await Promise.all([
      this.projects.find({
        where: { id: In([...new Set(rows.map((c) => c.projectId))]) },
        select: { id: true, title: true },
      }),
      this.events.findBy({ id: In([...new Set(rows.map((c) => c.eventId))]) }),
      this.insurance.currentAssignments(projectIds),
    ]);
    const titles = new Map(projects.map((p) => [p.id, p.title]));
    const eventViews = new Map(
      (await this.insurance.weatherEventDtos(events)).map((e) => [e.id, e]),
    );
    const names = await this.views.names([
      ...rows.map((c) => c.openedById),
      ...[...insurers.values()].map((a) => a.insurerId),
    ]);
    const seesPayments = SEES_PAYMENTS.has(actor.role);
    return rows.map((c) => {
      const decided =
        c.status === ClaimStatus.APPROVED ||
        c.status === ClaimStatus.REJECTED ||
        c.status === ClaimStatus.PAID;
      const insurer = insurers.get(c.projectId);
      return {
        id: c.id,
        project: { id: c.projectId, name: titles.get(c.projectId) ?? '' },
        event: eventViews.get(c.eventId)!,
        damagePercent: c.damagePercent,
        notes: c.notes,
        photos: c.photoIds.map(
          (_, i) => `/api/insurance/claims/${c.id}/photos/${i}`,
        ),
        openedBy: { id: c.openedById, name: names.get(c.openedById) ?? '' },
        status: c.status,
        openedAt: c.openedAt,
        // Shown once decided: until then it may be an attempt in flight.
        assessment:
          decided && c.assessmentNotes !== null
            ? {
                damagePercent: c.assessedDamagePercent,
                notes: c.assessmentNotes,
                photoUrl: c.assessmentPhotoId
                  ? `/api/insurance/claims/${c.id}/assessment/photo`
                  : null,
              }
            : null,
        approvedAmount:
          c.approvedAmount === null ? null : poishaToTaka(c.approvedAmount),
        decidedAt: c.decidedAt,
        insurer: insurer
          ? { id: insurer.insurerId, name: names.get(insurer.insurerId) ?? '' }
          : null,
        paidAt: c.status === ClaimStatus.PAID ? c.paidAt : null,
        paymentReference:
          seesPayments && c.status === ClaimStatus.PAID && c.paymentRefEnc
            ? this.crypto.decrypt(c.paymentRefEnc, paymentContext(c.id))
            : null,
        claimHash: c.claimHash,
        assessmentHash: decided ? c.assessmentHash : null,
      };
    });
  }
}
