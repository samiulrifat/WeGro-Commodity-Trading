import {
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ChainClock } from '../../blockchain/chain-clock';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import { TransactionService } from '../../blockchain/tx/transaction.service';
import { fingerprint } from '../../blockchain/utils/fingerprint';
import {
  codeToBytes32,
  uuidToBytes32,
  ZERO_BYTES32,
} from '../../blockchain/utils/ids';
import { Paginated } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../auth/auth-user';
import { CatalogService } from '../catalog/catalog.service';
import { Project } from '../projects/entities/project.entity';
import { ProjectStage } from '../projects/project.enums';
import { ProjectViews } from '../projects/project-views';
import { ProjectsService } from '../projects/projects.service';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/roles';
import type {
  FieldRecordDraftDto,
  FieldRecordDto,
  FieldRecordVerificationDto,
  ListFieldRecordsQueryDto,
  SyncResultDto,
} from './dto/field-record.dto';
import { FieldRecord } from './entities/field-record.entity';
import type { Photo } from './entities/photo.entity';
import { photoHash, PhotosService } from './photos.service';
import {
  normaliseLocation,
  normaliseMeasurements,
  roundCoordinate,
} from './record-values';
import { ErrorCode } from '../../common/errors/error-code';
import { type Problem, problem } from '../../common/errors/problem';

/** Stages in which the ledger accepts farm updates. */
const OPEN_STAGES: readonly ProjectStage[] = [
  ProjectStage.Funded,
  ProjectStage.Active,
  ProjectStage.ReadyForSale,
];

/** Staff see exact locations; so do the farmer and their own officer. */
const EXACT_LOCATION: ReadonlySet<Role> = new Set([
  Role.SuperAdmin,
  Role.Admin,
  Role.Operations,
  Role.Accounts,
  Role.Auditor,
]);

/** A draft checked and turned into exactly what is stored and fingerprinted. */
interface Prepared {
  record: Omit<
    FieldRecord,
    'createdAt' | 'project' | 'photo' | 'status' | 'recordedAt' | 'txHash'
  >;
}

/**
 * Farm updates from field officers' phones. Sync is safe to repeat: the id
 * comes from the phone, an identical resend is answered "already recorded",
 * and the same id with different content is refused.
 */
@Injectable()
export class FieldRecordsService {
  constructor(
    @InjectRepository(FieldRecord)
    private readonly records: Repository<FieldRecord>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly catalog: CatalogService,
    private readonly photos: PhotosService,
    private readonly projects: ProjectsService,
    private readonly views: ProjectViews,
    private readonly tx: TransactionService,
    private readonly receipts: ReceiptApplier,
    private readonly contracts: ContractsRegistry,
    private readonly clock: ChainClock,
  ) {}

  // --- Sync ---

  /**
   * Sends a batch of drafts. Every draft gets its own outcome; one bad draft
   * never blocks the rest. A correction whose original is in the same batch
   * waits for it (the ledger needs the original first); everything else is
   * sent together, so a batch costs about one block per level of corrections.
   */
  async sync(
    actor: AuthUser,
    drafts: FieldRecordDraftDto[],
  ): Promise<SyncResultDto[]> {
    const results = new Map<string, SyncResultDto>();
    const byId = new Map<string, FieldRecordDraftDto>();
    for (const d of drafts) {
      if (byId.has(d.id)) {
        results.set(
          `${d.id}#dup`,
          rejected(
            d.id,
            ErrorCode.DuplicateInBatch,
            'The same id appears twice in this batch',
          ),
        );
      } else {
        byId.set(d.id, d);
      }
    }

    // Level = how many corrections deep, within this batch.
    const level = new Map<string, number>();
    const levelOf = (d: FieldRecordDraftDto, seen: Set<string>): number => {
      const known = level.get(d.id);
      if (known !== undefined) return known;
      const parent = d.correctsEntryId
        ? byId.get(d.correctsEntryId)
        : undefined;
      if (!parent) return set(d.id, 0);
      if (seen.has(d.id)) return set(d.id, -1); // a cycle: rejected below
      seen.add(d.id);
      const p = levelOf(parent, seen);
      return set(d.id, p < 0 ? -1 : p + 1);
    };
    const set = (id: string, v: number) => (level.set(id, v), v);
    const waves: FieldRecordDraftDto[][] = [];
    for (const d of byId.values()) {
      const l = levelOf(d, new Set());
      if (l < 0) {
        results.set(
          d.id,
          rejected(
            d.id,
            ErrorCode.CorrectionCycle,
            'Corrections in this batch refer to each other in a circle',
          ),
        );
      } else {
        (waves[l] ??= []).push(d);
      }
    }

    for (const wave of waves) {
      const chainNow = await this.clock.now();
      const outcomes = await Promise.all(
        wave.map((d) => this.syncOne(actor, d, chainNow)),
      );
      for (const o of outcomes) results.set(o.id, o);
    }
    // In the order sent; a repeated id answers with its duplicate rejection.
    const answered = new Set<string>();
    return drafts.map((d) => {
      const first = !answered.has(d.id);
      answered.add(d.id);
      return results.get(first ? d.id : `${d.id}#dup`)!;
    });
  }

  private async syncOne(
    actor: AuthUser,
    draft: FieldRecordDraftDto,
    chainNow: Date,
  ): Promise<SyncResultDto> {
    let prepared: Prepared;
    try {
      prepared = await this.prepare(actor, draft, chainNow);
    } catch (error) {
      return fromHttpError(draft.id, error);
    }
    const r = prepared.record;

    const existing = await this.records.findOneBy({ id: r.id });
    if (existing) {
      if (
        existing.dataHash !== r.dataHash ||
        existing.photoHash !== r.photoHash
      ) {
        return rejected(
          r.id,
          ErrorCode.EntryIdReused,
          'This id was already used for a different record',
        );
      }
      if (existing.status === 'recorded' || (await this.onLedger(r))) {
        return {
          id: r.id,
          outcome: 'already_recorded',
          record: await this.one(actor, existing.id),
        };
      }
    } else {
      await this.records.insert({ ...r, status: 'submitted' });
    }

    try {
      const result = await this.tx.send(actor.keyIndex, 'FieldRecordLog', (c) =>
        c.addEntry.populateTransaction({
          entryId: uuidToBytes32(r.id),
          projectId: uuidToBytes32(r.projectId),
          entryType: codeToBytes32(r.entryTypeCode),
          dataHash: r.dataHash,
          photoHash: r.photoHash ?? ZERO_BYTES32,
          correctsEntryId: r.correctsEntryId
            ? uuidToBytes32(r.correctsEntryId)
            : ZERO_BYTES32,
          observedAt: Math.floor(r.observedAt.getTime() / 1000),
        }),
      );
      await this.receipts.apply(result);
      return {
        id: r.id,
        outcome: 'recorded',
        record: await this.one(actor, r.id),
      };
    } catch (error) {
      if (error instanceof ContractRevertException) {
        if (error.revert.name === 'EntryExists' && (await this.onLedger(r))) {
          return {
            id: r.id,
            outcome: 'already_recorded',
            record: await this.one(actor, r.id),
          };
        }
        await this.records.delete({ id: r.id, status: 'submitted' });
        return fromHttpError(r.id, error);
      }
      // Sent or not, unknown: the phone keeps the draft and resends; that is safe.
      return {
        id: r.id,
        outcome: 'pending',
        code: ErrorCode.NotConfirmed,
        message:
          'Not confirmed by the ledger yet; keep the draft and send it again later',
      };
    }
  }

  /** The ledger holds this id with exactly these fingerprints. */
  private async onLedger(r: Prepared['record']): Promise<boolean> {
    return this.contracts
      .get('FieldRecordLog')
      .verifyEntry(
        uuidToBytes32(r.id),
        r.dataHash,
        r.photoHash ?? ZERO_BYTES32,
      );
  }

  /** Every rule, all problems reported together. */
  private async prepare(
    actor: AuthUser,
    d: FieldRecordDraftDto,
    chainNow: Date,
  ): Promise<Prepared> {
    const project = await this.projectFor(d.projectId);
    if (!OPEN_STAGES.includes(project.stage)) {
      throw new UnprocessableEntityException({
        message:
          'Farm updates are recorded from funding until the produce is ready for sale',
        code: ErrorCode.FarmUpdateWrongStage,
      });
    }
    const farmer = await this.users.findOne({
      where: { id: project.farmerId },
      select: { id: true, fieldOfficerId: true },
    });
    if (farmer?.fieldOfficerId !== actor.id) {
      throw new UnprocessableEntityException({
        message: "Only the farmer's own field officer records farm updates",
        code: ErrorCode.NotFarmersOfficer,
      });
    }

    const type = this.catalog.fieldRecordTypes.requireActive(d.entryTypeCode);
    const problems: Problem[] = [];
    const recordType = { recordType: type.name, recordTypeBn: type.nameBn };

    const m = normaliseMeasurements(d.measurements ?? {}, type.measurements);
    problems.push(...m.problems);

    let latitude: string | null = null;
    let longitude: string | null = null;
    const hasLat =
      d.latitude !== undefined && d.latitude !== null && d.latitude !== '';
    const hasLng =
      d.longitude !== undefined && d.longitude !== null && d.longitude !== '';
    if (hasLat !== hasLng) {
      problems.push(
        problem(
          ErrorCode.LocationIncomplete,
          'Give both latitude and longitude, or neither',
        ),
      );
    } else if (hasLat) {
      const loc = normaliseLocation(d.latitude, d.longitude);
      if ('problem' in loc) problems.push(loc.problem);
      else ({ latitude, longitude } = loc);
    } else if (type.requiresLocation) {
      problems.push(
        problem(
          ErrorCode.LocationRequired,
          `A ${type.name.toLowerCase()} needs the location`,
          recordType,
        ),
      );
    }

    let photo: Photo | null = null;
    if (d.photoId) {
      photo = await this.photos.find(d.photoId).catch(() => null);
      if (!photo || photo.uploadedById !== actor.id) {
        problems.push(
          problem(
            ErrorCode.PhotoNotYours,
            'photoId must be a photo you uploaded',
          ),
        );
        photo = null;
      }
    } else if (type.requiresPhoto) {
      problems.push(
        problem(
          ErrorCode.PhotoRequired,
          `A ${type.name.toLowerCase()} needs a photo`,
          recordType,
        ),
      );
    }

    if (d.correctsEntryId) {
      const original = await this.records.findOne({
        where: { id: d.correctsEntryId },
        select: { id: true, projectId: true },
      });
      if (!original || original.projectId !== d.projectId) {
        problems.push(
          problem(
            ErrorCode.CorrectionOtherProject,
            'correctsEntryId must be a record of the same project',
          ),
        );
      }
    }

    // The ledger keeps whole seconds and refuses times ahead of its own clock.
    const observedAt = new Date(
      Math.floor(new Date(d.observedAt).getTime() / 1000) * 1000,
    );
    if (observedAt.getTime() <= 0) {
      problems.push(
        problem(ErrorCode.ObservedAtInvalid, 'observedAt is not a valid time'),
      );
    } else if (observedAt > chainNow) {
      problems.push(
        problem(
          ErrorCode.ObservedAtFuture,
          "observedAt is in the future: check the phone's clock",
        ),
      );
    }

    if (problems.length > 0) {
      throw new UnprocessableEntityException({
        message: 'The record is not valid',
        code: ErrorCode.InvalidRecord,
        details: { problems },
      });
    }

    const record = {
      id: d.id,
      projectId: d.projectId,
      entryTypeCode: d.entryTypeCode,
      notes: d.notes ?? null,
      measurements: m.values,
      latitude,
      longitude,
      accuracyMeters: d.accuracyMeters ?? null,
      photoId: photo?.id ?? null,
      correctsEntryId: d.correctsEntryId ?? null,
      recordedById: actor.id,
      observedAt,
      photoHash: photo ? photoHash(photo.sha256) : null,
      dataHash: '',
    };
    record.dataHash = recordFingerprint(record);
    return { record };
  }

  // --- Reading ---

  async list(
    actor: AuthUser,
    projectId: string,
    q: ListFieldRecordsQueryDto,
  ): Promise<Paginated<FieldRecordDto>> {
    const project = await this.projects.visible(actor, projectId);
    const qb = this.records
      .createQueryBuilder('r')
      .where('r.project_id = :pid', { pid: projectId });
    if (!this.seesDrafts(actor)) qb.andWhere("r.status = 'recorded'");
    if (q.entryTypeCode)
      qb.andWhere('r.entry_type_code = :t', { t: q.entryTypeCode });
    const [rows, total] = await qb
      .orderBy('r.observed_at', 'DESC')
      .addOrderBy('r.id', 'ASC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.dtos(actor, project, rows), total, q);
  }

  async findOne(actor: AuthUser, id: string): Promise<FieldRecordDto> {
    return this.one(actor, id);
  }

  /** The record's photo file, for anyone who may see the record. */
  async photoFor(actor: AuthUser, id: string): Promise<Photo> {
    const record = await this.visibleRecord(actor, id);
    if (!record.photoId)
      throw new NotFoundException({
        message: 'This record has no photo',
        code: ErrorCode.RecordHasNoPhoto,
      });
    return this.photos.find(record.photoId);
  }

  /**
   * Verify: recomputes the data fingerprint from the stored values and the
   * photo fingerprint from the file on disk, and compares both with the ledger.
   */
  async verify(id: string): Promise<FieldRecordVerificationDto> {
    const record = await this.records.findOneBy({ id });
    if (!record)
      throw new NotFoundException({
        message: 'Field record not found',
        code: ErrorCode.FieldRecordNotFound,
      });
    const dataHash = recordFingerprint(record);
    const photo = record.photoId
      ? await this.photos.find(record.photoId)
      : null;
    const diskSha = photo ? await this.photos.hashOnDisk(photo) : null;
    const computedPhoto = diskSha ? photoHash(diskSha) : null;
    const onChain = await this.contracts
      .get('FieldRecordLog')
      .getEntry(uuidToBytes32(id));
    const onLedger = onChain.recordedAt !== 0n;
    const ledgerPhoto =
      onLedger && onChain.photoHash !== ZERO_BYTES32 ? onChain.photoHash : null;

    const mismatches: string[] = [];
    if (!onLedger) mismatches.push('notOnLedger');
    else {
      if (onChain.dataHash !== dataHash) mismatches.push('data');
      if (ledgerPhoto !== computedPhoto)
        mismatches.push(photo && !diskSha ? 'photoMissing' : 'photo');
    }
    return {
      matches: mismatches.length === 0,
      dataHash,
      ledgerDataHash: onLedger ? onChain.dataHash : null,
      photoHash: computedPhoto,
      ledgerPhotoHash: ledgerPhoto,
      mismatches,
    };
  }

  // --- Helpers ---

  private seesDrafts(actor: AuthUser): boolean {
    return EXACT_LOCATION.has(actor.role) || actor.role === Role.FieldOfficer;
  }

  private async projectFor(id: string): Promise<Project> {
    const project = await this.projectRepo.findOneBy({ id });
    if (!project) {
      throw new UnprocessableEntityException({
        message: 'Project not found',
        code: ErrorCode.ProjectNotFound,
      });
    }
    return project;
  }

  private async visibleRecord(
    actor: AuthUser,
    id: string,
  ): Promise<FieldRecord> {
    const record = await this.records.findOneBy({ id });
    if (!record)
      throw new NotFoundException({
        message: 'Field record not found',
        code: ErrorCode.FieldRecordNotFound,
      });
    await this.projects.visible(actor, record.projectId);
    if (record.status !== 'recorded' && !this.seesDrafts(actor)) {
      throw new NotFoundException({
        message: 'Field record not found',
        code: ErrorCode.FieldRecordNotFound,
      });
    }
    return record;
  }

  private async one(actor: AuthUser, id: string): Promise<FieldRecordDto> {
    const record = await this.visibleRecord(actor, id);
    const project = await this.projects.visible(actor, record.projectId);
    return (await this.dtos(actor, project, [record]))[0];
  }

  private async dtos(
    actor: AuthUser,
    project: Project,
    rows: FieldRecord[],
  ): Promise<FieldRecordDto[]> {
    if (rows.length === 0) return [];
    const [corrections, names, exact] = await Promise.all([
      this.records.find({
        where: { correctsEntryId: In(rows.map((r) => r.id)) },
        select: { id: true, correctsEntryId: true },
        order: { observedAt: 'ASC' },
      }),
      this.views.names(rows.map((r) => r.recordedById)),
      this.seesExactLocation(actor, project),
    ]);
    const correctedBy = new Map<string, string[]>();
    for (const c of corrections) {
      const list = correctedBy.get(c.correctsEntryId!) ?? [];
      list.push(c.id);
      correctedBy.set(c.correctsEntryId!, list);
    }
    return rows.map((r) => {
      const type = this.catalog.fieldRecordTypes.get(r.entryTypeCode);
      const defs = new Map((type?.measurements ?? []).map((m) => [m.key, m]));
      return {
        id: r.id,
        projectId: r.projectId,
        entryTypeCode: r.entryTypeCode,
        entryTypeName: type?.name ?? r.entryTypeCode,
        entryTypeNameBn: type?.nameBn ?? r.entryTypeCode,
        notes: r.notes,
        // In the record type's order (jsonb keeps its own key order).
        measurements: [
          ...[...defs.keys()].filter((k) => k in r.measurements),
          ...Object.keys(r.measurements).filter((k) => !defs.has(k)),
        ].map((key) => ({
          key,
          label: defs.get(key)?.label ?? key,
          labelBn: defs.get(key)?.labelBn ?? key,
          unit: defs.get(key)?.unit ?? null,
          value: r.measurements[key],
        })),
        location:
          r.latitude === null || r.longitude === null
            ? null
            : exact
              ? {
                  latitude: r.latitude,
                  longitude: r.longitude,
                  accuracyMeters: r.accuracyMeters,
                  exact: true,
                }
              : {
                  latitude: roundCoordinate(r.latitude),
                  longitude: roundCoordinate(r.longitude),
                  accuracyMeters: null,
                  exact: false,
                },
        photo:
          r.photoId && r.photoHash
            ? {
                id: r.photoId,
                url: `/api/field-records/${r.id}/photo`,
                photoHash: r.photoHash,
              }
            : null,
        correctsEntryId: r.correctsEntryId,
        correctedBy: correctedBy.get(r.id) ?? [],
        recordedBy: {
          id: r.recordedById,
          name: names.get(r.recordedById) ?? '',
        },
        observedAt: r.observedAt,
        recordedAt: r.recordedAt,
        status: r.status,
        dataHash: r.dataHash,
        txHash: r.txHash,
      };
    });
  }

  private async seesExactLocation(
    actor: AuthUser,
    project: Project,
  ): Promise<boolean> {
    if (EXACT_LOCATION.has(actor.role)) return true;
    if (actor.role === Role.Farmer) return project.farmerId === actor.id;
    if (actor.role === Role.FieldOfficer) {
      return this.users.exists({
        where: { id: project.farmerId, fieldOfficerId: actor.id },
      });
    }
    return false;
  }
}

/**
 * The data fingerprint registered on the ledger: every stored value in its
 * canonical form, bound to the record and project ids. The photo has its own
 * fingerprint (the file's SHA-256).
 */
export function recordFingerprint(
  r: Pick<
    FieldRecord,
    | 'id'
    | 'projectId'
    | 'entryTypeCode'
    | 'notes'
    | 'measurements'
    | 'latitude'
    | 'longitude'
    | 'accuracyMeters'
    | 'correctsEntryId'
    | 'observedAt'
  >,
): string {
  return fingerprint('field.record', {
    v: 1,
    entryId: r.id,
    projectId: r.projectId,
    entryType: r.entryTypeCode,
    notes: r.notes,
    measurements: r.measurements,
    latitude: r.latitude,
    longitude: r.longitude,
    accuracyMeters: r.accuracyMeters,
    correctsEntryId: r.correctsEntryId,
    observedAt: r.observedAt.toISOString(),
  });
}

function rejected(
  id: string,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): SyncResultDto {
  return {
    id,
    outcome: 'rejected',
    code,
    message,
    ...(details && { details }),
  };
}

function fromHttpError(id: string, error: unknown): SyncResultDto {
  if (!(error instanceof HttpException)) throw error;
  const body = error.getResponse() as {
    message?: string | string[];
    code?: string;
    details?: Record<string, unknown> & { problems?: Problem[] };
  };
  const message = Array.isArray(body.message)
    ? body.message.join('; ')
    : (body.message ?? error.message);
  const problems = body.details?.problems;
  return rejected(
    id,
    body.code ?? error.name,
    problems?.length
      ? `${message}: ${problems.map((p) => p.message).join('; ')}`
      : message,
    body.details,
  );
}
