import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type SelectQueryBuilder } from 'typeorm';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import { uuidToBytes32 } from '../../blockchain/utils/ids';
import { poishaToTaka, takaToPoisha } from '../../blockchain/utils/money';
import { Paginated } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../auth/auth-user';
import { Photo } from '../field-records/entities/photo.entity';
import { photoHash, PhotosService } from '../field-records/photos.service';
import { Project } from '../projects/entities/project.entity';
import { ProjectViews } from '../projects/project-views';
import { Role } from '../users/roles';
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
import { InsuranceService, STAFF } from './insurance.service';
import { ErrorCode } from '../../common/errors/error-code';

const MAX_PHOTOS = 5;

/**
 * Insurance claims: the farmer's field officer (or an admin) opens one for
 * damage from a recorded weather event; the project's insurer reviews it and
 * approves an amount within the remaining cover, or rejects it. The officer's
 * evidence and the insurer's assessment are each fingerprinted on the ledger.
 */
@Injectable()
export class ClaimsService {
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
  ) {}

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
      actor.role !== Role.Admin &&
      !(await this.insurance.isOfficerOf(actor, project.farmerId))
    ) {
      throw new ForbiddenException({
        message: "Only the farmer's field officer or an admin can claim",
        code: ErrorCode.ClaimNotAllowed,
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
        code: ErrorCode.NoCoverage,
      });
    }
    if (!event || event.status !== 'recorded') {
      throw new UnprocessableEntityException({
        message: 'eventId must be a recorded weather event',
        code: ErrorCode.WeatherEventInvalid,
      });
    }
    if (event.districtCode !== project.districtCode) {
      throw new UnprocessableEntityException({
        message: `The event was in ${event.districtCode}; the project is in ${project.districtCode}`,
        code: ErrorCode.RegionMismatch,
        details: {
          eventDistrict: event.districtCode,
          projectDistrict: project.districtCode,
        },
      });
    }
    if (!cover.coveredEventTypes.includes(event.eventTypeCode)) {
      throw new UnprocessableEntityException({
        message: `The cover does not include ${event.eventTypeCode}`,
        code: ErrorCode.EventNotCovered,
        details: { coveredEventTypes: cover.coveredEventTypes },
      });
    }
    if (existing && existing.status !== ClaimStatus.Submitted) {
      throw new ConflictException({
        message: 'This project has already claimed for this event',
        code: ErrorCode.AlreadyClaimed,
        details: { claimId: existing.id },
      });
    }
    const damagePercent = normalisePercent(dto.damagePercent);
    if (damagePercent === '0.0') {
      throw new UnprocessableEntityException({
        message: 'damagePercent must be above 0',
        code: ErrorCode.DamageNotPositive,
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
      status: ClaimStatus.Submitted,
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
        status: ClaimStatus.Submitted,
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
          status: ClaimStatus.Submitted,
        });
      }
      throw error;
    }
    return this.findOne(actor, claim.id);
  }

  /** The project's insurer takes the claim up. */
  async startReview(actor: AuthUser, id: string): Promise<ClaimDto> {
    const claim = await this.forInsurer(actor, id, [ClaimStatus.Triggered]);
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
    const claim = await this.forInsurer(actor, id, [ClaimStatus.UnderReview]);
    const amount = takaToPoisha(dto.amount);
    if (amount <= 0n)
      throw new UnprocessableEntityException({
        message: 'amount must be above zero',
        code: ErrorCode.AmountNotPositive,
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
        code: ErrorCode.ExceedsCoverage,
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
      ClaimStatus.Triggered,
      ClaimStatus.UnderReview,
    ]);
    await this.decide(actor, claim, 'rejected', null, dto);
    return this.findOne(actor, id);
  }

  async list(
    actor: AuthUser,
    q: ListClaimsQueryDto,
  ): Promise<Paginated<ClaimDto>> {
    const qb = this.claims
      .createQueryBuilder('c')
      .innerJoin(Project, 'p', 'p.id = c.project_id')
      .where('c.status <> :sub', { sub: ClaimStatus.Submitted });
    this.scope(actor, qb);
    if (q.projectId) qb.andWhere('c.project_id = :pid', { pid: q.projectId });
    if (q.status) qb.andWhere('c.status = :st', { st: q.status });
    const [rows, total] = await qb
      .orderBy('c.created_at', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.claimDtos(rows), total, q);
  }

  async findOne(actor: AuthUser, id: string): Promise<ClaimDto> {
    return (await this.claimDtos([await this.visible(actor, id)]))[0];
  }

  /** The n-th photo (0-based) the officer attached to the claim. */
  async claimPhoto(actor: AuthUser, id: string, n: number): Promise<Photo> {
    const claim = await this.visible(actor, id);
    const photoId = claim.photoIds[n];
    if (!photoId)
      throw new NotFoundException({
        message: 'No such photo on this claim',
        code: ErrorCode.ClaimPhotoNotFound,
      });
    return this.photos.find(photoId);
  }

  async assessmentPhoto(actor: AuthUser, id: string): Promise<Photo> {
    const claim = await this.visible(actor, id);
    if (!claim.assessmentPhotoId || !claim.decidedAt) {
      throw new NotFoundException({
        message: 'No assessment photo for this claim',
        code: ErrorCode.ClaimHasNoPhoto,
      });
    }
    return this.photos.find(claim.assessmentPhotoId);
  }

  // --- Rules ---

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
        code: ErrorCode.ChangedMeanwhile,
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
    if (!claim || claim.status === ClaimStatus.Submitted) {
      throw new NotFoundException({
        message: 'Claim not found',
        code: ErrorCode.ClaimNotFound,
      });
    }
    const cover = await this.insurance.currentCover(claim.projectId);
    if (cover?.insurerId !== actor.id) {
      throw new ForbiddenException({
        message: "Only the project's insurer can review this claim",
        code: ErrorCode.NotProjectInsurer,
      });
    }
    if (!allowed.includes(claim.status)) {
      throw new ConflictException({
        message: `This claim is ${claim.status}`,
        code:
          claim.status === ClaimStatus.Triggered
            ? ErrorCode.ReviewNotStarted
            : ErrorCode.ClaimWrongStatus,
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
        sub: ClaimStatus.Submitted,
      });
    this.scope(actor, qb);
    const claim = await qb.getOne();
    if (!claim)
      throw new NotFoundException({
        message: 'Claim not found',
        code: ErrorCode.ClaimNotFound,
      });
    return claim;
  }

  /**
   * Staff see every claim; an insurer the claims on projects it covers; a
   * field officer their farmers'; a farmer their own.
   */
  private scope(actor: AuthUser, qb: SelectQueryBuilder<InsuranceClaim>): void {
    if (STAFF.has(actor.role)) return;
    switch (actor.role) {
      case Role.Insurer:
        qb.andWhere(
          `EXISTS (SELECT 1 FROM coverage_terms t
                    WHERE t.project_id = c.project_id AND t.insurer_id = :me AND t.status = 'recorded')`,
          { me: actor.id },
        );
        return;
      case Role.FieldOfficer:
        qb.andWhere(
          'EXISTS (SELECT 1 FROM users f WHERE f.id = p.farmer_id AND f.field_officer_id = :me)',
          { me: actor.id },
        );
        return;
      case Role.Farmer:
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
        code: ErrorCode.TooManyPhotos,
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
          code: ErrorCode.PhotoNotYours,
          details: { photo: id },
        });
      }
      return photo;
    });
  }

  // --- Views ---

  /** One query each for projects, events and names, whatever the page size. */
  private async claimDtos(rows: InsuranceClaim[]): Promise<ClaimDto[]> {
    if (rows.length === 0) return [];
    const [projects, events] = await Promise.all([
      this.projects.find({
        where: { id: In([...new Set(rows.map((c) => c.projectId))]) },
        select: { id: true, title: true },
      }),
      this.events.findBy({ id: In([...new Set(rows.map((c) => c.eventId))]) }),
    ]);
    const titles = new Map(projects.map((p) => [p.id, p.title]));
    const eventViews = new Map(
      (await this.insurance.weatherEventDtos(events)).map((e) => [e.id, e]),
    );
    const names = await this.views.names(rows.map((c) => c.openedById));
    return rows.map((c) => {
      const decided =
        c.status === ClaimStatus.Approved || c.status === ClaimStatus.Rejected;
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
        claimHash: c.claimHash,
        assessmentHash: decided ? c.assessmentHash : null,
      };
    });
  }
}
