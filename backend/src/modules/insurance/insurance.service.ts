import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ContractTransaction } from 'ethers';
import { Repository } from 'typeorm';
import { ChainClock } from '../../blockchain/chain-clock';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import type { InsuranceRegistry } from '../../blockchain/generated';
import { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import { TransactionService } from '../../blockchain/tx/transaction.service';
import { codeToBytes32, uuidToBytes32 } from '../../blockchain/utils/ids';
import { poishaToTaka, takaToPoisha } from '../../blockchain/utils/money';
import { Paginated } from '../../common/dto/pagination.dto';
import {
  BD_DISTRICTS,
  isDistrictCode,
} from '../../common/reference/bd-districts';
import { bdDate } from '../../common/time/bd-dates';
import type { AuthUser } from '../auth/auth-user';
import { CatalogService } from '../catalog/catalog.service';
import { Project } from '../projects/entities/project.entity';
import { ProjectStage } from '../projects/project.enums';
import { ProjectViews } from '../projects/project-views';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/roles';
import type {
  CoverageDto,
  CoverageVersionDto,
  EventTypeRefDto,
  InsuredProjectDto,
  InsuredProjectsQueryDto,
  ListWeatherEventsQueryDto,
  RecordWeatherEventDto,
  SetCoverageDto,
  WeatherEventDto,
} from './dto/insurance.dto';
import { CoverageTerms } from './entities/coverage-terms.entity';
import { WeatherEvent } from './entities/weather-event.entity';
import {
  coverageFingerprint,
  weatherEventFingerprint,
} from './insurance-fingerprints';
import { ErrorCode } from '../../common/errors/error-code';

export const STAFF: ReadonlySet<Role> = new Set([
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPERATIONS,
  Role.ACCOUNTS,
  Role.AUDITOR,
]);
/** Stages in which the crop is in the field: cover can be set and claims opened. */
const IN_FIELD: readonly ProjectStage[] = [
  ProjectStage.FUNDED,
  ProjectStage.ACTIVE,
];

/**
 * Crop insurance (InsuranceRegistry): an insurer's cover on insured projects
 * and the weather events claims cite. Each action checks the ledger's rules
 * first for a precise error; the contract checks again and has the final word.
 */
@Injectable()
export class InsuranceService {
  constructor(
    @InjectRepository(CoverageTerms)
    private readonly terms: Repository<CoverageTerms>,
    @InjectRepository(WeatherEvent)
    private readonly events: Repository<WeatherEvent>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly catalog: CatalogService,
    private readonly views: ProjectViews,
    private readonly contracts: ContractsRegistry,
    private readonly tx: TransactionService,
    private readonly applier: ReceiptApplier,
    private readonly clock: ChainClock,
  ) {}

  // --- Cover ---

  /**
   * Sets or changes the cover on an insured project whose crop is in the
   * field. The first insurer to cover it becomes its insurer; only they can
   * change it, and never below what has already been approved.
   */
  async setCoverage(
    actor: AuthUser,
    projectId: string,
    dto: SetCoverageDto,
  ): Promise<CoverageDto> {
    const project = await this.requireInsurable(projectId);
    const current = await this.currentCover(project.id);
    if (current && current.insurerId !== actor.id) {
      throw new ForbiddenException({
        message: 'Another insurer covers this project',
        code: ErrorCode.OTHER_INSURER,
      });
    }
    const maxAmount = takaToPoisha(dto.maxAmount);
    if (maxAmount <= 0n)
      throw new UnprocessableEntityException({
        message: 'maxAmount must be above zero',
        code: ErrorCode.AMOUNT_NOT_POSITIVE,
      });
    const approved = await this.registry().approvedTotal(
      uuidToBytes32(project.id),
    );
    if (maxAmount < approved) {
      throw new ConflictException({
        message: `Claims of ${poishaToTaka(approved)} taka are already approved; the cover cannot be less`,
        code: ErrorCode.COVERAGE_BELOW_APPROVED,
        details: { approvedTotal: poishaToTaka(approved) },
      });
    }
    const coveredEventTypes = dto.coveredEventTypes
      .map((code) => this.catalog.weatherEventTypes.requireActive(code).code)
      .sort();

    const version = this.terms.create({
      id: randomUUID(),
      projectId: project.id,
      insurerId: actor.id,
      maxAmount,
      coveredEventTypes,
      notes: dto.notes ?? null,
      previousTermsHash: current?.termsHash ?? null,
      status: 'submitted',
      recordedAt: null,
    });
    if (
      current &&
      current.maxAmount === version.maxAmount &&
      current.notes === version.notes &&
      current.coveredEventTypes.join() === version.coveredEventTypes.join()
    ) {
      throw new ConflictException({
        message: 'These are already the current terms',
        code: ErrorCode.COVER_UNCHANGED,
      });
    }
    version.termsHash = coverageFingerprint(version);
    // Identical terms from an attempt that never reached the ledger are reused.
    const pending = await this.terms.findOneBy({
      projectId: project.id,
      termsHash: version.termsHash,
    });
    if (!pending) await this.terms.insert(version);
    try {
      await this.send(actor, (c) =>
        c.setCoverage.populateTransaction(
          uuidToBytes32(project.id),
          maxAmount,
          version.termsHash,
        ),
      );
    } catch (error) {
      if (error instanceof ContractRevertException && !pending) {
        await this.terms.delete({ id: version.id, status: 'submitted' });
      }
      throw error;
    }
    return this.coverage(actor, project.id);
  }

  /** The current cover with what is left of it, and its earlier versions. */
  async coverage(actor: AuthUser, projectId: string): Promise<CoverageDto> {
    const project = await this.projects.findOneBy({ id: projectId });
    if (!project || !(await this.canSeeProject(actor, project))) {
      throw new NotFoundException({
        message: 'Project not found',
        code: ErrorCode.PROJECT_NOT_FOUND,
      });
    }
    const key = uuidToBytes32(projectId);
    const [versions, approvedTotal, openClaims] = await Promise.all([
      this.terms.find({
        where: { projectId, status: 'recorded' },
        order: { chainEventBlock: 'DESC', chainEventLog: 'DESC' },
      }),
      this.registry().approvedTotal(key),
      this.registry().openClaims(key),
    ]);
    const [current, ...history] = versions;
    if (!current)
      throw new NotFoundException({
        message: 'This project has no cover yet',
        code: ErrorCode.NO_COVERAGE,
      });
    const names = await this.views.names([current.insurerId]);
    const remaining = current.maxAmount - approvedTotal;
    return {
      projectId,
      insurer: {
        id: current.insurerId,
        name: names.get(current.insurerId) ?? '',
      },
      current: this.versionView(current),
      approvedTotal: poishaToTaka(approvedTotal),
      remaining: poishaToTaka(remaining > 0n ? remaining : 0n),
      openClaims: Number(openClaims),
      history: history.map((v) => this.versionView(v)),
    };
  }

  /**
   * Insured projects whose crop is in the field, with who covers each: what
   * an insurer chooses from. One query for the page and one for its covers.
   */
  async insuredProjects(
    q: InsuredProjectsQueryDto,
  ): Promise<Paginated<InsuredProjectDto>> {
    const qb = this.projects
      .createQueryBuilder('p')
      .where('p.insured AND p.stage IN (:...stages)', { stages: IN_FIELD });
    if (q.districtCode)
      qb.andWhere('p.district_code = :dc', { dc: q.districtCode });
    const [rows, total] = await qb
      .orderBy('p.published_at', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    const covers = await this.currentCovers(rows.map((p) => p.id));
    const names = await this.views.names(
      [...covers.values()].map((c) => c.insurerId),
    );
    const items = rows.map((p) => {
      const cover = covers.get(p.id);
      return {
        project: { id: p.id, name: p.title },
        district: districtRef(p.districtCode),
        produceCode: p.produceCode,
        stage: p.stage,
        insurer: cover
          ? { id: cover.insurerId, name: names.get(cover.insurerId) ?? '' }
          : null,
        maxAmount: cover ? poishaToTaka(cover.maxAmount) : null,
      };
    });
    return new Paginated(items, total, q);
  }

  // --- Weather events ---

  /** An admin or insurer records a weather event in a district; claims then cite it. */
  async recordWeatherEvent(
    actor: AuthUser,
    dto: RecordWeatherEventDto,
  ): Promise<WeatherEventDto> {
    const type = this.catalog.weatherEventTypes.requireActive(
      dto.eventTypeCode,
    );
    if (dto.occurredOn > bdDate(await this.clock.now())) {
      throw new UnprocessableEntityException({
        message: 'occurredOn cannot be in the future',
        code: ErrorCode.OCCURRED_IN_FUTURE,
      });
    }
    const event = this.events.create({
      id: randomUUID(),
      districtCode: dto.districtCode,
      eventTypeCode: type.code,
      occurredOn: dto.occurredOn,
      severity: dto.severity,
      notes: dto.notes ?? null,
      recordedById: actor.id,
      status: 'submitted',
      recordedAt: null,
    });
    event.detailsHash = weatherEventFingerprint(event);
    await this.events.insert(event);
    try {
      await this.send(actor, (c) =>
        c.recordWeatherEvent.populateTransaction(
          uuidToBytes32(event.id),
          codeToBytes32(event.districtCode),
          codeToBytes32(event.eventTypeCode),
          event.detailsHash,
        ),
      );
    } catch (error) {
      if (error instanceof ContractRevertException)
        await this.events.delete({ id: event.id });
      throw error;
    }
    return this.weatherEvent(event.id);
  }

  async listWeatherEvents(
    q: ListWeatherEventsQueryDto,
  ): Promise<Paginated<WeatherEventDto>> {
    const qb = this.events
      .createQueryBuilder('e')
      .where("e.status = 'recorded'");
    if (q.districtCode)
      qb.andWhere('e.district_code = :dc', { dc: q.districtCode });
    if (q.eventTypeCode)
      qb.andWhere('e.event_type_code = :tc', { tc: q.eventTypeCode });
    const [rows, total] = await qb
      .orderBy('e.occurred_on', 'DESC')
      .addOrderBy('e.created_at', 'DESC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    return new Paginated(await this.weatherEventDtos(rows), total, q);
  }

  async weatherEvent(id: string): Promise<WeatherEventDto> {
    const event = await this.events.findOneBy({ id });
    if (!event)
      throw new NotFoundException({
        message: 'Weather event not found',
        code: ErrorCode.WEATHER_EVENT_NOT_FOUND,
      });
    return (await this.weatherEventDtos([event]))[0];
  }

  async weatherEventDtos(rows: WeatherEvent[]): Promise<WeatherEventDto[]> {
    const names = await this.views.names(rows.map((e) => e.recordedById));
    return rows.map((e) => ({
      id: e.id,
      district: districtRef(e.districtCode),
      eventType: this.eventTypeRef(e.eventTypeCode),
      occurredOn: e.occurredOn,
      severity: e.severity,
      notes: e.notes,
      status: e.status,
      recordedAt: e.recordedAt,
      recordedBy: { id: e.recordedById, name: names.get(e.recordedById) ?? '' },
    }));
  }

  // --- Shared with claims ---

  /** The project's cover: its latest recorded version, or null. */
  async currentCover(projectId: string): Promise<CoverageTerms | null> {
    return this.terms.findOne({
      where: { projectId, status: 'recorded' },
      order: { chainEventBlock: 'DESC', chainEventLog: 'DESC' },
    });
  }

  /** Current cover of many projects in one query (DISTINCT ON over the current-cover index). */
  async currentCovers(
    projectIds: string[],
  ): Promise<Map<string, CoverageTerms>> {
    if (projectIds.length === 0) return new Map();
    const rows = await this.terms
      .createQueryBuilder('t')
      .distinctOn(['t.project_id'])
      .where("t.project_id IN (:...ids) AND t.status = 'recorded'", {
        ids: [...new Set(projectIds)],
      })
      .orderBy('t.project_id')
      .addOrderBy('t.chain_event_block', 'DESC')
      .addOrderBy('t.chain_event_log', 'DESC')
      .getMany();
    return new Map(rows.map((t) => [t.projectId, t]));
  }

  /** An insured project whose crop is in the field. */
  async requireInsurable(projectId: string): Promise<Project> {
    const project = await this.projects.findOneBy({ id: projectId });
    if (!project)
      throw new NotFoundException({
        message: 'Project not found',
        code: ErrorCode.PROJECT_NOT_FOUND,
      });
    if (!project.insured) {
      throw new ConflictException({
        message: 'This project is not insured',
        code: ErrorCode.NOT_INSURED,
      });
    }
    if (!IN_FIELD.includes(project.stage)) {
      throw new ConflictException({
        message: `Insurance applies while the crop is in the field (funded or active); this project is ${project.stage}`,
        code: ErrorCode.INSURANCE_PROJECT_STAGE,
        details: { stage: project.stage },
      });
    }
    return project;
  }

  /**
   * Staff see every project; an insurer the projects it covers; a field
   * officer their farmers'; a farmer their own.
   */
  async canSeeProject(actor: AuthUser, project: Project): Promise<boolean> {
    if (STAFF.has(actor.role)) return true;
    switch (actor.role) {
      case Role.INSURER:
        return this.terms.exists({
          where: {
            projectId: project.id,
            insurerId: actor.id,
            status: 'recorded',
          },
        });
      case Role.FIELD_OFFICER:
        return this.isOfficerOf(actor, project.farmerId);
      case Role.FARMER:
        return project.farmerId === actor.id;
      default:
        return false;
    }
  }

  async isOfficerOf(actor: AuthUser, farmerId: string): Promise<boolean> {
    if (actor.role !== Role.FIELD_OFFICER) return false;
    return this.users.exists({
      where: { id: farmerId, fieldOfficerId: actor.id },
    });
  }

  registry(): InsuranceRegistry {
    return this.contracts.get('InsuranceRegistry');
  }

  async send(
    actor: AuthUser,
    build: (c: InsuranceRegistry) => Promise<ContractTransaction>,
  ) {
    const result = await this.tx.send(
      actor.keyIndex,
      'InsuranceRegistry',
      build,
    );
    await this.applier.apply(result);
    return result;
  }

  eventTypeRef(code: string): EventTypeRefDto {
    const type = this.catalog.weatherEventTypes.get(code);
    return {
      code,
      name: type?.name ?? code,
      nameBn: type?.nameBn ?? code,
    };
  }

  private versionView(t: CoverageTerms): CoverageVersionDto {
    return {
      maxAmount: poishaToTaka(t.maxAmount),
      coveredEventTypes: t.coveredEventTypes.map((c) => this.eventTypeRef(c)),
      notes: t.notes,
      termsHash: t.termsHash,
      status: t.status,
      recordedAt: t.recordedAt,
    };
  }
}

export function districtRef(code: string): { code: string; name: string } {
  return {
    code,
    name: isDistrictCode(code) ? BD_DISTRICTS[code].name : code,
  };
}
