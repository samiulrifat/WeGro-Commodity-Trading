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
import { Brackets, Repository, type SelectQueryBuilder } from 'typeorm';
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
import {
  matchesWord,
  searchWords,
  wordPattern,
} from '../../common/search/words';
import { bdDate } from '../../common/time/bd-dates';
import type { AuthUser } from '../auth/auth-user';
import { CatalogService } from '../catalog/catalog.service';
import { Project } from '../projects/entities/project.entity';
import { ProjectStage } from '../projects/project.enums';
import { ProjectViews } from '../projects/project-views';
import { ChainState, User } from '../users/entities/user.entity';
import { PersonSearch } from '../users/person-search';
import { ParticipantStatus, Role } from '../users/roles';
import type {
  AssignInsurerDto,
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
import { InsurerAssignment } from './entities/insurer-assignment.entity';
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
 * SQL: assignment `a` is recorded and its project's latest. The latest
 * assignment is the project's insurer, as on the ledger.
 */
const latestAssignment = (a: string) =>
  `${a}.status = 'recorded' AND NOT EXISTS (
     SELECT 1 FROM insurer_assignments ial
      WHERE ial.project_id = ${a}.project_id AND ial.status = 'recorded'
        AND (ial.chain_event_block, ial.chain_event_log) > (${a}.chain_event_block, ${a}.chain_event_log))`;

/** SQL: the project in `projectCol` is assigned to the insurer in `insurer` (a column or :param). */
export const assignedTo = (projectCol: string, insurer: string) =>
  `EXISTS (SELECT 1 FROM insurer_assignments ia
            WHERE ia.project_id = ${projectCol} AND ia.insurer_id = ${insurer} AND ${latestAssignment('ia')})`;

/**
 * SQL: cover version `t` counts. It is recorded, and its insurer set it after
 * their current assignment; the ledger cleared any earlier terms when the
 * insurer was switched.
 */
const coverCounts = (t: string) =>
  `${t}.status = 'recorded' AND EXISTS (
     SELECT 1 FROM insurer_assignments ic
      WHERE ic.project_id = ${t}.project_id AND ic.insurer_id = ${t}.insurer_id
        AND (ic.chain_event_block, ic.chain_event_log) < (${t}.chain_event_block, ${t}.chain_event_log)
        AND ${latestAssignment('ic')})`;

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
    @InjectRepository(InsurerAssignment)
    private readonly assignments: Repository<InsurerAssignment>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly catalog: CatalogService,
    private readonly views: ProjectViews,
    private readonly contracts: ContractsRegistry,
    private readonly tx: TransactionService,
    private readonly applier: ReceiptApplier,
    private readonly clock: ChainClock,
    private readonly search: PersonSearch,
  ) {}

  // --- Insurer ---

  /**
   * An admin assigns a verified insurer to an insured project in the field.
   * Switching insurers is allowed until the project's first claim; the old
   * insurer's terms then no longer count, and the new one sets their own.
   */
  async assignInsurer(
    actor: AuthUser,
    projectId: string,
    dto: AssignInsurerDto,
  ): Promise<CoverageDto> {
    const project = await this.requireInsurable(projectId);
    const insurer = await this.users.findOne({
      where: { id: dto.insurerId },
      select: { id: true, role: true, status: true, chainState: true },
    });
    if (
      insurer?.role !== Role.INSURER ||
      insurer.status !== ParticipantStatus.VERIFIED ||
      insurer.chainState !== ChainState.CONFIRMED
    ) {
      throw new UnprocessableEntityException({
        message: 'Only a verified insurer can be assigned',
        code: ErrorCode.NOT_AN_INSURER,
      });
    }
    const key = uuidToBytes32(project.id);
    const [current, claims] = await Promise.all([
      this.currentAssignment(project.id),
      this.registry().claimCount(key),
    ]);
    if (current?.insurerId === insurer.id) {
      throw new ConflictException({
        message: 'This insurer is already assigned to the project',
        code: ErrorCode.INSURER_ALREADY_ASSIGNED,
      });
    }
    if (claims > 0n) {
      throw new ConflictException({
        message:
          'A claim was opened on this project, so its insurer can no longer be changed',
        code: ErrorCode.INSURER_FIXED,
      });
    }
    const row = this.assignments.create({
      projectId: project.id,
      insurerId: insurer.id,
      assignedById: actor.id,
      status: 'submitted',
      recordedAt: null,
    });
    await this.assignments.insert(row);
    try {
      await this.send(actor, (c) =>
        c.assignInsurer.populateTransaction(key, uuidToBytes32(insurer.id)),
      );
    } catch (error) {
      if (error instanceof ContractRevertException) {
        await this.assignments.delete({ id: row.id, status: 'submitted' });
      }
      throw error;
    }
    return this.coverage(actor, project.id);
  }

  /** The project's insurer: its latest recorded assignment, or null. */
  async currentAssignment(
    projectId: string,
  ): Promise<InsurerAssignment | null> {
    return this.assignments.findOne({
      where: { projectId, status: 'recorded' },
      order: { chainEventBlock: 'DESC', chainEventLog: 'DESC' },
    });
  }

  /** The insurer of many projects in one query (DISTINCT ON over the current-assignment index). */
  async currentAssignments(
    projectIds: string[],
  ): Promise<Map<string, InsurerAssignment>> {
    if (projectIds.length === 0) return new Map();
    const rows = await this.assignments
      .createQueryBuilder('a')
      .distinctOn(['a.project_id'])
      .where("a.project_id IN (:...ids) AND a.status = 'recorded'", {
        ids: [...new Set(projectIds)],
      })
      .orderBy('a.project_id')
      .addOrderBy('a.chain_event_block', 'DESC')
      .addOrderBy('a.chain_event_log', 'DESC')
      .getMany();
    return new Map(rows.map((a) => [a.projectId, a]));
  }

  // --- Cover ---

  /**
   * The assigned insurer sets or changes the cover on an insured project
   * whose crop is in the field, never below what has already been approved.
   */
  async setCoverage(
    actor: AuthUser,
    projectId: string,
    dto: SetCoverageDto,
  ): Promise<CoverageDto> {
    const project = await this.requireInsurable(projectId);
    const assignment = await this.currentAssignment(project.id);
    if (!assignment) {
      throw new ConflictException({
        message: 'No insurer is assigned to this project yet',
        code: ErrorCode.INSURER_NOT_ASSIGNED,
      });
    }
    if (assignment.insurerId !== actor.id) {
      throw new ForbiddenException({
        message: 'This project is assigned to another insurer',
        code: ErrorCode.OTHER_INSURER,
      });
    }
    const current = await this.currentCover(project.id);
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

  /**
   * An insured project's insurance: who insures it, the current cover with
   * what is left of it and its earlier versions, and where its claims stand.
   */
  async coverage(actor: AuthUser, projectId: string): Promise<CoverageDto> {
    const project = await this.projects.findOneBy({ id: projectId });
    if (!project || !(await this.canSeeProject(actor, project))) {
      throw new NotFoundException({
        message: 'Project not found',
        code: ErrorCode.PROJECT_NOT_FOUND,
      });
    }
    if (!project.insured) {
      throw new ConflictException({
        message: 'This project is not insured',
        code: ErrorCode.NOT_INSURED,
      });
    }
    const key = uuidToBytes32(projectId);
    const registry = this.registry();
    const [assignment, versions, approved, paid, open, unpaid, claims] =
      await Promise.all([
        this.currentAssignment(projectId),
        this.coverHistory(projectId),
        registry.approvedTotal(key),
        registry.paidTotal(key),
        registry.openClaims(key),
        registry.unpaidClaims(key),
        registry.claimCount(key),
      ]);
    const [current, ...history] = versions;
    const names = await this.views.names(
      [project.farmerId, assignment?.insurerId].filter((x) => x !== undefined),
    );
    const remaining = current ? current.maxAmount - approved : 0n;
    return {
      projectId,
      project: { id: project.id, name: project.title },
      farmer: { id: project.farmerId, name: names.get(project.farmerId) ?? '' },
      district: districtRef(project.districtCode),
      produceCode: project.produceCode,
      stage: project.stage,
      inField: IN_FIELD.includes(project.stage),
      insurer: assignment
        ? {
            id: assignment.insurerId,
            name: names.get(assignment.insurerId) ?? '',
          }
        : null,
      insurerFixed: claims > 0n,
      current: current ? this.versionView(current) : null,
      approvedTotal: poishaToTaka(approved),
      paidTotal: poishaToTaka(paid),
      remaining: poishaToTaka(remaining > 0n ? remaining : 0n),
      openClaims: Number(open),
      unpaidClaims: Number(unpaid),
      history: history.map((v) => this.versionView(v)),
    };
  }

  /** The project's cover versions that count, newest first: the current one, then earlier ones. */
  coverHistory(projectId: string): Promise<CoverageTerms[]> {
    return this.coverVersions()
      .andWhere('t.project_id = :projectId', { projectId })
      .getMany();
  }

  /** Whether the project's current insurer is `insurerId`. */
  isAssignedTo(projectId: string, insurerId: string): Promise<boolean> {
    return this.projects
      .createQueryBuilder('p')
      .where('p.id = :id', { id: projectId })
      .andWhere(assignedTo('p.id', ':me'), { me: insurerId })
      .getExists();
  }

  /** Cover versions that count, newest first. */
  private coverVersions(): SelectQueryBuilder<CoverageTerms> {
    return this.terms
      .createQueryBuilder('t')
      .where(coverCounts('t'))
      .orderBy('t.chain_event_block', 'DESC')
      .addOrderBy('t.chain_event_log', 'DESC');
  }

  /**
   * Insured projects whose crop is in the field, with their insurer and cover:
   * every one for staff, an insurer's own for them. Filtered by where they
   * stand with their insurer and searched by title words or the farmer.
   * One query for the page, one each for its insurers, covers and names.
   */
  async insuredProjects(
    actor: AuthUser,
    q: InsuredProjectsQueryDto,
  ): Promise<Paginated<InsuredProjectDto>> {
    const qb = this.projects
      .createQueryBuilder('p')
      .where('p.insured AND p.stage IN (:...stages)', { stages: IN_FIELD });
    if (actor.role === Role.INSURER) {
      qb.andWhere(assignedTo('p.id', ':me'), { me: actor.id });
    }
    if (q.districtCode)
      qb.andWhere('p.district_code = :dc', { dc: q.districtCode });
    const assigned = `EXISTS (SELECT 1 FROM insurer_assignments pa WHERE pa.project_id = p.id AND pa.status = 'recorded')`;
    const covered = `EXISTS (SELECT 1 FROM coverage_terms ct WHERE ct.project_id = p.id AND ${coverCounts('ct')})`;
    if (q.cover === 'unassigned') qb.andWhere(`NOT ${assigned}`);
    if (q.cover === 'no_cover') qb.andWhere(`${assigned} AND NOT ${covered}`);
    if (q.cover === 'covered') qb.andWhere(covered);
    this.searchProjects(qb, q.q);
    const [rows, total] = await qb
      .orderBy('p.published_at', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    const ids = rows.map((p) => p.id);
    const [assignments, covers] = await Promise.all([
      this.currentAssignments(ids),
      this.currentCovers(ids),
    ]);
    const names = await this.views.names([
      ...rows.map((p) => p.farmerId),
      ...[...assignments.values()].map((a) => a.insurerId),
    ]);
    const items = rows.map((p) => {
      const a = assignments.get(p.id);
      const cover = covers.get(p.id);
      return {
        project: { id: p.id, name: p.title },
        district: districtRef(p.districtCode),
        produceCode: p.produceCode,
        stage: p.stage,
        farmer: { id: p.farmerId, name: names.get(p.farmerId) ?? '' },
        insurer: a
          ? { id: a.insurerId, name: names.get(a.insurerId) ?? '' }
          : null,
        maxAmount: cover ? poishaToTaka(cover.maxAmount) : null,
      };
    });
    return new Paginated(items, total, q);
  }

  /** Words of the project title, or the farmer as a person (`p` is the project). */
  searchProjects(qb: SelectQueryBuilder<object>, q?: string): void {
    const text = (q ?? '').trim();
    if (!text) return;
    const words = searchWords(text);
    const farmer = this.search.condition('p.farmer_id', text, 'Farmer');
    qb.andWhere(
      new Brackets((b) => {
        b.where('1 = 0');
        if (words.length > 0) {
          b.orWhere(
            words.map((_, i) => `p.title ~* :pw${i}`).join(' AND '),
            Object.fromEntries(words.map((w, i) => [`pw${i}`, wordPattern(w)])),
          );
        }
        if (farmer) b.orWhere(farmer.sql, farmer.params);
      }),
    );
  }

  /** Weather event types whose name (English or Bengali) has every word. */
  eventTypesMatching(words: string[]): string[] {
    return this.catalog.weatherEventTypes
      .list(true)
      .filter((e) =>
        words.every((w) => matchesWord(e.name, w) || matchesWord(e.nameBn, w)),
      )
      .map((e) => e.code);
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
    const words = searchWords(q.q);
    if (words.length > 0) {
      // The lists are small and held in memory: words become codes, then one indexed filter.
      const types = this.eventTypesMatching(words);
      const districts = Object.entries(BD_DISTRICTS)
        .filter(([, d]) => words.every((w) => matchesWord(d.name, w)))
        .map(([code]) => code);
      qb.andWhere(
        new Brackets((b) => {
          b.where('1 = 0');
          if (types.length > 0)
            b.orWhere('e.event_type_code IN (:...qtypes)', { qtypes: types });
          if (districts.length > 0)
            b.orWhere('e.district_code IN (:...qdist)', { qdist: districts });
        }),
      );
    }
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

  /** The project's cover: its insurer's latest recorded version, or null. */
  async currentCover(projectId: string): Promise<CoverageTerms | null> {
    return this.coverVersions()
      .andWhere('t.project_id = :projectId', { projectId })
      .getOne();
  }

  /** Current cover of many projects in one query (DISTINCT ON over the current-cover index). */
  async currentCovers(
    projectIds: string[],
  ): Promise<Map<string, CoverageTerms>> {
    if (projectIds.length === 0) return new Map();
    const rows = await this.terms
      .createQueryBuilder('t')
      .distinctOn(['t.project_id'])
      .where('t.project_id IN (:...ids)', { ids: [...new Set(projectIds)] })
      .andWhere(coverCounts('t'))
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
   * Staff see every project; an insurer the projects assigned to it; a field
   * officer their farmers'; a farmer their own.
   */
  async canSeeProject(actor: AuthUser, project: Project): Promise<boolean> {
    if (STAFF.has(actor.role)) return true;
    switch (actor.role) {
      case Role.INSURER:
        return this.isAssignedTo(project.id, actor.id);
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
